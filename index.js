const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Password protection
const APP_PASSWORD = process.env.APP_PASSWORD || '';

// Environment variables for STA API
const SCIM_API_URL = process.env.SCIM_API_Endpoint_Url || '';
const API_KEY = process.env.API_KEY || '';
// BSIDCA SOAP endpoint for token provisioning
const BSIDCA_URL = process.env.BSIDCA_Endpoint_Url || 'https://cloud.eu.safenetid.com/bsidca/BSIDCA.asmx';
const BSIDCA_EMAIL = process.env.BSIDCA_Email || '';  // Operator email for authentication
const BSIDCA_USER = process.env.BSIDCA_User || '';    // Operator username
const BSIDCA_PASSWORD = process.env.BSIDCA_Password || '';
const ORGANIZATION = process.env.ORGANIZATION || '';

// BSIDCA session management
let bsidcaSessionCookie = null;
let bsidcaSessionExpiry = null;

// Middleware
app.use(express.json());

// Password protection middleware
const authMiddleware = (req, res, next) => {
  // Skip auth if no password is set
  if (!APP_PASSWORD) {
    return next();
  }

  // Allow health check without auth
  if (req.path === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="STA API Demo"');
    return res.status(401).send('Authentication required');
  }

  const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
  const [username, password] = credentials.split(':');

  // Accept any username, just check the password
  if (password === APP_PASSWORD) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="STA API Demo"');
  return res.status(401).send('Invalid credentials');
};

// Apply auth middleware to all routes
app.use(authMiddleware);

app.use(express.static('public'));

// Helper to mask sensitive data in headers
function maskSensitiveHeaders(headers) {
  const masked = { ...headers };
  if (masked.Authorization) {
    const parts = masked.Authorization.split(' ');
    if (parts.length === 2) {
      masked.Authorization = `${parts[0]} ${parts[1].substring(0, 8)}...***`;
    }
  }
  if (masked.Cookie) {
    masked.Cookie = masked.Cookie.substring(0, 20) + '...***';
  }
  return masked;
}

// Helper to mask sensitive data in SOAP envelope
function maskSoapEnvelope(soapXml) {
  // Mask password/OTP in Connect request
  let masked = soapXml.replace(
    /(<OTP>)(.*?)(<\/OTP>)/g,
    '$1***$3'
  );
  // Mask cookie values if present
  masked = masked.replace(
    /(ASP\.NET_SessionId=)([^;]+)/g,
    '$1***'
  );
  return masked;
}

// Helper to safely parse JSON response
async function safeParseResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { rawResponse: text, parseError: e.message };
  }
}

// Helper to parse SOAP response and extract result
function parseSoapResponse(xmlText, methodName) {
  try {
    // Extract the response element
    const resultPattern = new RegExp(`<${methodName}Response[^>]*>([\\s\\S]*?)<\/${methodName}Response>`, 'i');
    const match = xmlText.match(resultPattern);

    if (!match) {
      return { error: 'Could not parse SOAP response', rawResponse: xmlText };
    }

    const responseBody = match[1];

    // Extract all elements from the response
    const elements = {};
    const elementPattern = /<(\w+)>([^<]*)<\/\1>/g;
    let elementMatch;

    while ((elementMatch = elementPattern.exec(responseBody)) !== null) {
      const [, key, value] = elementMatch;
      elements[key] = value;
    }

    return { parsed: elements, rawResponse: xmlText };
  } catch (e) {
    return { error: e.message, rawResponse: xmlText };
  }
}

// Helper to extract array elements from SOAP response
function parseSoapArrayResponse(xmlText, methodName, arrayElementName) {
  try {
    const resultPattern = new RegExp(`<${methodName}Response[^>]*>([\\s\\S]*?)<\/${methodName}Response>`, 'i');
    const match = xmlText.match(resultPattern);

    if (!match) {
      return { error: 'Could not parse SOAP response', rawResponse: xmlText };
    }

    const responseBody = match[1];
    const items = [];

    // Extract array elements
    const elementPattern = new RegExp(`<${arrayElementName}>([^<]*)<\/${arrayElementName}>`, 'g');
    let elementMatch;

    while ((elementMatch = elementPattern.exec(responseBody)) !== null) {
      items.push(elementMatch[1]);
    }

    return { parsed: items, rawResponse: xmlText };
  } catch (e) {
    return { error: e.message, rawResponse: xmlText };
  }
}

// BSIDCA: Authenticate and establish session
async function connectBSIDCA() {
  // Check if we have a valid session
  if (bsidcaSessionCookie && bsidcaSessionExpiry && Date.now() < bsidcaSessionExpiry) {
    return { success: true, cookie: bsidcaSessionCookie, cached: true };
  }

  // Use BSIDCA_EMAIL for operator email, fall back to BSIDCA_USER if not set
  const operatorEmail = BSIDCA_EMAIL || BSIDCA_USER;

  if (!operatorEmail || !BSIDCA_PASSWORD) {
    return { success: false, error: 'BSIDCA credentials not configured (need BSIDCA_Email and BSIDCA_Password)' };
  }

  // Build SOAP envelope for Connect
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Connect xmlns="http://www.cryptocard.com/blackshield/">
      <OperatorEmail>${operatorEmail}</OperatorEmail>
      <OTP>${BSIDCA_PASSWORD}</OTP>
    </Connect>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch(BSIDCA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.cryptocard.com/blackshield/Connect'
      },
      body: soapEnvelope
    });

    const responseText = await response.text();
    const parsed = parseSoapResponse(responseText, 'Connect');

    // Extract session cookie from response headers
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      bsidcaSessionCookie = setCookie.split(';')[0]; // Get just the cookie value
      bsidcaSessionExpiry = Date.now() + (20 * 60 * 1000); // Session valid for 20 minutes
    }

    const connectResult = parsed.parsed?.ConnectResult || 'UNKNOWN';

    if (connectResult === 'AUTH_SUCCESS') {
      return {
        success: true,
        cookie: bsidcaSessionCookie,
        result: connectResult,
        parsed: parsed.parsed
      };
    } else if (connectResult === 'CHALLENGE') {
      return {
        success: false,
        error: 'Challenge authentication not supported in this demo',
        result: connectResult,
        challenge: parsed.parsed?.challenge
      };
    } else {
      return {
        success: false,
        error: `Authentication failed: ${connectResult}`,
        result: connectResult,
        parsed: parsed.parsed
      };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Health check / status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configured: {
      scim: !!(SCIM_API_URL && API_KEY),
      bsidca: !!((BSIDCA_EMAIL || BSIDCA_USER) && BSIDCA_PASSWORD && ORGANIZATION)
    },
    endpoints: {
      scim: SCIM_API_URL || 'NOT SET',
      bsidca: BSIDCA_URL
    },
    credentials: {
      bsidca_email: BSIDCA_EMAIL ? 'SET' : 'NOT SET',
      bsidca_user: BSIDCA_USER ? 'SET' : 'NOT SET',
      bsidca_password: BSIDCA_PASSWORD ? 'SET' : 'NOT SET',
      organization: ORGANIZATION ? 'SET' : 'NOT SET'
    },
    note: 'Token provisioning requires BSIDCA SOAP API credentials (operator login)'
  });
});

// SCIM: List Users
app.get('/api/scim/users', async (req, res) => {
  if (!SCIM_API_URL || !API_KEY) {
    return res.status(500).json({ error: 'SCIM API not configured' });
  }

  const requestUrl = `${SCIM_API_URL}Users`;
  const requestHeaders = {
    'Accept': 'application/scim+json',
    'Authorization': `Bearer ${API_KEY}`
  };

  try {
    const response = await fetch(requestUrl, {
      headers: requestHeaders
    });
    const data = await safeParseResponse(response);
    res.json({
      success: response.ok,
      status: response.status,
      data: data,
      debug: {
        request: {
          method: 'GET',
          url: requestUrl,
          headers: maskSensitiveHeaders(requestHeaders),
          body: null
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'content-type': response.headers.get('content-type')
          }
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SCIM: Create User
app.post('/api/scim/users', async (req, res) => {
  if (!SCIM_API_URL || !API_KEY) {
    return res.status(500).json({ error: 'SCIM API not configured' });
  }

  const { userId, email, givenName, familyName } = req.body;

  // Build SCIM payload
  // userName is the unique identifier for the user (required by SCIM)
  // externalId can be used for external system identifiers
  // emails array contains the email address(es)
  const payload = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: userId,  // Use the User ID as the SCIM userName
    externalId: userId,  // Also set as externalId for reference
    name: {
      givenName: givenName,
      familyName: familyName
    },
    emails: [{
      value: email,
      type: "work",
      primary: true
    }],
    active: true
  };

  const requestUrl = `${SCIM_API_URL}Users`;
  const requestHeaders = {
    'Content-Type': 'application/scim+json',
    'Accept': 'application/scim+json',
    'Authorization': `Bearer ${API_KEY}`
  };

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload)
    });
    const data = await safeParseResponse(response);
    res.json({
      success: response.ok,
      status: response.status,
      data: data,
      debug: {
        request: {
          method: 'POST',
          url: requestUrl,
          headers: maskSensitiveHeaders(requestHeaders),
          body: payload,
          note: 'userName and externalId both set to userId, email stored separately in emails array'
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'content-type': response.headers.get('content-type')
          }
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SCIM: Delete User
app.delete('/api/scim/users/:id', async (req, res) => {
  if (!SCIM_API_URL || !API_KEY) {
    return res.status(500).json({ error: 'SCIM API not configured' });
  }

  const requestUrl = `${SCIM_API_URL}Users/${req.params.id}`;
  const requestHeaders = {
    'Accept': 'application/scim+json',
    'Authorization': `Bearer ${API_KEY}`
  };

  try {
    const response = await fetch(requestUrl, {
      method: 'DELETE',
      headers: requestHeaders
    });
    const data = await safeParseResponse(response);
    res.json({
      success: response.ok,
      status: response.status,
      data: data,
      debug: {
        request: {
          method: 'DELETE',
          url: requestUrl,
          headers: maskSensitiveHeaders(requestHeaders),
          body: null
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'content-type': response.headers.get('content-type')
          }
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to XML-escape strings for SOAP
function xmlEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// BSIDCA SOAP: Provision Token (ProvisionUsers method)
app.post('/api/tokens', async (req, res) => {
  const { userName, tokenType = 'Software', description = '', organization } = req.body;
  const org = organization || ORGANIZATION;

  if ((!BSIDCA_EMAIL && !BSIDCA_USER) || !BSIDCA_PASSWORD) {
    return res.json({
      success: false,
      error: 'BSIDCA credentials not configured',
      note: 'Token provisioning requires BSIDCA SOAP API. Set BSIDCA_Email, BSIDCA_Password, and ORGANIZATION environment variables.',
      documentation: {
        message: 'The STA REST API does not support token provisioning. You must use the BSIDCA SOAP API.',
        endpoints: {
          'ProvisionUsers': 'Provision a list of users with a token',
          'AssignToken': 'Assign an existing token to a user',
          'GetMobilePASSProvisioningActivationCode': 'Get activation code for MobilePASS'
        },
        validTokenClasses: ['Software', 'Custom', 'Oath', 'SMS', 'Password', 'KT', 'RB', 'ICE', 'GOLD', 'eToken', 'MobilePASS', 'GoogleAuthenticator'],
        note: 'MobilePASS and Software are both valid for software tokens. MobilePASS is specifically for the MobilePASS+ app.',
        reference: 'https://thalesdocs.com/sta/api/bsidca/bsidca-endpoints/bsidca-token/index.html'
      },
      debug: {
        attempted: {
          userName,
          tokenType,
          organization: org
        }
      }
    });
  }

  // First, authenticate with BSIDCA
  const authResult = await connectBSIDCA();
  if (!authResult.success) {
    return res.json({
      success: false,
      error: 'BSIDCA authentication failed',
      authError: authResult.error,
      debug: authResult
    });
  }

  // XML-escape all parameters to prevent issues with special characters like @ in email addresses
  const escapedUserName = xmlEscape(userName);
  const escapedTokenType = xmlEscape(tokenType);
  const escapedDescription = xmlEscape(description);
  const escapedOrg = xmlEscape(org);

  // Build SOAP envelope for ProvisionUsers with correct structure and proper XML escaping
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ProvisionUsers xmlns="http://www.cryptocard.com/blackshield/">
      <userNames>
        <string>${escapedUserName}</string>
      </userNames>
      <tokenClass>${escapedTokenType}</tokenClass>
      <description>${escapedDescription}</description>
      <organization>${escapedOrg}</organization>
    </ProvisionUsers>
  </soap:Body>
</soap:Envelope>`;

  try {
    const headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.cryptocard.com/blackshield/ProvisionUsers'
    };

    // Add session cookie if available
    if (authResult.cookie) {
      headers['Cookie'] = authResult.cookie;
    }

    const response = await fetch(BSIDCA_URL, {
      method: 'POST',
      headers: headers,
      body: soapEnvelope
    });

    const responseText = await response.text();
    const parsed = parseSoapArrayResponse(responseText, 'ProvisionUsers', 'ProvisioningResult');

    // Determine success based on response
    const results = parsed.parsed || [];
    const allSuccess = results.length > 0 && results.every(r =>
      r === 'ProvisionSuccess' || r === 'EmailSent' || r === 'SMSSent'
    );

    // Check if response was empty
    if (results.length === 0) {
      return res.json({
        success: false,
        status: response.status,
        authenticated: authResult.cached ? 'cached_session' : 'new_session',
        error: 'Empty provisioning response - this usually means the user does not exist in the organization',
        provisioningResults: results,
        data: parsed,
        recommendation: 'Please ensure the user exists in the STA organization before provisioning a token. You can create users via the SCIM API endpoint.',
        debug: {
          request: {
            method: 'POST',
            url: BSIDCA_URL,
            headers: maskSensitiveHeaders(headers),
            soapAction: 'ProvisionUsers',
            contentType: 'SOAP/XML',
            soapEnvelope: maskSoapEnvelope(soapEnvelope),
            parameters: { userName, tokenType, description, organization: org }
          },
          response: {
            status: response.status,
            statusText: response.statusText,
            headers: {
              'content-type': response.headers.get('content-type')
            },
            bodyPreview: responseText.substring(0, 500) + '...'
          }
        }
      });
    }

    res.json({
      success: response.ok && allSuccess,
      status: response.status,
      authenticated: authResult.cached ? 'cached_session' : 'new_session',
      provisioningResults: results,
      data: parsed,
      debug: {
        request: {
          method: 'POST',
          url: BSIDCA_URL,
          headers: maskSensitiveHeaders(headers),
          soapAction: 'ProvisionUsers',
          contentType: 'SOAP/XML',
          soapEnvelope: maskSoapEnvelope(soapEnvelope),
          parameters: { userName, tokenType, description, organization: org }
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'content-type': response.headers.get('content-type')
          }
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BSIDCA SOAP: Get MobilePASS Activation Code
app.post('/api/tokens/activation-code', async (req, res) => {
  const { userName, taskID, organization } = req.body;
  const org = organization || ORGANIZATION;

  if ((!BSIDCA_EMAIL && !BSIDCA_USER) || !BSIDCA_PASSWORD) {
    return res.json({
      success: false,
      error: 'BSIDCA credentials not configured'
    });
  }

  if (!userName || !taskID) {
    return res.json({
      success: false,
      error: 'userName and taskID are required'
    });
  }

  // First, authenticate with BSIDCA
  const authResult = await connectBSIDCA();
  if (!authResult.success) {
    return res.json({
      success: false,
      error: 'BSIDCA authentication failed',
      authError: authResult.error,
      debug: authResult
    });
  }

  // Build SOAP envelope for GetMobilePASSProvisioningActivationCode
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetMobilePASSProvisioningActivationCode xmlns="http://www.cryptocard.com/blackshield/">
      <userName>${userName}</userName>
      <taskID>${taskID}</taskID>
      <organization>${org}</organization>
    </GetMobilePASSProvisioningActivationCode>
  </soap:Body>
</soap:Envelope>`;

  try {
    const headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.cryptocard.com/blackshield/GetMobilePASSProvisioningActivationCode'
    };

    // Add session cookie if available
    if (authResult.cookie) {
      headers['Cookie'] = authResult.cookie;
    }

    const response = await fetch(BSIDCA_URL, {
      method: 'POST',
      headers: headers,
      body: soapEnvelope
    });

    const responseText = await response.text();
    const parsed = parseSoapResponse(responseText, 'GetMobilePASSProvisioningActivationCode');

    const activationCode = parsed.parsed?.GetMobilePASSProvisioningActivationCodeResult;

    res.json({
      success: response.ok && !!activationCode,
      status: response.status,
      authenticated: authResult.cached ? 'cached_session' : 'new_session',
      activationCode: activationCode,
      data: parsed,
      debug: {
        request: {
          method: 'POST',
          url: BSIDCA_URL,
          headers: maskSensitiveHeaders(headers),
          soapAction: 'GetMobilePASSProvisioningActivationCode',
          contentType: 'SOAP/XML',
          soapEnvelope: maskSoapEnvelope(soapEnvelope),
          parameters: { userName, taskID, organization: org }
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'content-type': response.headers.get('content-type')
          }
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Info endpoint about token provisioning
app.get('/api/tokens/info', (req, res) => {
  res.json({
    message: 'Token provisioning in STA requires the BSIDCA SOAP API',
    scimApiSupports: ['Create User', 'Read User', 'Update User', 'Delete User'],
    bsidcaApiSupports: ['ProvisionUsers', 'AssignToken', 'ActivateToken', 'SuspendToken', 'GetMobilePASSProvisioningActivationCode'],
    validTokenClasses: {
      list: ['Software', 'Custom', 'Oath', 'SMS', 'Password', 'KT', 'RB', 'ICE', 'GOLD', 'eToken', 'MobilePASS', 'GoogleAuthenticator'],
      note: 'MobilePASS is for MobilePASS+ app, Software is for generic TOTP tokens, GoogleAuthenticator for Google Authenticator app'
    },
    workflow: {
      step1: 'Create user via SCIM API (working)',
      step2: 'Provision token via BSIDCA SOAP API (requires operator credentials)',
      step3: 'User receives activation email or you can get activation code via GetMobilePASSProvisioningActivationCode',
      important: 'User MUST exist in the organization before provisioning tokens. Empty ProvisionUsersResponse means user does not exist.'
    },
    requiredEnvVars: {
      forScim: ['SCIM_API_Endpoint_Url', 'API_KEY'],
      forBsidca: ['BSIDCA_Email', 'BSIDCA_Password', 'ORGANIZATION']
    },
    documentation: [
      'https://thalesdocs.com/sta/api/bsidca/bsidca-endpoints/bsidca-token/index.html',
      'https://thalesdocs.com/sta/api/bsidca/bsidca-endpoints/bsidca-mobilepass/index.html'
    ]
  });
});

// Health check for Railway
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`SCIM API: ${SCIM_API_URL || 'NOT SET'}`);
  console.log(`BSIDCA: ${BSIDCA_URL}`);
  console.log(`API Key: ${API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`BSIDCA Email: ${BSIDCA_EMAIL ? 'SET' : 'NOT SET'}`);
  console.log(`BSIDCA User: ${BSIDCA_USER ? 'SET' : 'NOT SET'}`);
  console.log(`BSIDCA Password: ${BSIDCA_PASSWORD ? 'SET' : 'NOT SET'}`);
  console.log(`Organization: ${ORGANIZATION ? 'SET' : 'NOT SET'}`);
});
