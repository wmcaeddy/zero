#!/usr/bin/env node
/**
 * JWT Implementation Test Suite
 * Tests the JWT-based session management for Zero-SPA Admin Console
 *
 * Run with: node test-jwt.js
 */

const crypto = require('crypto');

// Test JWT secret
const JWT_SECRET = 'test-secret-key-for-testing-only';
const JWT_EXPIRY = 3600; // 1 hour

// --- JWT Implementation (copied from index.js) ---

function base64urlEncode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlDecode(input) {
  let padded = input;
  while (padded.length % 4 !== 0) {
    padded += '=';
  }
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf8');
}

function hmacSha256(data, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  return base64urlEncode(hmac.digest());
}

function generateJWT(payload, expiresIn = JWT_EXPIRY) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const jwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(jwtPayload));
  const signature = hmacSha256(`${encodedHeader}.${encodedPayload}`, JWT_SECRET);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    const expectedSignature = hmacSha256(`${encodedHeader}.${encodedPayload}`, JWT_SECRET);
    if (signature !== expectedSignature) {
      console.log('[JWT] Invalid signature');
      return null;
    }

    const payload = JSON.parse(base64urlDecode(encodedPayload));

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

// --- Test Suite ---

console.log('=== JWT Implementation Test Suite ===\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: Base64url encoding/decoding
test('Base64url encoding should be URL-safe', () => {
  const input = 'Hello+World/Test=';
  const encoded = base64urlEncode(input);
  assert(!encoded.includes('+'), 'Should not contain +');
  assert(!encoded.includes('/'), 'Should not contain /');
  assert(!encoded.includes('='), 'Should not contain =');

  const decoded = base64urlDecode(encoded);
  assert(decoded === input, 'Should decode to original string');
});

// Test 2: HMAC-SHA256 signature generation
test('HMAC-SHA256 should generate consistent signatures', () => {
  const data = 'test-data';
  const sig1 = hmacSha256(data, JWT_SECRET);
  const sig2 = hmacSha256(data, JWT_SECRET);
  assert(sig1 === sig2, 'Signatures should be consistent');

  const sig3 = hmacSha256(data, 'different-secret');
  assert(sig1 !== sig3, 'Different secrets should produce different signatures');
});

// Test 3: JWT generation includes required fields
test('JWT should contain header, payload, and signature', () => {
  const token = generateJWT({ sub: 'user@example.com' });
  const parts = token.split('.');
  assert(parts.length === 3, 'JWT should have 3 parts');

  const header = JSON.parse(base64urlDecode(parts[0]));
  assert(header.alg === 'HS256', 'Algorithm should be HS256');
  assert(header.typ === 'JWT', 'Type should be JWT');

  const payload = JSON.parse(base64urlDecode(parts[1]));
  assert(payload.sub === 'user@example.com', 'Subject should match');
  assert(typeof payload.iat === 'number', 'Issued at should be a number');
  assert(typeof payload.exp === 'number', 'Expiration should be a number');
});

// Test 4: JWT verification with valid token
test('Valid JWT should verify successfully', () => {
  const token = generateJWT({ sub: 'user@example.com', authMethod: 'TestToken' });
  const payload = verifyJWT(token);

  assert(payload !== null, 'Payload should not be null');
  assert(payload.sub === 'user@example.com', 'Subject should match');
  assert(payload.authMethod === 'TestToken', 'Auth method should match');
});

// Test 5: JWT verification with invalid signature
test('JWT with invalid signature should fail verification', () => {
  const token = generateJWT({ sub: 'user@example.com' });
  const parts = token.split('.');

  // Tamper with the signature
  const tamperedToken = `${parts[0]}.${parts[1]}.${parts[2]}X`;

  const payload = verifyJWT(tamperedToken);
  assert(payload === null, 'Tampered token should fail verification');
});

// Test 6: JWT verification with tampered payload
test('JWT with tampered payload should fail verification', () => {
  const token = generateJWT({ sub: 'user@example.com' });
  const parts = token.split('.');

  // Tamper with the payload
  const tamperedPayload = base64urlEncode(JSON.stringify({ sub: 'attacker@example.com' }));
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

  const payload = verifyJWT(tamperedToken);
  assert(payload === null, 'Tampered payload should fail verification');
});

// Test 7: Expired token verification
test('Expired JWT should fail verification', () => {
  // Generate a token that expires in 1 second
  const token = generateJWT({ sub: 'user@example.com' }, 0);

  // Wait a moment to ensure expiration
  setTimeout(() => {}, 10);

  const payload = verifyJWT(token);
  assert(payload === null, 'Expired token should fail verification');
});

// Test 8: JWT expiration time calculation
test('JWT expiration should be correctly calculated', () => {
  const beforeTime = Math.floor(Date.now() / 1000);
  const token = generateJWT({ sub: 'user@example.com' });
  const afterTime = Math.floor(Date.now() / 1000);

  const parts = token.split('.');
  const payload = JSON.parse(base64urlDecode(parts[1]));

  assert(payload.exp >= beforeTime + JWT_EXPIRY, 'Expiration should be at least now + expiry');
  assert(payload.exp <= afterTime + JWT_EXPIRY + 1, 'Expiration should not exceed now + expiry + 1s');
});

// Test 9: JWT should preserve custom claims
test('JWT should preserve custom claims in payload', () => {
  const customClaims = {
    sub: 'user@example.com',
    resolvedAs: 'john.doe',
    authMethod: 'TestToken',
    customField: 'customValue'
  };

  const token = generateJWT(customClaims);
  const payload = verifyJWT(token);

  assert(payload.sub === customClaims.sub, 'Sub should match');
  assert(payload.resolvedAs === customClaims.resolvedAs, 'ResolvedAs should match');
  assert(payload.authMethod === customClaims.authMethod, 'AuthMethod should match');
  assert(payload.customField === customClaims.customField, 'Custom field should be preserved');
});

// Test 10: Token format validation
test('Malformed JWT should fail verification', () => {
  const malformedTokens = [
    'invalid',
    'invalid.token',
    'invalid.token.with.four.parts',
    '',
    null,
    undefined,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'  // Only header
  ];

  malformedTokens.forEach(token => {
    const payload = verifyJWT(token);
    assert(payload === null, `Malformed token "${token}" should fail verification`);
  });
});

// Summary
console.log(`\n=== Test Results ===`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✓ All tests passed! JWT implementation is working correctly.');
  process.exit(0);
} else {
  console.log(`\n✗ ${testsFailed} test(s) failed. Please review the implementation.`);
  process.exit(1);
}
