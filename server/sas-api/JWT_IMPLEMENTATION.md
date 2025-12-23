# JWT-Based Session Management - Implementation Guide

## Overview

This document describes the JWT-based session management implementation for the Zero-SPA Admin Console. The system provides secure, stateless authentication after MFA verification.

## Implementation Details

### Architecture

- **Algorithm**: HMAC-SHA256 (HS256)
- **Token Format**: Base64url-encoded header.payload.signature
- **Implementation**: Pure Node.js crypto module (no external dependencies)
- **Default Expiry**: 1 hour (3600 seconds)

### Environment Variables

```bash
# JWT Secret (REQUIRED for production)
JWT_SECRET=your-secure-random-secret-key-here

# JWT Expiry in seconds (optional, default: 3600)
JWT_EXPIRY=3600
```

**Important**: If `JWT_SECRET` is not set, the system will auto-generate a random secret on startup. This is suitable for development but NOT for production with multiple instances, as each instance will have a different secret.

## API Endpoints

### 1. Authentication & Token Generation

**Endpoint**: `POST /api/auth/verify`

**Request**:
```json
{
  "username": "user@example.com",
  "otp": "123456"
}
```

**Response** (Success):
```json
{
  "success": true,
  "message": "Authentication successful",
  "username": "user@example.com",
  "resolvedAs": "user@example.com",
  "method": "TestToken",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "timestamp": "2025-12-22T10:30:00.000Z"
}
```

**Response** (Failure):
```json
{
  "success": false,
  "error": "Authentication failed",
  "username": "user@example.com",
  "identifiers_tried": ["user@example.com"],
  "methods_tried": ["TestToken", "Connect"],
  "hint": "Ensure user has a valid token assigned in SAS..."
}
```

### 2. Token Refresh

**Endpoint**: `POST /api/auth/refresh`

**Headers**:
```
Authorization: Bearer <current-token>
```

**Response**:
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "timestamp": "2025-12-22T11:30:00.000Z"
}
```

## Protected Endpoints

The following endpoints require JWT authentication via `Authorization: Bearer <token>` header:

### Network Access
- `POST /api/network/connect` - Initiate SPA network connection

### Asset Management
- `POST /api/assets` - Create new asset
- `DELETE /api/assets/:id` - Delete asset

### Policy Management
- `POST /api/policies` - Create new policy
- `DELETE /api/policies/:id` - Delete policy

### Public Endpoints (No Auth Required)

The following endpoints remain public for read-only access:
- `GET /api/assets` - List all assets
- `GET /api/policies` - List all policies
- `GET /api/audit` - View audit logs
- `GET /api/status` - System status
- `GET /api/sas/users` - List SAS users

## JWT Token Structure

### Header
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### Payload
```json
{
  "sub": "user@example.com",
  "resolvedAs": "user@example.com",
  "authMethod": "TestToken",
  "iat": 1703242200,
  "exp": 1703245800
}
```

### Standard Claims
- `sub` (subject): Username/email of authenticated user
- `iat` (issued at): Unix timestamp when token was created
- `exp` (expiration): Unix timestamp when token expires

### Custom Claims
- `resolvedAs`: The resolved identifier used for authentication
- `authMethod`: Authentication method used (TestToken or Connect)

## Usage Examples

### 1. Complete Authentication Flow

```bash
# Step 1: Authenticate with MFA
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user@example.com",
    "otp": "123456"
  }'

# Response includes token:
# { "success": true, "token": "eyJhbG...", ... }

# Step 2: Use token for protected operations
curl -X POST http://localhost:3000/api/network/connect \
  -H "Authorization: Bearer eyJhbG..." \
  -H "Content-Type: application/json" \
  -d '{
    "targetIp": "192.168.1.100",
    "port": 22,
    "protocol": "tcp"
  }'
```

### 2. Token Refresh

```bash
# Refresh token before expiration
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Authorization: Bearer eyJhbG..."

# Response includes new token:
# { "success": true, "token": "eyJhbG...", "expiresIn": 3600 }
```

### 3. Asset Creation (Protected)

```bash
curl -X POST http://localhost:3000/api/assets \
  -H "Authorization: Bearer eyJhbG..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Server",
    "ip_address": "192.168.1.100",
    "hostname": "prod-srv-01",
    "os": "Ubuntu 22.04"
  }'
```

## Error Responses

### Missing Token
```json
{
  "success": false,
  "error": "Authentication required",
  "message": "Missing or invalid Authorization header. Expected format: \"Authorization: Bearer <token>\""
}
```

### Invalid/Expired Token
```json
{
  "success": false,
  "error": "Invalid or expired token",
  "message": "The provided JWT token is invalid or has expired. Please authenticate again."
}
```

## Security Features

### 1. Signature Verification
- All tokens are signed with HMAC-SHA256
- Signature is verified on every request
- Tampered tokens are automatically rejected

### 2. Expiration Validation
- Tokens automatically expire after configured time
- Expired tokens are rejected with clear error message
- Token refresh available before expiration

### 3. Stateless Authentication
- No server-side session storage required
- Tokens are self-contained and verifiable
- Horizontal scaling supported (with shared JWT_SECRET)

### 4. Rate Limiting
- Authentication endpoints protected by rate limiter
- 5 attempts per minute per IP
- 10 attempts per 5 minutes per username

## Implementation Notes

### Why Custom JWT Implementation?

1. **No External Dependencies**: Uses only Node.js built-in `crypto` module
2. **Educational Value**: Clear, understandable implementation
3. **Full Control**: Easy to audit and customize
4. **Lightweight**: Minimal overhead, fast performance

### JWT Format Details

The implementation follows RFC 7519 (JSON Web Tokens):

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9  <-- Header (base64url)
.
eyJzdWIiOiJ1c2VyQGV4YW1wbGUuY29tIi... <-- Payload (base64url)
.
TJVA95OrM7E2cBab30RMHrHDcEfxjoYZge... <-- Signature (HMAC-SHA256, base64url)
```

### Base64url Encoding

Standard base64 is not URL-safe. Base64url encoding:
- Replaces `+` with `-`
- Replaces `/` with `_`
- Removes padding `=`

This ensures tokens can be safely used in URLs and HTTP headers.

## Testing

Run the test suite to verify JWT implementation:

```bash
node test-jwt.js
```

Expected output:
```
=== JWT Implementation Test Suite ===

✓ Base64url encoding should be URL-safe
✓ HMAC-SHA256 should generate consistent signatures
✓ JWT should contain header, payload, and signature
✓ Valid JWT should verify successfully
✓ JWT with invalid signature should fail verification
✓ JWT with tampered payload should fail verification
✓ JWT expiration should be correctly calculated
✓ JWT should preserve custom claims in payload
✓ Malformed JWT should fail verification

=== Test Results ===
Passed: 9
Failed: 0
Total:  9

✓ All tests passed! JWT implementation is working correctly.
```

## Troubleshooting

### Token Always Invalid

**Issue**: Tokens are rejected immediately after generation

**Solution**:
1. Ensure `JWT_SECRET` is set consistently across all instances
2. Check system clock synchronization (JWT uses Unix timestamps)
3. Verify no middleware is modifying the Authorization header

### Token Expired Immediately

**Issue**: Tokens expire instantly

**Solution**:
1. Check `JWT_EXPIRY` environment variable value
2. Verify server time is correct (`date` command)
3. Ensure token expiry is not set to 0 or negative value

### Multi-Instance Deployment Issues

**Issue**: Tokens work on one server but not others

**Solution**:
1. Set `JWT_SECRET` environment variable to same value on all instances
2. Use a shared secret management system (e.g., AWS Secrets Manager, HashiCorp Vault)
3. Verify all instances have same JWT configuration

## Production Deployment Checklist

- [ ] Set `JWT_SECRET` to a secure random value (min 32 characters)
- [ ] Configure `JWT_EXPIRY` appropriately for your use case
- [ ] Use HTTPS in production to protect tokens in transit
- [ ] Implement token refresh logic in frontend before expiration
- [ ] Monitor authentication failures and expired token rates
- [ ] Set up alerting for unusual authentication patterns
- [ ] Document token lifecycle for your operations team
- [ ] Test token behavior across server restarts
- [ ] Verify multi-instance deployments share same secret
- [ ] Implement proper error handling in client applications

## References

- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [RFC 4648 - Base64 Encoding](https://tools.ietf.org/html/rfc4648)
- [RFC 2104 - HMAC: Keyed-Hashing for Message Authentication](https://tools.ietf.org/html/rfc2104)

## Support

For issues or questions:
1. Check the `/api/status` endpoint for configuration status
2. Review server logs for JWT-related errors (tagged with `[JWT]`)
3. Verify environment variables are set correctly
4. Run the test suite to validate implementation
