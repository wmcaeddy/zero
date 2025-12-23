const express = require('express');
const router = express.Router();
const { verifyJwtMiddleware } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/rateLimit');
const InputValidator = require('../middleware/validation');
const { generateJWT, JWT_EXPIRY } = require('../services/jwt');
const { verifyUserMFA } = require('../services/sas');
const { logAudit } = require('../utils/audit');

/**
 * POST /api/auth/verify
 * Verify user MFA credentials
 * Body: { "username": "user@example.com", "otp": "123456" }
 */
router.post('/verify', authRateLimiter, async (req, res) => {
  const { username, otp } = req.body;

  // Validate required fields
  if (!username || !otp) {
    return res.status(400).json({
      success: false,
      error: 'Username and OTP required',
      usage: {
        endpoint: 'POST /api/auth/verify',
        body: { username: 'user@example.com or userId', otp: '6-digit OTP from mobilePASS/authenticator' }
      }
    });
  }

  // Validate username format
  const isEmail = InputValidator.isValidEmail(username);
  const isUsername = InputValidator.isValidUsername(username);

  if (!isEmail && !isUsername) {
    return res.status(400).json({
      success: false,
      error: 'Invalid username format. Must be a valid email address or username (alphanumeric, dots, underscores, hyphens, 1-64 chars)',
      provided: username
    });
  }

  // Validate OTP format
  if (!InputValidator.isValidOtp(otp)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid OTP format. Must be exactly 6 digits.',
      provided: otp.length + ' characters'
    });
  }

  console.log(`[Auth] Verifying MFA for user: ${username}`);

  // Verify against SAS
  const result = await verifyUserMFA(username, otp);

  // Log the authentication attempt
  logAudit(username, 'MFA_VERIFY', `Method: ${result.method || 'N/A'}, Success: ${result.success}`, result.success);

  if (result.success) {
    // Generate JWT token
    const token = generateJWT({
      sub: username,
      resolvedAs: result.resolvedAs || username,
      authMethod: result.method
    });

    res.json({
      success: true,
      message: 'Authentication successful',
      username: username,
      resolvedAs: result.resolvedAs || username,
      method: result.method,
      token: token,
      expiresIn: JWT_EXPIRY,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(401).json({
      success: false,
      error: result.error,
      username: username,
      identifiers_tried: result.identifiers_tried || [username],
      methods_tried: result.methods_tried || [result.method || 'unknown'],
      hint: 'Ensure user has a valid token assigned in SAS. You can use either username or email address.'
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 * Headers: Authorization: Bearer <current-token>
 */
router.post('/refresh', verifyJwtMiddleware, (req, res) => {
  // Generate a new token with the same user info
  const newToken = generateJWT({
    sub: req.user.sub,
    resolvedAs: req.user.resolvedAs,
    authMethod: req.user.authMethod
  });

  res.json({
    success: true,
    message: 'Token refreshed successfully',
    token: newToken,
    expiresIn: JWT_EXPIRY,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
