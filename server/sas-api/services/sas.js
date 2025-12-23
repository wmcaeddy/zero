const fs = require('fs');
const { SAS_URL, SAS_USER, SAS_PASSWORD, SAS_ORGANIZATION, SAS_CACHE_FILE } = require('../config');
const { xmlEscape, parseSoapResponse, parseDataTableResponse } = require('../utils/xml');
const { isPersistentStorageAvailable } = require('../utils/storage');

// SAS session management
let sasSessionCookie = null;
let sasSessionExpiry = null;

// Cache for SAS users list WITH full details (for instant pagination)
let sasUsersCache = {
  users: [],
  usersWithDetails: [],
  timestamp: 0,
  cookie: null,
  detailsFetched: false,
  fetchingInProgress: false
};

const SAS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * SAS: Authenticate and establish session
 * @returns {Promise<object>} - Authentication result with cookie
 */
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

/**
 * SAS: Get single user details (includes email) with timeout
 * @param {string} userName - Username
 * @param {string} cookie - Session cookie
 * @returns {Promise<object>} - User details
 */
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

    if (result.email) {
      console.log(`GetUser ${userName}: email=${result.email}`);
    }

    return result;
  } catch (err) {
    console.log(`GetUser failed for ${userName}: ${err.message}`);
    return { email: '', mobile: '', firstname: '', lastname: '' };
  }
}

/**
 * Process users in batches
 * @param {Array} items - Items to process
 * @param {number} batchSize - Batch size
 * @param {Function} processor - Processing function
 * @returns {Promise<Array>} - Processed results
 */
async function processInBatches(items, batchSize, processor) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Fetch details for specific users
 * @param {Array} users - Users array
 * @param {string} cookie - Session cookie
 * @returns {Promise<Array>} - Users with details
 */
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

/**
 * Save SAS cache to persistent storage
 * @returns {boolean} - True if successful
 */
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

/**
 * Load SAS cache from persistent storage
 * @returns {boolean} - True if successful
 */
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

/**
 * Fetch full user list and all details in background
 * @param {string} cookie - Session cookie
 */
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

/**
 * Resolve a username to email address using the SAS users cache
 * @param {string} identifier - Username or email address
 * @returns {Promise<object>} - Resolved email and metadata
 */
async function resolveUserIdentifier(identifier) {
  // If it already looks like an email, use it directly
  if (identifier.includes('@')) {
    return { email: identifier, username: null, resolved: true, source: 'email_format' };
  }

  // Try to find user in cache by username
  const cachedUsers = sasUsersCache.usersWithDetails || [];

  // Search by username (case-insensitive)
  const lowerIdentifier = identifier.toLowerCase();
  let foundUser = cachedUsers.find(u =>
    (u.username && u.username.toLowerCase() === lowerIdentifier) ||
    (u.userid && u.userid.toLowerCase() === lowerIdentifier)
  );

  if (foundUser && foundUser.email) {
    console.log(`[Resolver] Found email for '${identifier}': ${foundUser.email}`);
    return { email: foundUser.email, username: identifier, resolved: true, source: 'cache' };
  }

  // If not in cache, try to fetch user details directly from SAS
  if (SAS_URL && SAS_USER && SAS_PASSWORD) {
    console.log(`[Resolver] User '${identifier}' not in cache, fetching from SAS...`);
    const authResult = await connectSAS();
    if (authResult.success) {
      const details = await getSasUserDetails(identifier, authResult.cookie);
      if (details.email) {
        console.log(`[Resolver] Found email for '${identifier}' from SAS: ${details.email}`);
        return { email: details.email, username: identifier, resolved: true, source: 'sas_lookup' };
      }
    }
  }

  // Could not resolve - return original identifier
  console.log(`[Resolver] Could not resolve '${identifier}' to email, using as-is`);
  return { email: null, username: identifier, resolved: false, source: 'none' };
}

/**
 * Verify OTP using TestToken SOAP method
 * @param {string} username - Username or email
 * @param {string} otp - OTP code
 * @returns {Promise<object>} - Verification result
 */
async function verifyWithTestToken(username, otp) {
  // First, establish operator session
  const authResult = await connectSAS();
  if (!authResult.success) {
    return { success: false, error: `Operator session failed: ${authResult.error}` };
  }

  // Build SOAP envelope for TestToken
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <TestToken xmlns="http://www.cryptocard.com/blackshield/">
      <userName>${xmlEscape(username)}</userName>
      <otp>${xmlEscape(otp)}</otp>
      <organization>${xmlEscape(SAS_ORGANIZATION)}</organization>
    </TestToken>
  </soap:Body>
</soap:Envelope>`;

  try {
    const headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://www.cryptocard.com/blackshield/TestToken'
    };

    if (authResult.cookie) {
      headers['Cookie'] = authResult.cookie;
    }

    console.log(`[TestToken] Validating OTP for user: ${username}`);

    const response = await fetch(SAS_URL, {
      method: 'POST',
      headers: headers,
      body: soapEnvelope
    });

    const responseText = await response.text();
    console.log('[TestToken] Response:', responseText.substring(0, 500));

    const resultMatch = responseText.match(/<TestTokenResult[^>]*>([^<]+)<\/TestTokenResult>/i) ||
                        responseText.match(/:TestTokenResult[^>]*>([^<]+)<\//i);

    const result = resultMatch ? resultMatch[1].trim() : null;

    if (result === 'true' || result === 'True' || result === 'AUTH_SUCCESS') {
      console.log(`[TestToken] SUCCESS for user: ${username}`);
      return { success: true };
    }

    const errorMatch = responseText.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/i);
    const errorMsg = errorMatch ? errorMatch[1] : `TestToken returned: ${result || 'empty response'}`;

    console.log(`[TestToken] FAILED for user: ${username}, result: ${result}`);
    return { success: false, error: errorMsg };

  } catch (err) {
    console.error(`[TestToken] Error for user ${username}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Verify OTP using Connect SOAP method (fallback for operator accounts)
 * @param {string} username - Username or email
 * @param {string} otp - OTP code
 * @returns {Promise<object>} - Verification result
 */
async function verifyWithConnect(username, otp) {
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
    console.log('[Connect] Response:', responseText.substring(0, 500));

    const match = responseText.match(/<ConnectResult[^>]*>([^<]+)<\/ConnectResult>/i) ||
                  responseText.match(/:ConnectResult[^>]*>([^<]+)<\//i);
    const result = match ? match[1].trim() : null;

    if (result === 'AUTH_SUCCESS') {
      console.log(`[Connect] SUCCESS for user: ${username}`);
      return { success: true };
    }

    return {
      success: false,
      error: `Connect returned: ${result || 'unknown'}`
    };

  } catch (err) {
    console.error(`[Connect] Error for user ${username}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Verify End-User OTP (tries TestToken, then Connect as fallback)
 * @param {string} identifier - Username or email
 * @param {string} otp - OTP code
 * @returns {Promise<object>} - Verification result
 */
async function verifyUserMFA(identifier, otp) {
  // Validate inputs
  if (!identifier || !otp) {
    return { success: false, error: 'Username/email and OTP are required' };
  }

  // Check if SAS is configured
  if (!SAS_URL) {
    return { success: false, error: 'SAS endpoint not configured. Set SAS_Endpoint_Url environment variable.' };
  }

  // Resolve username to email if needed
  const resolved = await resolveUserIdentifier(identifier);
  const userEmail = resolved.email || identifier;

  console.log(`[Auth] Authenticating: input='${identifier}', resolved='${userEmail}' (source: ${resolved.source})`);

  // Method 1: Try TestToken with resolved email
  const testTokenResult = await verifyWithTestToken(userEmail, otp);
  if (testTokenResult.success) {
    return { ...testTokenResult, method: 'TestToken', resolvedAs: userEmail };
  }

  // If we resolved to email and it failed, also try with original identifier
  if (resolved.resolved && userEmail !== identifier) {
    console.log(`[Auth] TestToken failed with email, trying original identifier '${identifier}'...`);
    const testTokenOriginal = await verifyWithTestToken(identifier, otp);
    if (testTokenOriginal.success) {
      return { ...testTokenOriginal, method: 'TestToken', resolvedAs: identifier };
    }
  }

  // Method 2: Fallback to Connect
  console.log(`[Auth] TestToken failed, trying Connect fallback with '${userEmail}'...`);
  const connectResult = await verifyWithConnect(userEmail, otp);
  if (connectResult.success) {
    return { ...connectResult, method: 'Connect', resolvedAs: userEmail };
  }

  if (resolved.resolved && userEmail !== identifier) {
    const connectOriginal = await verifyWithConnect(identifier, otp);
    if (connectOriginal.success) {
      return { ...connectOriginal, method: 'Connect', resolvedAs: identifier };
    }
  }

  // All methods failed
  return {
    success: false,
    error: `Authentication failed. TestToken: ${testTokenResult.error}. Connect: ${connectResult.error}`,
    methods_tried: ['TestToken', 'Connect'],
    identifiers_tried: resolved.resolved ? [userEmail, identifier] : [identifier]
  };
}

module.exports = {
  connectSAS,
  getSasUserDetails,
  fetchUserDetails,
  saveSasCacheToDisk,
  loadSasCacheFromDisk,
  fetchFullUserListInBackground,
  resolveUserIdentifier,
  verifyUserMFA,
  // Export cache for route access
  getSasUsersCache: () => sasUsersCache,
  setSasUsersCache: (cache) => { sasUsersCache = cache; }
};
