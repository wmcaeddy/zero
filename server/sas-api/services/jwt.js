const crypto = require('crypto');
const { JWT_SECRET, JWT_EXPIRY } = require('../config');

/**
 * Base64url encode (URL-safe base64 without padding)
 * @param {string|Buffer} input - Input to encode
 * @returns {string} - Base64url encoded string
 */
function base64urlEncode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64url decode
 * @param {string} input - Base64url encoded string
 * @returns {string} - Decoded string
 */
function base64urlDecode(input) {
  // Add padding if needed
  let padded = input;
  while (padded.length % 4 !== 0) {
    padded += '=';
  }
  // Convert base64url to standard base64
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generate HMAC-SHA256 signature
 * @param {string} data - Data to sign
 * @param {string} secret - Secret key
 * @returns {string} - Base64url encoded signature
 */
function hmacSha256(data, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  return base64urlEncode(hmac.digest());
}

/**
 * Generate JWT token
 * @param {object} payload - JWT payload (must include sub, can include additional claims)
 * @param {number} expiresIn - Expiration time in seconds (default: JWT_EXPIRY)
 * @returns {string} - JWT token
 */
function generateJWT(payload, expiresIn = JWT_EXPIRY) {
  const now = Math.floor(Date.now() / 1000);

  // JWT Header
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  // JWT Payload with standard claims
  const jwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn
  };

  // Encode header and payload
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(jwtPayload));

  // Create signature
  const signature = hmacSha256(`${encodedHeader}.${encodedPayload}`, JWT_SECRET);

  // Combine to create JWT
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {object|null} - Decoded payload if valid, null if invalid
 */
function verifyJWT(token) {
  try {
    // Validate token exists and is a string
    if (!token || typeof token !== 'string') {
      return null;
    }

    // Split token into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const expectedSignature = hmacSha256(`${encodedHeader}.${encodedPayload}`, JWT_SECRET);
    if (signature !== expectedSignature) {
      console.log('[JWT] Invalid signature');
      return null;
    }

    // Decode payload
    const payload = JSON.parse(base64urlDecode(encodedPayload));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.log('[JWT] Token expired');
      return null;
    }

    return payload;
  } catch (err) {
    console.error('[JWT] Verification error:', err.message);
    return null;
  }
}

module.exports = {
  generateJWT,
  verifyJWT
};
