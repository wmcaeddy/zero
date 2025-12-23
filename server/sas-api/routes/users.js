const express = require('express');
const router = express.Router();
const { SCIM_API_URL, API_KEY, BSIDCA_URL, ORGANIZATION, SAS_ORGANIZATION } = require('../config');
const { maskSensitiveHeaders } = require('../middleware/auth');
const { xmlEscape, parseSoapResponse, parseSoapArrayResponse, parseDataTableResponse, maskSoapEnvelope } = require('../utils/xml');
const { isPersistentStorageAvailable } = require('../utils/storage');
const { connectSAS, fetchUserDetails, loadSasCacheFromDisk, fetchFullUserListInBackground, getSasUsersCache, setSasUsersCache } = require('../services/sas');
const { connectBSIDCA } = require('../services/bsidca');

/**
 * Helper to safely parse JSON response
 */
async function safeParseResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { rawResponse: text, parseError: e.message };
  }
}

// --- SCIM API ENDPOINTS ---

/**
 * GET /api/scim/users
 * List SCIM users
 */
router.get('/scim/users', async (req, res) => {
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

/**
 * POST /api/scim/users
 * Create SCIM user
 * Body: { "userId": "user123", "email": "user@example.com", "givenName": "John", "familyName": "Doe" }
 */
router.post('/scim/users', async (req, res) => {
  if (!SCIM_API_URL || !API_KEY) {
    return res.status(500).json({ error: 'SCIM API not configured' });
  }

  const { userId, email, givenName, familyName } = req.body;

  const payload = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: userId,
    externalId: userId,
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
          body: payload
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

/**
 * DELETE /api/scim/users/:id
 * Delete SCIM user
 */
router.delete('/scim/users/:id', async (req, res) => {
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

// --- SAS API ENDPOINTS ---

/**
 * GET /api/sas/users
 * List SAS users with pagination
 */
router.get('/sas/users', async (req, res) => {
  const { SAS_URL, SAS_USER, SAS_PASSWORD } = require('../config');

  if (!SAS_URL || !SAS_USER || !SAS_PASSWORD) {
    return res.status(500).json({ error: 'SAS API not configured' });
  }

  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 5;
  const forceRefresh = req.query.refresh === 'true';

  let debugInfo = { request: null, response: null };
  let loadedFromDisk = false;

  const sasUsersCache = getSasUsersCache();

  // INSTANT PATH: Check memory cache first
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
          note: 'Memory cache - instant!'
        }
      }
    });
  }

  // INSTANT PATH: Check disk cache second
  if (sasUsersCache.users.length === 0 && !forceRefresh) {
    loadedFromDisk = loadSasCacheFromDisk();
    const reloadedCache = getSasUsersCache();
    if (loadedFromDisk && reloadedCache.usersWithDetails.length > 0) {
      const totalUsers = reloadedCache.users.length;
      const totalPages = Math.ceil(totalUsers / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalUsers);
      const pageUsers = reloadedCache.usersWithDetails.slice(startIndex, endIndex);

      return res.json({
        success: true,
        users: pageUsers,
        pagination: {
          page, pageSize, totalUsers, totalPages,
          hasNextPage: reloadedCache.detailsFetched ? page < totalPages : true,
          hasPrevPage: page > 1
        },
        debug: {
          request: { method: 'DISK_CACHE', note: 'Instant from disk cache' },
          response: { cachedUsers: reloadedCache.usersWithDetails.length },
          cacheStatus: {
            detailsFetched: reloadedCache.detailsFetched,
            detailsCached: reloadedCache.usersWithDetails.length,
            totalUsers: totalUsers,
            persistentStorage: true,
            loadedFromDisk: true
          }
        }
      });
    }
  }

  // SLOW PATH: Need to fetch from API
  const authResult = await connectSAS();
  if (!authResult.success) {
    return res.json({
      success: false,
      error: 'SAS authentication failed',
      authError: authResult.error
    });
  }

  const needsRefresh = forceRefresh || sasUsersCache.users.length === 0;

  if (needsRefresh) {
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

      const response = await fetch(require('../config').SAS_URL, { method: 'POST', headers, body: soapEnvelope });
      const responseText = await response.text();
      const parsed = parseDataTableResponse(responseText);

      const newCache = {
        users: parsed.users || [],
        usersWithDetails: [],
        timestamp: Date.now(),
        cookie: authResult.cookie,
        detailsFetched: false,
        fetchingInProgress: false
      };
      setSasUsersCache(newCache);

      debugInfo = {
        request: { method: 'POST', soapAction: 'GetUsers', parameters: { pageSize } },
        response: { status: response.status, usersFound: parsed.users?.length || 0 }
      };

      const firstPageWithDetails = await fetchUserDetails(newCache.users, authResult.cookie);
      newCache.usersWithDetails = firstPageWithDetails;
      setSasUsersCache(newCache);

      fetchFullUserListInBackground(authResult.cookie);

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const currentCache = getSasUsersCache();
  const totalUsers = currentCache.users.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalUsers);

  let pageUsers;
  const cachedDetailsCount = currentCache.usersWithDetails.length;

  if (startIndex < cachedDetailsCount && endIndex <= cachedDetailsCount) {
    pageUsers = currentCache.usersWithDetails.slice(startIndex, endIndex);
    debugInfo.pageSource = 'cache (instant)';
  } else if (startIndex < cachedDetailsCount) {
    const cachedPart = currentCache.usersWithDetails.slice(startIndex);
    const uncachedUsers = currentCache.users.slice(cachedDetailsCount, endIndex);
    if (uncachedUsers.length > 0) {
      const fetchedPart = await fetchUserDetails(uncachedUsers, authResult.cookie);
      pageUsers = [...cachedPart, ...fetchedPart];
      currentCache.usersWithDetails = [...currentCache.usersWithDetails, ...fetchedPart];
      setSasUsersCache(currentCache);
    } else {
      pageUsers = cachedPart;
    }
    debugInfo.pageSource = 'partial cache + fetch';
  } else if (startIndex < totalUsers) {
    const uncachedUsers = currentCache.users.slice(startIndex, endIndex);
    pageUsers = await fetchUserDetails(uncachedUsers, authResult.cookie);
    debugInfo.pageSource = 'on-demand fetch';
  } else {
    pageUsers = [];
    debugInfo.pageSource = 'waiting for background fetch';
  }

  res.json({
    success: true,
    users: pageUsers,
    pagination: {
      page, pageSize, totalUsers, totalPages,
      hasNextPage: currentCache.detailsFetched ? page < totalPages : true,
      hasPrevPage: page > 1
    },
    debug: {
      ...debugInfo,
      cacheStatus: {
        detailsFetched: currentCache.detailsFetched,
        detailsCached: currentCache.usersWithDetails.length,
        totalUsers: currentCache.users.length,
        backgroundFetching: currentCache.fetchingInProgress
      }
    }
  });
});

/**
 * GET /api/sas/containers
 * Get SAS containers
 */
router.get('/sas/containers', async (req, res) => {
  const { SAS_URL, SAS_USER, SAS_PASSWORD } = require('../config');

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

    const response = await fetch(require('../config').SAS_URL, {
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

// --- BSIDCA TOKEN PROVISIONING ENDPOINTS ---

/**
 * POST /api/tokens
 * Provision token for user
 * Body: { "userName": "user@example.com", "tokenType": "Software", "description": "", "organization": "" }
 */
router.post('/tokens', async (req, res) => {
  const { userName, tokenType = 'Software', description = '', organization } = req.body;
  const org = organization || ORGANIZATION;

  const { BSIDCA_EMAIL, BSIDCA_USER, BSIDCA_PASSWORD } = require('../config');

  if ((!BSIDCA_EMAIL && !BSIDCA_USER) || !BSIDCA_PASSWORD) {
    return res.json({
      success: false,
      error: 'BSIDCA credentials not configured',
      note: 'Token provisioning requires BSIDCA SOAP API'
    });
  }

  const authResult = await connectBSIDCA();
  if (!authResult.success) {
    return res.json({
      success: false,
      error: 'BSIDCA authentication failed',
      authError: authResult.error
    });
  }

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ProvisionUsers xmlns="http://www.cryptocard.com/blackshield/">
      <userNames>
        <string>${xmlEscape(userName)}</string>
      </userNames>
      <tokenClass>${xmlEscape(tokenType)}</tokenClass>
      <description>${xmlEscape(description)}</description>
      <organization>${xmlEscape(org)}</organization>
    </ProvisionUsers>
  </soap:Body>
</soap:Envelope>`;

  try {
    const headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.cryptocard.com/blackshield/ProvisionUsers'
    };

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

    const results = parsed.parsed || [];
    const allSuccess = results.length > 0 && results.every(r =>
      r === 'ProvisionSuccess' || r === 'EmailSent' || r === 'SMSSent'
    );

    if (results.length === 0) {
      return res.json({
        success: false,
        error: 'Empty provisioning response - user may not exist in organization',
        provisioningResults: results
      });
    }

    res.json({
      success: response.ok && allSuccess,
      status: response.status,
      provisioningResults: results,
      data: parsed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tokens/activation-code
 * Get MobilePASS activation code
 * Body: { "userName": "user@example.com", "taskID": "123", "organization": "" }
 */
router.post('/tokens/activation-code', async (req, res) => {
  const { userName, taskID, organization } = req.body;
  const org = organization || ORGANIZATION;

  const { BSIDCA_EMAIL, BSIDCA_USER, BSIDCA_PASSWORD } = require('../config');

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

  const authResult = await connectBSIDCA();
  if (!authResult.success) {
    return res.json({
      success: false,
      error: 'BSIDCA authentication failed',
      authError: authResult.error
    });
  }

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
      activationCode: activationCode,
      data: parsed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tokens/info
 * Get token provisioning information
 */
router.get('/tokens/info', (req, res) => {
  res.json({
    message: 'Token provisioning in STA requires the BSIDCA SOAP API',
    validTokenClasses: {
      list: ['Software', 'Custom', 'Oath', 'SMS', 'Password', 'KT', 'RB', 'ICE', 'GOLD', 'eToken', 'MobilePASS', 'GoogleAuthenticator'],
      note: 'MobilePASS is for MobilePASS+ app, Software is for generic TOTP tokens'
    },
    workflow: {
      step1: 'Create user via SCIM API',
      step2: 'Provision token via BSIDCA SOAP API',
      step3: 'User receives activation email or get activation code'
    }
  });
});

module.exports = router;
