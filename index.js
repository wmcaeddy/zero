const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables for STA API
const REST_API_URL = process.env.REST_API_Endpoint_Url || '';
const SCIM_API_URL = process.env.SCIM_API_Endpoint_Url || '';
const API_KEY = process.env.API_KEY || '';

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
    configured: !!(REST_API_URL && SCIM_API_URL && API_KEY),
    endpoints: {
      rest: REST_API_URL || 'NOT SET',
      scim: SCIM_API_URL || 'NOT SET'
    }
  });
});

// SCIM: List Users
app.get('/api/scim/users', async (req, res) => {
  if (!SCIM_API_URL || !API_KEY) {
    return res.status(500).json({ error: 'API not configured' });
  }

  try {
    const response = await fetch(`${SCIM_API_URL}Users`, {
      headers: {
        'Accept': 'application/scim+json',
        'X-API-Key': API_KEY
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
        headers: { 'Accept': 'application/scim+json', 'apikey': '***' }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SCIM: Create User
app.post('/api/scim/users', async (req, res) => {
  if (!SCIM_API_URL || !API_KEY) {
    return res.status(500).json({ error: 'API not configured' });
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
        'X-API-Key': API_KEY
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
    return res.status(500).json({ error: 'API not configured' });
  }

  try {
    const response = await fetch(`${SCIM_API_URL}Users/${req.params.id}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/scim+json',
        'X-API-Key': API_KEY
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

// REST: Provision Token
app.post('/api/tokens', async (req, res) => {
  if (!REST_API_URL || !API_KEY) {
    return res.status(500).json({ error: 'API not configured' });
  }

  const { userId, tokenType = 'MobilePASS', deliveryMethod = 'email' } = req.body;
  const payload = { userId, tokenType, deliveryMethod };

  const url = `${REST_API_URL}tokens`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': API_KEY
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
        url: url,
        body: payload,
        responseHeaders: Object.fromEntries(response.headers.entries())
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// REST: Get Tokens
app.get('/api/tokens', async (req, res) => {
  if (!REST_API_URL || !API_KEY) {
    return res.status(500).json({ error: 'API not configured' });
  }

  try {
    const response = await fetch(`${REST_API_URL}tokens`, {
      headers: {
        'Accept': 'application/json',
        'X-API-Key': API_KEY
      }
    });
    const data = await safeParseResponse(response);
    res.json({
      success: response.ok,
      status: response.status,
      data: data,
      debug: {
        method: 'GET',
        url: `${REST_API_URL}tokens`
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  console.log(`REST API: ${REST_API_URL || 'NOT SET'}`);
  console.log(`SCIM API: ${SCIM_API_URL || 'NOT SET'}`);
  console.log(`API Key: ${API_KEY ? 'SET' : 'NOT SET'}`);
});
