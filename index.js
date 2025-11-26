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

// Health check / status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configured: !!(REST_API_URL && SCIM_API_URL && API_KEY)
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
        'apikey': API_KEY
      }
    });
    const data = await response.json();
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
        'apikey': API_KEY
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
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
        'apikey': API_KEY
      }
    });
    res.json({
      success: response.ok,
      status: response.status,
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

  try {
    const response = await fetch(`${REST_API_URL}tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    res.json({
      success: response.ok,
      status: response.status,
      data: data,
      debug: {
        method: 'POST',
        url: `${REST_API_URL}tokens`,
        body: payload
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
        'apikey': API_KEY
      }
    });
    const data = await response.json();
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

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`REST API: ${REST_API_URL || 'NOT SET'}`);
  console.log(`SCIM API: ${SCIM_API_URL || 'NOT SET'}`);
  console.log(`API Key: ${API_KEY ? 'SET' : 'NOT SET'}`);
});
