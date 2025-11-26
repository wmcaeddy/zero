const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables for STA API
const SCIM_API_URL = process.env.SCIM_API_Endpoint_Url || '';
const API_KEY = process.env.API_KEY || '';
// BSIDCA SOAP endpoint for token provisioning
const BSIDCA_URL = process.env.BSIDCA_Endpoint_Url || 'https://cloud.eu.safenetid.com/bsidca/BSIDCA.asmx';
const BSIDCA_USER = process.env.BSIDCA_User || '';
const BSIDCA_PASSWORD = process.env.BSIDCA_Password || '';
const ORGANIZATION = process.env.ORGANIZATION || '';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Helper to safely parse JSON response
async function safeParseResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { rawResponse: text, parseError: e.message };
  }
}

// Health check / status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configured: {
      scim: !!(SCIM_API_URL && API_KEY),
      bsidca: !!(BSIDCA_USER && BSIDCA_PASSWORD && ORGANIZATION)
    },
    endpoints: {
      scim: SCIM_API_URL || 'NOT SET',
      bsidca: BSIDCA_URL
    },
    note: 'Token provisioning requires BSIDCA SOAP API credentials (operator login)'
  });
});

// SCIM: List Users
app.get('/api/scim/users', async (req, res) => {
  if (!SCIM_API_URL || !API_KEY) {
    return res.status(500).json({ error: 'SCIM API not configured' });
  }

  try {
    const response = await fetch(`${SCIM_API_URL}Users`, {
      headers: {
        'Accept': 'application/scim+json',
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    const data = await safeParseResponse(response);
    res.json({
      success: response.ok,
      status: response.status,
      data: data,
      debug: {
        method: 'GET',
        url: `${SCIM_API_URL}Users`,
        headers: { 'Accept': 'application/scim+json', 'Authorization': 'Bearer ***' }
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

  const { userName, givenName, familyName, email } = req.body;
  const payload = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: userName,
    name: { givenName, familyName },
    emails: [{ value: email || userName, type: "work", primary: true }],
    active: true
  };

  try {
    const response = await fetch(`${SCIM_API_URL}Users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/scim+json',
        'Accept': 'application/scim+json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const data = await safeParseResponse(response);
    res.json({
      success: response.ok,
      status: response.status,
      data: data,
      debug: {
        method: 'POST',
        url: `${SCIM_API_URL}Users`,
        body: payload
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

  try {
    const response = await fetch(`${SCIM_API_URL}Users/${req.params.id}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/scim+json',
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    const data = await safeParseResponse(response);
    res.json({
      success: response.ok,
      status: response.status,
      data: data,
      debug: {
        method: 'DELETE',
        url: `${SCIM_API_URL}Users/${req.params.id}`
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BSIDCA SOAP: Provision Token (ProvisionUsers method)
app.post('/api/tokens', async (req, res) => {
  const { userName, tokenType = 'MP', organization } = req.body;
  const org = organization || ORGANIZATION;

  if (!BSIDCA_USER || !BSIDCA_PASSWORD) {
    return res.json({
      success: false,
      error: 'BSIDCA credentials not configured',
      note: 'Token provisioning requires BSIDCA SOAP API. Set BSIDCA_User, BSIDCA_Password, and ORGANIZATION environment variables.',
      documentation: {
        message: 'The STA REST API does not support token provisioning. You must use the BSIDCA SOAP API.',
        endpoints: {
          'ProvisionUsers': 'Provision a list of users with a token',
          'AssignToken': 'Assign an existing token to a user',
          'GetMobilePASSProvisioningActivationCode': 'Get activation code for MobilePASS'
        },
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

  // Build SOAP envelope for ProvisionUsers
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:bsid="http://www.cryptocard.com/blackshield/">
  <soap:Body>
    <bsid:ProvisionUsers>
      <bsid:userNames>
        <bsid:string>${userName}</bsid:string>
      </bsid:userNames>
      <bsid:tokenClass>${tokenType}</bsid:tokenClass>
      <bsid:organization>${org}</bsid:organization>
    </bsid:ProvisionUsers>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch(BSIDCA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.cryptocard.com/blackshield/ProvisionUsers'
      },
      body: soapEnvelope
    });

    const responseText = await response.text();

    res.json({
      success: response.ok,
      status: response.status,
      data: { rawResponse: responseText },
      debug: {
        method: 'POST (SOAP)',
        url: BSIDCA_URL,
        soapAction: 'ProvisionUsers',
        body: { userName, tokenType, organization: org }
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
    workflow: {
      step1: 'Create user via SCIM API (working)',
      step2: 'Provision token via BSIDCA SOAP API (requires operator credentials)',
      step3: 'User receives activation email'
    },
    requiredEnvVars: {
      forScim: ['SCIM_API_Endpoint_Url', 'API_KEY'],
      forBsidca: ['BSIDCA_User', 'BSIDCA_Password', 'ORGANIZATION']
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
  console.log(`BSIDCA Auth: ${BSIDCA_USER ? 'SET' : 'NOT SET'}`);
});
