const express = require('express');
const path = require('path');
const fs = require('fs');

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

// SAS (Local SafeNet Authentication Service) environment variables
const SAS_URL = process.env.SAS_Endpoint_Url || '';
const SAS_USER = process.env.SAS_User || '';
const SAS_PASSWORD = process.env.SAS_Password || '';
const SAS_ORGANIZATION = process.env.SAS_ORGANIZATION || '';

// BSIDCA session management
let bsidcaSessionCookie = null;
let bsidcaSessionExpiry = null;

// SAS session management
let sasSessionCookie = null;
let sasSessionExpiry = null;

// Persistent storage configuration
const PERSISTENT_DATA_PATH = '/app/data';
const SAS_CACHE_FILE = path.join(PERSISTENT_DATA_PATH, 'sas_users_cache.json');

// Check if persistent storage is available
function isPersistentStorageAvailable() {
  try {
    if (fs.existsSync(PERSISTENT_DATA_PATH)) {
      // Test write access
      const testFile = path.join(PERSISTENT_DATA_PATH, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return true;
    }
    return false;
  } catch (err) {
    console.log('Persistent storage not available:', err.message);
    return false;
  }
}

// Save SAS cache to persistent storage
function saveSasCacheToDisk() {
  if (!isPersistentStorageAvailable()) return false;

  try {
    const cacheData = {
      users: sasUsersCache.users,
      usersWithDetails: sasUsersCache.usersWithDetails,
      timestamp: sasUsersCache.timestamp,
      detailsFetched: sasUsersCache.detailsFetched,
      organization: SAS_ORGANIZATION
    };
    fs.writeFileSync(SAS_CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`SAS cache saved to disk: ${sasUsersCache.usersWithDetails.length} users`);
    return true;
  } catch (err) {
    console.log('Failed to save SAS cache to disk:', err.message);
    return false;
  }
}

// --- ZERO NETWORKS DATA STORE ---
const DATA_DIR = path.join(__dirname, 'data');
const ASSETS_FILE = path.join(DATA_DIR, 'assets.json');
const POLICIES_FILE = path.join(DATA_DIR, 'policies.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');

// Ensure data dir exists (redundant if mkdir run, but safe)
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { }
}

// Helper to read/write JSON
function readJson(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { return []; }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (e) { return false; }
}

// API: Assets
app.get('/api/assets', (req, res) => {
  res.json({ success: true, data: readJson(ASSETS_FILE) });
});

app.post('/api/assets', (req, res) => {
  const { name, ip, os } = req.body;
  if (!name || !ip) return res.status(400).json({ success: false, error: 'Name and IP required' });

  const assets = readJson(ASSETS_FILE);
  const newAsset = { id: Date.now().toString(), name, ip, os: os || 'Linux', created: new Date() };
  assets.push(newAsset);
  writeJson(ASSETS_FILE, assets);

  res.json({ success: true, data: newAsset });
});

app.delete('/api/assets/:id', (req, res) => {
  const assets = readJson(ASSETS_FILE);
  const filtered = assets.filter(a => a.id !== req.params.id);
  writeJson(ASSETS_FILE, filtered);
  res.json({ success: true });
});

// API: Policies
app.get('/api/policies', (req, res) => {
  res.json({ success: true, data: readJson(POLICIES_FILE) });
});

app.post('/api/policies', (req, res) => {
  const { user, assetId, port, action } = req.body; // user can be email or '*'
  if (!assetId || !port) return res.status(400).json({ success: false, error: 'Asset and Port required' });

  const policies = readJson(POLICIES_FILE);
  const newPolicy = {
    id: Date.now().toString(),
    user: user || '*',
    assetId,
    port: parseInt(port),
    action: action || 'allow',
    created: new Date()
  };
  policies.push(newPolicy);
  writeJson(POLICIES_FILE, policies);

  res.json({ success: true, data: newPolicy });
});

app.delete('/api/policies/:id', (req, res) => {
  const policies = readJson(POLICIES_FILE);
  const filtered = policies.filter(p => p.id !== req.params.id);
  writeJson(POLICIES_FILE, filtered);
  res.json({ success: true });
});

// Audit Helper
function logAudit(user, action, details, success) {
  const logs = readJson(AUDIT_FILE);
  logs.unshift({
    timestamp: new Date(),
    user,
    action,
    details,
    success
  });
  // Keep last 1000 logs
  if (logs.length > 1000) logs.pop();
  writeJson(AUDIT_FILE, logs);
}

app.get('/api/audit', (req, res) => {
  res.json({ success: true, data: readJson(AUDIT_FILE) });
});

// Load SAS cache from persistent storage
function loadSasCacheFromDisk() {
  if (!isPersistentStorageAvailable()) return false;

  try {
    if (!fs.existsSync(SAS_CACHE_FILE)) {
      console.log('No SAS cache file found on disk');
      return false;
    }

    const cacheData = JSON.parse(fs.readFileSync(SAS_CACHE_FILE, 'utf8'));

    // Validate cache is for same organization
    if (cacheData.organization !== SAS_ORGANIZATION) {
      console.log('SAS cache is for different organization, ignoring');
      return false;
    }

    // Disk cache has no TTL - persists until explicit refresh
    const cacheAge = Date.now() - cacheData.timestamp;

    // Restore cache
    sasUsersCache.users = cacheData.users || [];
    sasUsersCache.usersWithDetails = cacheData.usersWithDetails || [];
    sasUsersCache.timestamp = cacheData.timestamp;
    sasUsersCache.detailsFetched = cacheData.detailsFetched || false;

    console.log(`SAS cache loaded from disk: ${sasUsersCache.usersWithDetails.length} users (${Math.round(cacheAge / 1000)}s old)`);
    return true;
  } catch (err) {
    console.log('Failed to load SAS cache from disk:', err.message);
    return false;
  }
}

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

// Helper to parse DataTable XML response (used by GetUsers)
function parseDataTableResponse(xmlText) {
  try {
    const users = [];

    // Extract each user row from the diffgram - can be <users> or <Table> elements
    const rowPattern = /<users[^>]*>([\s\S]*?)<\/users>|<Table[^>]*>([\s\S]*?)<\/Table>/g;
    let rowMatch;

    while ((rowMatch = rowPattern.exec(xmlText)) !== null) {
      const rowContent = rowMatch[1] || rowMatch[2];
      const user = {};

      // Extract common user fields (case-insensitive)
      const fields = ['userid', 'username', 'firstname', 'lastname', 'email', 'mobile', 'locked', 'container', 'containername', 'authmethod', 'authstate', 'accountStatus'];
      fields.forEach(field => {
        const fieldPattern = new RegExp(`<${field}>([^<]*)<\/${field}>`, 'i');
        const fieldMatch = rowContent.match(fieldPattern);
        if (fieldMatch) {
          user[field.toLowerCase()] = fieldMatch[1];
        }
      });

      // Normalize: userid -> username if username not present
      if (user.userid && !user.username) {
        user.username = user.userid;
      }

      if (user.username || user.userid) {
        users.push(user);
      }
    }

    return { users, rawResponse: xmlText };
  } catch (e) {
    return { error: e.message, users: [], rawResponse: xmlText };
  }
}

// SAS: Authenticate and establish session
async function connectSAS() {
  // Check if we have a valid session
  if (sasSessionCookie && sasSessionExpiry && Date.now() < sasSessionExpiry) {
    return { success: true, cookie: sasSessionCookie, cached: true };
  }

  if (!SAS_URL || !SAS_USER || !SAS_PASSWORD) {
    return { success: false, error: 'SAS credentials not configured (need SAS_Endpoint_Url, SAS_User, and SAS_Password)' };
  }

  // Build SOAP envelope for Connect
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Connect xmlns="http://www.cryptocard.com/blackshield/">
      <OperatorEmail>${xmlEscape(SAS_USER)}</OperatorEmail>
      <OTP>${xmlEscape(SAS_PASSWORD)}</OTP>
    </Connect>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch(SAS_URL, {
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
      sasSessionCookie = setCookie.split(';')[0];
      sasSessionExpiry = Date.now() + (20 * 60 * 1000); // Session valid for 20 minutes
    }

    const connectResult = parsed.parsed?.ConnectResult || 'UNKNOWN';

    if (connectResult === 'AUTH_SUCCESS') {
      return {
        success: true,
        cookie: sasSessionCookie,
        result: connectResult,
        parsed: parsed.parsed
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
  const persistentAvailable = isPersistentStorageAvailable();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configured: {
      scim: !!(SCIM_API_URL && API_KEY),
      bsidca: !!((BSIDCA_EMAIL || BSIDCA_USER) && BSIDCA_PASSWORD && ORGANIZATION),
      sas: !!(SAS_URL && SAS_USER && SAS_PASSWORD && SAS_ORGANIZATION)
    },
    endpoints: {
      scim: SCIM_API_URL || 'NOT SET',
      bsidca: BSIDCA_URL,
      sas: SAS_URL || 'NOT SET'
    },
    credentials: {
      bsidca_email: BSIDCA_EMAIL ? 'SET' : 'NOT SET',
      bsidca_user: BSIDCA_USER ? 'SET' : 'NOT SET',
      bsidca_password: BSIDCA_PASSWORD ? 'SET' : 'NOT SET',
      organization: ORGANIZATION ? 'SET' : 'NOT SET',
      sas_user: SAS_USER ? 'SET' : 'NOT SET',
      sas_password: SAS_PASSWORD ? 'SET' : 'NOT SET',
      sas_organization: SAS_ORGANIZATION ? 'SET' : 'NOT SET'
    },
    persistentStorage: {
      available: persistentAvailable,
      path: PERSISTENT_DATA_PATH,
      cacheFile: persistentAvailable ? SAS_CACHE_FILE : 'N/A',
      sasCacheLoaded: sasUsersCache.users.length > 0,
      sasCachedUsers: sasUsersCache.usersWithDetails.length
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

// SAS: Get single user details (includes email) with timeout
async function getSasUserDetails(userName, cookie) {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetUser xmlns="http://www.cryptocard.com/blackshield/">
      <userName>${xmlEscape(userName)}</userName>
      <organization>${xmlEscape(SAS_ORGANIZATION)}</organization>
    </GetUser>
  </soap:Body>
</soap:Envelope>`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.cryptocard.com/blackshield/GetUser'
    };
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const response = await fetch(SAS_URL, {
      method: 'POST',
      headers: headers,
      body: soapEnvelope,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const responseText = await response.text();

    // Extract email and other fields from GetUserResult
    // Try multiple patterns for email field (different SAS versions may use different casing)
    const emailMatch = responseText.match(/<Email>([^<]+)<\/Email>/i) ||
      responseText.match(/<email>([^<]+)<\/email>/i) ||
      responseText.match(/<EMAIL>([^<]+)<\/EMAIL>/);
    const mobileMatch = responseText.match(/<Mobile>([^<]+)<\/Mobile>/i);
    const firstNameMatch = responseText.match(/<FirstName>([^<]+)<\/FirstName>/i);
    const lastNameMatch = responseText.match(/<Lastname>([^<]+)<\/Lastname>/i) ||
      responseText.match(/<LastName>([^<]+)<\/LastName>/i);

    const result = {
      email: emailMatch ? emailMatch[1] : '',
      mobile: mobileMatch ? mobileMatch[1] : '',
      firstname: firstNameMatch ? firstNameMatch[1] : '',
      lastname: lastNameMatch ? lastNameMatch[1] : ''
    };

    // Log if we found email for debugging
    if (result.email) {
      console.log(`GetUser ${userName}: email=${result.email}`);
    }

    return result;
  } catch (err) {
    console.log(`GetUser failed for ${userName}: ${err.message}`);
    return { email: '', mobile: '', firstname: '', lastname: '' };
  }
}

// Helper to process users in batches
async function processInBatches(items, batchSize, processor) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

// Cache for SAS users list WITH full details (for instant pagination)
let sasUsersCache = { users: [], usersWithDetails: [], timestamp: 0, cookie: null, detailsFetched: false, fetchingInProgress: false };
const SAS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fetch details for specific users
async function fetchUserDetails(users, cookie) {
  return await processInBatches(users, 3, async (user) => {
    const details = await getSasUserDetails(user.username || user.userid, cookie);
    return {
      ...user,
      email: details.email || user.email || '',
      mobile: details.mobile || user.mobile || '',
      firstname: details.firstname || user.firstname || '',
      lastname: details.lastname || user.lastname || ''
    };
  });
}

// Fetch full user list and all details in background
async function fetchFullUserListInBackground(cookie) {
  if (sasUsersCache.fetchingInProgress) return;
  sasUsersCache.fetchingInProgress = true;

  console.log('Background: Fetching full user list...');
  const startTime = Date.now();

  try {
    // Fetch full user list
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetUsers xmlns="http://www.cryptocard.com/blackshield/">
      <userName></userName>
      <lastName></lastName>
      <authMethod>Any</authMethod>
      <container></container>
      <firstRecord>0</firstRecord>
      <pageSize>1000</pageSize>
      <organization>${xmlEscape(SAS_ORGANIZATION)}</organization>
    </GetUsers>
  </soap:Body>
</soap:Envelope>`;

    const headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.cryptocard.com/blackshield/GetUsers'
    };
    if (cookie) headers['Cookie'] = cookie;

    const response = await fetch(SAS_URL, { method: 'POST', headers, body: soapEnvelope });
    const responseText = await response.text();
    const parsed = parseDataTableResponse(responseText);

    // Update cache with full user list
    sasUsersCache.users = parsed.users || [];
    console.log(`Background: Got ${sasUsersCache.users.length} users, now fetching details...`);

    // Keep first page details we already have
    const existingDetails = sasUsersCache.usersWithDetails;

    // Fetch details for remaining users (skip ones we already have)
    const remainingUsers = sasUsersCache.users.slice(existingDetails.length);
    if (remainingUsers.length > 0) {
      const remainingDetails = await fetchUserDetails(remainingUsers, cookie);
      sasUsersCache.usersWithDetails = [...existingDetails, ...remainingDetails];
    }

    sasUsersCache.detailsFetched = true;
    sasUsersCache.fetchingInProgress = false;

    console.log(`Background: Complete! ${sasUsersCache.usersWithDetails.length} users cached in ${Date.now() - startTime}ms`);

    // Save to persistent storage if available
    saveSasCacheToDisk();
  } catch (err) {
    console.log(`Background fetch failed: ${err.message}`);
    sasUsersCache.fetchingInProgress = false;
  }
}

// SAS: List Users with pagination (instant from cache after first load)
app.get('/api/sas/users', async (req, res) => {
  if (!SAS_URL || !SAS_USER || !SAS_PASSWORD) {
    return res.status(500).json({ error: 'SAS API not configured' });
  }

  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 5;
  const forceRefresh = req.query.refresh === 'true';

  // Track debug info
  let debugInfo = { request: null, response: null };
  let loadedFromDisk = false;

  // INSTANT PATH: Check memory cache first (no network calls)
  if (sasUsersCache.usersWithDetails.length > 0 && !forceRefresh) {
    const totalUsers = sasUsersCache.users.length;
    const totalPages = Math.ceil(totalUsers / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalUsers);
    const pageUsers = sasUsersCache.usersWithDetails.slice(startIndex, endIndex);

    return res.json({
      success: true,
      users: pageUsers,
      pagination: {
        page, pageSize, totalUsers, totalPages,
        hasNextPage: sasUsersCache.detailsFetched ? page < totalPages : true,
        hasPrevPage: page > 1
      },
      debug: {
        request: { method: 'MEMORY_CACHE', note: 'Instant from memory cache' },
        response: { cachedUsers: sasUsersCache.usersWithDetails.length },
        cacheStatus: {
          detailsFetched: sasUsersCache.detailsFetched,
          detailsCached: sasUsersCache.usersWithDetails.length,
          totalUsers: totalUsers,
          backgroundFetching: sasUsersCache.fetchingInProgress,
          persistentStorage: isPersistentStorageAvailable(),
          loadedFromDisk: false,
          note: `Memory cache - instant!`
        }
      }
    });
  }

  // INSTANT PATH: Check disk cache second (fast I/O, no network)
  if (sasUsersCache.users.length === 0 && !forceRefresh) {
    loadedFromDisk = loadSasCacheFromDisk();
    if (loadedFromDisk && sasUsersCache.usersWithDetails.length > 0) {
      const totalUsers = sasUsersCache.users.length;
      const totalPages = Math.ceil(totalUsers / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalUsers);
      const pageUsers = sasUsersCache.usersWithDetails.slice(startIndex, endIndex);

      return res.json({
        success: true,
        users: pageUsers,
        pagination: {
          page, pageSize, totalUsers, totalPages,
          hasNextPage: sasUsersCache.detailsFetched ? page < totalPages : true,
          hasPrevPage: page > 1
        },
        debug: {
          request: {
            method: 'DISK_CACHE',
            note: 'Instant from disk cache',
            cacheFile: SAS_CACHE_FILE,
            cacheAge: Math.round((Date.now() - sasUsersCache.timestamp) / 1000) + 's'
          },
          response: { cachedUsers: sasUsersCache.usersWithDetails.length },
          cacheStatus: {
            detailsFetched: sasUsersCache.detailsFetched,
            detailsCached: sasUsersCache.usersWithDetails.length,
            totalUsers: totalUsers,
            backgroundFetching: false,
            persistentStorage: true,
            loadedFromDisk: true,
            note: `Disk cache - instant!`
          }
        }
      });
    }
  }

  // SLOW PATH: Need to fetch from API (only when no cache or forceRefresh)
  // First, authenticate with SAS
  const authResult = await connectSAS();
  if (!authResult.success) {
    return res.json({
      success: false,
      error: 'SAS authentication failed',
      authError: authResult.error,
      debug: {
        request: { method: 'POST', url: SAS_URL, soapAction: 'Connect', note: 'Authentication failed' }
      }
    });
  }

  // Only refresh if explicitly requested or no cache at all
  const needsRefresh = forceRefresh || sasUsersCache.users.length === 0;

  if (needsRefresh) {
    // Fetch ONLY first page of users (fast - just 5 users)
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetUsers xmlns="http://www.cryptocard.com/blackshield/">
      <userName></userName>
      <lastName></lastName>
      <authMethod>Any</authMethod>
      <container></container>
      <firstRecord>0</firstRecord>
      <pageSize>${pageSize}</pageSize>
      <organization>${xmlEscape(SAS_ORGANIZATION)}</organization>
    </GetUsers>
  </soap:Body>
</soap:Envelope>`;

    try {
      const headers = {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.cryptocard.com/blackshield/GetUsers'
      };
      if (authResult.cookie) headers['Cookie'] = authResult.cookie;

      const response = await fetch(SAS_URL, { method: 'POST', headers, body: soapEnvelope });
      const responseText = await response.text();
      const parsed = parseDataTableResponse(responseText);

      // Reset cache with first page only
      sasUsersCache = {
        users: parsed.users || [],
        usersWithDetails: [],
        timestamp: Date.now(),
        cookie: authResult.cookie,
        detailsFetched: false,
        fetchingInProgress: false
      };

      debugInfo = {
        request: {
          method: 'POST', url: SAS_URL, soapAction: 'GetUsers',
          headers: maskSensitiveHeaders(headers),
          parameters: { organization: SAS_ORGANIZATION, authMethod: 'Any', pageSize: pageSize, note: 'First page only for fast display' }
        },
        response: { status: response.status, usersFound: parsed.users?.length || 0 }
      };

      // Fetch details for first page users (fast - only 5 users)
      const firstPageWithDetails = await fetchUserDetails(sasUsersCache.users, authResult.cookie);
      sasUsersCache.usersWithDetails = firstPageWithDetails;

      // Start background fetch for FULL user list and remaining details (non-blocking)
      fetchFullUserListInBackground(authResult.cookie);

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    debugInfo = {
      request: {
        method: 'CACHE',
        note: 'Full user data served from cache (instant)',
        cacheAge: `${Math.round((Date.now() - sasUsersCache.timestamp) / 1000)}s`,
        detailsCached: sasUsersCache.detailsFetched
      },
      response: { cachedUsers: sasUsersCache.usersWithDetails.length }
    };
  }

  // Calculate pagination
  const totalUsers = sasUsersCache.users.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalUsers);

  // Check if we have cached details for this page
  let pageUsers;
  const cachedDetailsCount = sasUsersCache.usersWithDetails.length;

  if (startIndex < cachedDetailsCount && endIndex <= cachedDetailsCount) {
    // Full page available from cache - instant!
    pageUsers = sasUsersCache.usersWithDetails.slice(startIndex, endIndex);
    debugInfo.pageSource = 'cache (instant)';
  } else if (startIndex < cachedDetailsCount) {
    // Partial page from cache, need to fetch rest
    const cachedPart = sasUsersCache.usersWithDetails.slice(startIndex);
    const uncachedUsers = sasUsersCache.users.slice(cachedDetailsCount, endIndex);
    if (uncachedUsers.length > 0) {
      const fetchedPart = await fetchUserDetails(uncachedUsers, authResult.cookie);
      pageUsers = [...cachedPart, ...fetchedPart];
      sasUsersCache.usersWithDetails = [...sasUsersCache.usersWithDetails, ...fetchedPart];
    } else {
      pageUsers = cachedPart;
    }
    debugInfo.pageSource = 'partial cache + fetch';
  } else if (startIndex < totalUsers) {
    // Page not in cache but within known users, fetch on-demand
    const uncachedUsers = sasUsersCache.users.slice(startIndex, endIndex);
    pageUsers = await fetchUserDetails(uncachedUsers, authResult.cookie);
    debugInfo.pageSource = 'on-demand fetch';
  } else {
    // Page beyond current known users (background still fetching)
    pageUsers = [];
    debugInfo.pageSource = 'waiting for background fetch';
  }

  res.json({
    success: true,
    users: pageUsers,
    pagination: {
      page, pageSize, totalUsers, totalPages,
      hasNextPage: sasUsersCache.detailsFetched ? page < totalPages : true, // Allow next if still fetching
      hasPrevPage: page > 1
    },
    debug: {
      ...debugInfo,
      cacheStatus: {
        detailsFetched: sasUsersCache.detailsFetched,
        detailsCached: sasUsersCache.usersWithDetails.length,
        totalUsers: sasUsersCache.users.length,
        backgroundFetching: sasUsersCache.fetchingInProgress,
        persistentStorage: isPersistentStorageAvailable(),
        loadedFromDisk: loadedFromDisk,
        note: loadedFromDisk
          ? `Loaded from disk cache - instant!`
          : sasUsersCache.detailsFetched
            ? `All ${totalUsers} users cached - all pages instant`
            : `${sasUsersCache.usersWithDetails.length}/${totalUsers} cached, background fetching...`
      }
    }
  });
});

// SAS: Get Containers (to help find correct organization structure)
app.get('/api/sas/containers', async (req, res) => {
  if (!SAS_URL || !SAS_USER || !SAS_PASSWORD) {
    return res.status(500).json({ error: 'SAS API not configured' });
  }

  const authResult = await connectSAS();
  if (!authResult.success) {
    return res.json({
      success: false,
      error: 'SAS authentication failed',
      authError: authResult.error
    });
  }

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetContainers xmlns="http://www.cryptocard.com/blackshield/">
      <organization>${xmlEscape(SAS_ORGANIZATION)}</organization>
    </GetContainers>
  </soap:Body>
</soap:Envelope>`;

  try {
    const headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.cryptocard.com/blackshield/GetContainers'
    };

    if (authResult.cookie) {
      headers['Cookie'] = authResult.cookie;
    }

    const response = await fetch(SAS_URL, {
      method: 'POST',
      headers: headers,
      body: soapEnvelope
    });

    const responseText = await response.text();

    res.json({
      success: response.ok,
      status: response.status,
      organization: SAS_ORGANIZATION,
      rawResponse: responseText
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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


const { exec } = require('child_process');

// SAS: Verify User Credentials (MFA)
// Uses the 'Connect' method but for end-users ideally, or we reuse operator Connect if it supports user creds.
// In many SAS implementations, 'Connect' is for agents/operators.
// We will try to use the same Connect method for now, assuming the user might be an operator/agent or we mock it for demo.
// Ideally usage: <VerifyUser><userName>eddy</userName><otp>123456</otp></VerifyUser>
async function verifyUserMFA(username, otp) {
  // NOTE: In a real SAS deployment, you might use 'ValidateOTP' or 'CheckPassword'
  // For this demo, we will attempt to use the generic 'Connect' if it allows user/otp,
  // OR we simply assume success if we can find the user and the OTP matches a pattern (mock)
  // because we might not have a real SAS backend that accepts direct user auth via this specific SOAP API without more config.

  // REAL IMPLEMENTATION ATTEMPT via SOAP
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Connect xmlns="http://www.cryptocard.com/blackshield/">
      <OperatorEmail>${xmlEscape(username)}</OperatorEmail>
      <OTP>${xmlEscape(otp)}</OTP>
    </Connect>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch(SAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.cryptocard.com/blackshield/Connect'
      },
      body: soapEnvelope
    });

    const responseText = await response.text();
    const parsed = parseSoapResponse(responseText, 'Connect');
    const connectResult = parsed.parsed?.ConnectResult;

    if (connectResult === 'AUTH_SUCCESS') {
      return { success: true };
    }

    return { success: false, error: connectResult || 'Authentication failed' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Endpoint: Verify User MFA
app.post('/api/auth/verify', async (req, res) => {
  const { username, otp } = req.body;

  if (!username || !otp) {
    return res.status(400).json({ success: false, error: 'Username and OTP required' });
  }

  // 1. Verify against SAS
  const result = await verifyUserMFA(username, otp);

  if (result.success) {
    res.json({ success: true, message: 'Authentication successful', username });
  } else {
    res.status(401).json({ success: false, error: result.error });
  }
});


// Endpoint: Connect to Network Target (SPA)
app.post('/api/network/connect', async (req, res) => {
  const { targetIp, port = 22, protocol = 'tcp', username } = req.body; // username injected if avail or passed
  // In real implementation, username comes from session/JWT. 
  // For this prototype, we trust the client or rely on previous "verifiedUser" state if we had session.
  // We will accept 'username' in body for simplicity of prototype (Identity Segmentation).

  const user = username || 'unknown';

  if (!targetIp) {
    return res.status(400).json({ success: false, error: 'Target IP required' });
  }

  // --- ZERO NETWORKS POLICY ENFORCEMENT ---

  // 1. Resolve Asset
  const assets = readJson(ASSETS_FILE);
  const policies = readJson(POLICIES_FILE);

  // Find policies that might apply (User match or Wildcard)
  const userPolicies = policies.filter(p => p.user === '*' || p.user === user);

  let accessAllowed = false;
  let policyName = 'Default Deny';

  // Check if any policy allows this IP:Port
  for (const p of userPolicies) {
    const asset = assets.find(a => a.id === p.assetId);
    if (asset && asset.ip === targetIp && p.port === parseInt(port)) {
      if (p.action === 'allow') {
        accessAllowed = true;
        policyName = `Policy:${p.id} (User: ${p.user} -> ${asset.name})`;
        break;
      }
    }
  }

  // 2. Audit Log (Learning Mode)
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  logAudit(user, 'CONNECT_ATTEMPT', `Target: ${targetIp}:${port} | Client: ${clientIp} | Result: ${accessAllowed ? 'ALLOWED' : 'BLOCKED'} via ${policyName} `, accessAllowed);

  if (!accessAllowed) {
    console.log(`Blocked access for ${user} to ${targetIp}:${port} (No Policy)`);
    return res.status(403).json({ success: false, error: 'Access Denied by Identity Segmentation Policy' });
  }

  console.log(`Sending SPA packet for ${clientIp} to access ${targetIp}:${port}/${protocol} (Allowed by ${policyName})`);

  // Construct fwknop command
  const cmd = `fwknop -n ${targetIp} -a ${clientIp} --Access ${protocol}/${port}`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`fwknop error: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: 'Failed to send SPA packet',
        details: stderr
      });
    }

    res.json({
      success: true,
      message: 'Network access granted',
      details: {
        target: targetIp,
        port: port,
        clientIp: clientIp,
        duration: '30s' // Default fwknop duration
      }
    });
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`SCIM API: ${SCIM_API_URL || 'NOT SET'}`);
  console.log(`BSIDCA: ${BSIDCA_URL}`);
  console.log(`SAS Endpoint: ${SAS_URL || 'NOT SET'}`);
});
