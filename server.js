const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Environment variables
const REST_API_ENDPOINT = process.env.REST_API_Endpoint_Url;
const SCIM_API_ENDPOINT = process.env.SCIM_API_Endpoint_Url;
const API_KEY = process.env.API_KEY;

// Debug helper - creates detailed request/response info
function createDebugInfo(method, url, headers, body, response, error = null) {
  return {
    timestamp: new Date().toISOString(),
    request: {
      method,
      url,
      headers: { ...headers, 'apikey': headers.apikey ? '***REDACTED***' : undefined },
      body
    },
    response: error ? null : {
      status: response?.status,
      statusText: response?.statusText,
      headers: Object.fromEntries(response?.headers?.entries() || []),
      body: response?.data
    },
    error: error ? {
      message: error.message,
      code: error.code
    } : null
  };
}

// API Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    configured: !!(REST_API_ENDPOINT && SCIM_API_ENDPOINT && API_KEY),
    endpoints: {
      rest: REST_API_ENDPOINT ? REST_API_ENDPOINT.replace(/\/[^\/]+\/$/, '/***TENANT***/') : null,
      scim: SCIM_API_ENDPOINT ? SCIM_API_ENDPOINT.replace(/\/[^\/]+\/scim/, '/***TENANT***/scim') : null
    }
  });
});

// SCIM: Create User
app.post('/api/scim/users', async (req, res) => {
  const { userName, givenName, familyName, email } = req.body;

  const scimPayload = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: userName,
    name: {
      givenName: givenName,
      familyName: familyName
    },
    emails: [
      {
        value: email,
        type: "work",
        primary: true
      }
    ],
    active: true
  };

  const url = `${SCIM_API_ENDPOINT}Users`;
  const headers = {
    'Content-Type': 'application/scim+json',
    'Accept': 'application/scim+json',
    'apikey': API_KEY
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(scimPayload)
    });

    const data = await response.text();
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch {
      parsedData = data;
    }

    const debugInfo = createDebugInfo('POST', url, headers, scimPayload, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: parsedData
    });

    res.json({
      success: response.ok,
      data: parsedData,
      debug: debugInfo
    });
  } catch (error) {
    const debugInfo = createDebugInfo('POST', url, headers, scimPayload, null, error);
    res.status(500).json({
      success: false,
      error: error.message,
      debug: debugInfo
    });
  }
});

// SCIM: Get Users
app.get('/api/scim/users', async (req, res) => {
  const url = `${SCIM_API_ENDPOINT}Users`;
  const headers = {
    'Accept': 'application/scim+json',
    'apikey': API_KEY
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    const data = await response.text();
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch {
      parsedData = data;
    }

    const debugInfo = createDebugInfo('GET', url, headers, null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: parsedData
    });

    res.json({
      success: response.ok,
      data: parsedData,
      debug: debugInfo
    });
  } catch (error) {
    const debugInfo = createDebugInfo('GET', url, headers, null, null, error);
    res.status(500).json({
      success: false,
      error: error.message,
      debug: debugInfo
    });
  }
});

// SCIM: Get User by ID
app.get('/api/scim/users/:id', async (req, res) => {
  const url = `${SCIM_API_ENDPOINT}Users/${req.params.id}`;
  const headers = {
    'Accept': 'application/scim+json',
    'apikey': API_KEY
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    const data = await response.text();
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch {
      parsedData = data;
    }

    const debugInfo = createDebugInfo('GET', url, headers, null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: parsedData
    });

    res.json({
      success: response.ok,
      data: parsedData,
      debug: debugInfo
    });
  } catch (error) {
    const debugInfo = createDebugInfo('GET', url, headers, null, null, error);
    res.status(500).json({
      success: false,
      error: error.message,
      debug: debugInfo
    });
  }
});

// SCIM: Delete User
app.delete('/api/scim/users/:id', async (req, res) => {
  const url = `${SCIM_API_ENDPOINT}Users/${req.params.id}`;
  const headers = {
    'Accept': 'application/scim+json',
    'apikey': API_KEY
  };

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers
    });

    const data = await response.text();
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch {
      parsedData = data || 'User deleted successfully';
    }

    const debugInfo = createDebugInfo('DELETE', url, headers, null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: parsedData
    });

    res.json({
      success: response.ok,
      data: parsedData,
      debug: debugInfo
    });
  } catch (error) {
    const debugInfo = createDebugInfo('DELETE', url, headers, null, null, error);
    res.status(500).json({
      success: false,
      error: error.message,
      debug: debugInfo
    });
  }
});

// REST API: Provision MobilePASS+ Token
app.post('/api/tokens', async (req, res) => {
  const { userId, tokenType = 'MobilePASS', deliveryMethod = 'email' } = req.body;

  const tokenPayload = {
    userId: userId,
    tokenType: tokenType,
    deliveryMethod: deliveryMethod
  };

  const url = `${REST_API_ENDPOINT}tokens`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'apikey': API_KEY
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(tokenPayload)
    });

    const data = await response.text();
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch {
      parsedData = data;
    }

    const debugInfo = createDebugInfo('POST', url, headers, tokenPayload, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: parsedData
    });

    res.json({
      success: response.ok,
      data: parsedData,
      debug: debugInfo
    });
  } catch (error) {
    const debugInfo = createDebugInfo('POST', url, headers, tokenPayload, null, error);
    res.status(500).json({
      success: false,
      error: error.message,
      debug: debugInfo
    });
  }
});

// REST API: Get Tokens
app.get('/api/tokens', async (req, res) => {
  const url = `${REST_API_ENDPOINT}tokens`;
  const headers = {
    'Accept': 'application/json',
    'apikey': API_KEY
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    const data = await response.text();
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch {
      parsedData = data;
    }

    const debugInfo = createDebugInfo('GET', url, headers, null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: parsedData
    });

    res.json({
      success: response.ok,
      data: parsedData,
      debug: debugInfo
    });
  } catch (error) {
    const debugInfo = createDebugInfo('GET', url, headers, null, null, error);
    res.status(500).json({
      success: false,
      error: error.message,
      debug: debugInfo
    });
  }
});

// REST API: Get Users (REST endpoint)
app.get('/api/rest/users', async (req, res) => {
  const url = `${REST_API_ENDPOINT}users`;
  const headers = {
    'Accept': 'application/json',
    'apikey': API_KEY
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    const data = await response.text();
    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch {
      parsedData = data;
    }

    const debugInfo = createDebugInfo('GET', url, headers, null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: parsedData
    });

    res.json({
      success: response.ok,
      data: parsedData,
      debug: debugInfo
    });
  } catch (error) {
    const debugInfo = createDebugInfo('GET', url, headers, null, null, error);
    res.status(500).json({
      success: false,
      error: error.message,
      debug: debugInfo
    });
  }
});

// Serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`STA API Demo server listening on port ${PORT}`);
  console.log(`REST API Endpoint: ${REST_API_ENDPOINT || 'NOT CONFIGURED'}`);
  console.log(`SCIM API Endpoint: ${SCIM_API_ENDPOINT || 'NOT CONFIGURED'}`);
  console.log(`API Key: ${API_KEY ? '***CONFIGURED***' : 'NOT CONFIGURED'}`);
});
