const express = require('express');
const router = express.Router();
const config = require('../config');
const { AUDIT_FILE } = require('../config');
const { readJson } = require('../utils/storage');
const { isPersistentStorageAvailable } = require('../utils/storage');
const { getSasUsersCache } = require('../services/sas');

/**
 * GET /api/status
 * Get system status and configuration
 */
router.get('/status', (req, res) => {
  const persistentAvailable = isPersistentStorageAvailable();
  const sasUsersCache = getSasUsersCache();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configured: {
      scim: !!(config.SCIM_API_URL && config.API_KEY),
      bsidca: !!((config.BSIDCA_EMAIL || config.BSIDCA_USER) && config.BSIDCA_PASSWORD && config.ORGANIZATION),
      sas: !!(config.SAS_URL && config.SAS_USER && config.SAS_PASSWORD && config.SAS_ORGANIZATION),
      jwt: !!process.env.JWT_SECRET
    },
    endpoints: {
      scim: config.SCIM_API_URL || 'NOT SET',
      bsidca: config.BSIDCA_URL,
      sas: config.SAS_URL || 'NOT SET'
    },
    credentials: {
      bsidca_email: config.BSIDCA_EMAIL ? 'SET' : 'NOT SET',
      bsidca_user: config.BSIDCA_USER ? 'SET' : 'NOT SET',
      bsidca_password: config.BSIDCA_PASSWORD ? 'SET' : 'NOT SET',
      organization: config.ORGANIZATION ? 'SET' : 'NOT SET',
      sas_user: config.SAS_USER ? 'SET' : 'NOT SET',
      sas_password: config.SAS_PASSWORD ? 'SET' : 'NOT SET',
      sas_organization: config.SAS_ORGANIZATION ? 'SET' : 'NOT SET',
      jwt_secret: process.env.JWT_SECRET ? 'SET (secure)' : 'NOT SET (using auto-generated)'
    },
    authentication: {
      methods: ['TestToken (primary - end-user OTP)', 'Connect (fallback - operator auth)'],
      endpoint: 'POST /api/auth/verify with { username, otp }',
      sessionManagement: {
        type: 'JWT',
        algorithm: 'HS256',
        expirySeconds: config.JWT_EXPIRY,
        refreshEndpoint: 'POST /api/auth/refresh',
        protectedEndpoints: [
          'POST /api/network/connect',
          'POST /api/assets',
          'DELETE /api/assets/:id',
          'POST /api/policies',
          'DELETE /api/policies/:id'
        ]
      }
    },
    persistentStorage: {
      available: persistentAvailable,
      path: config.PERSISTENT_DATA_PATH,
      cacheFile: persistentAvailable ? config.SAS_CACHE_FILE : 'N/A',
      sasCacheLoaded: sasUsersCache.users.length > 0,
      sasCachedUsers: sasUsersCache.usersWithDetails.length
    },
    note: 'Token provisioning requires BSIDCA SOAP API credentials (operator login)'
  });
});

/**
 * GET /api/audit
 * Get audit logs
 */
router.get('/audit', (req, res) => {
  res.json({ success: true, data: readJson(AUDIT_FILE) });
});

/**
 * GET /health
 * Health check endpoint for Railway
 */
router.get('/health', (req, res) => {
  res.status(200).send('OK');
});

module.exports = router;
