const express = require('express');
const router = express.Router();
const { verifyJwtMiddleware } = require('../middleware/auth');
const InputValidator = require('../middleware/validation');
const { POLICIES_FILE, ASSETS_FILE } = require('../config');
const { readJson, writeJson } = require('../utils/storage');

/**
 * GET /api/policies
 * List all policies
 */
router.get('/', (req, res) => {
  res.json({ success: true, data: readJson(POLICIES_FILE) });
});

/**
 * POST /api/policies
 * Create new policy
 * Body: { "user_id": "user@example.com", "asset_id": "123", "port": 22, "protocol": "tcp", "action": "allow" }
 */
router.post('/', verifyJwtMiddleware, (req, res) => {
  const { user_id, asset_id, port, protocol, action } = req.body;

  // Validate required fields
  if (!asset_id || !port) {
    return res.status(400).json({
      success: false,
      error: 'asset_id and port are required'
    });
  }

  // Validate user_id exists in the system (if not wildcard)
  const userId = user_id || '*';
  if (userId !== '*') {
    // User can be email or username
    const isValidUser = InputValidator.isValidEmail(userId) || InputValidator.isValidUsername(userId);
    if (!isValidUser) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user_id format. Must be valid email, username, or "*" for wildcard',
        provided: userId
      });
    }
  }

  // Validate asset_id exists
  const assets = readJson(ASSETS_FILE);
  const assetExists = assets.some(a => a.id === asset_id);
  if (!assetExists) {
    return res.status(400).json({
      success: false,
      error: 'Asset not found. asset_id must reference an existing asset.',
      provided: asset_id
    });
  }

  // Validate port
  if (!InputValidator.isValidPort(port)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid port number. Must be between 1 and 65535.',
      provided: port
    });
  }

  // Validate protocol if provided
  const protocolValue = (protocol || 'tcp').toLowerCase();
  if (!InputValidator.isValidProtocol(protocolValue)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid protocol. Must be "tcp" or "udp".',
      provided: protocol
    });
  }

  const policies = readJson(POLICIES_FILE);
  const newPolicy = {
    id: Date.now().toString(),
    user: userId,
    assetId: asset_id,
    port: parseInt(port, 10),
    protocol: protocolValue,
    action: action || 'allow',
    created: new Date()
  };
  policies.push(newPolicy);
  writeJson(POLICIES_FILE, policies);

  res.json({ success: true, data: newPolicy });
});

/**
 * DELETE /api/policies/:id
 * Delete policy by ID
 */
router.delete('/:id', verifyJwtMiddleware, (req, res) => {
  const policies = readJson(POLICIES_FILE);
  const filtered = policies.filter(p => p.id !== req.params.id);
  writeJson(POLICIES_FILE, filtered);
  res.json({ success: true });
});

module.exports = router;
