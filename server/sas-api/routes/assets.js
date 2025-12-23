const express = require('express');
const router = express.Router();
const { verifyJwtMiddleware } = require('../middleware/auth');
const InputValidator = require('../middleware/validation');
const { ASSETS_FILE } = require('../config');
const { readJson, writeJson } = require('../utils/storage');

/**
 * GET /api/assets
 * List all assets
 */
router.get('/', (req, res) => {
  res.json({ success: true, data: readJson(ASSETS_FILE) });
});

/**
 * POST /api/assets
 * Create new asset
 * Body: { "name": "Server1", "ip_address": "192.168.1.10", "hostname": "server1.local", "os": "Linux", "notes": "" }
 */
router.post('/', verifyJwtMiddleware, (req, res) => {
  const { name, ip_address, hostname, os, notes } = req.body;

  // Validate required fields
  if (!name || (!ip_address && !hostname)) {
    return res.status(400).json({
      success: false,
      error: 'Name and either ip_address or hostname required'
    });
  }

  // Validate IP address format if provided
  if (ip_address && !InputValidator.isValidIpAddress(ip_address)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid IP address format. Must be a valid IPv4 address (e.g., 192.168.1.1)',
      provided: ip_address
    });
  }

  // Validate hostname format if provided
  if (hostname && !InputValidator.isValidHostname(hostname)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid hostname format. Must be a valid hostname (alphanumeric, dots, hyphens)',
      provided: hostname
    });
  }

  // Sanitize string fields
  const sanitizedName = InputValidator.sanitizeString(name, 255);
  const sanitizedOs = InputValidator.sanitizeString(os || 'Linux', 100);
  const sanitizedNotes = InputValidator.sanitizeString(notes || '', 1000);

  const assets = readJson(ASSETS_FILE);
  const newAsset = {
    id: Date.now().toString(),
    name: sanitizedName,
    ip: ip_address || '',
    hostname: hostname || '',
    os: sanitizedOs,
    notes: sanitizedNotes,
    created: new Date()
  };
  assets.push(newAsset);
  writeJson(ASSETS_FILE, assets);

  res.json({ success: true, data: newAsset });
});

/**
 * DELETE /api/assets/:id
 * Delete asset by ID
 */
router.delete('/:id', verifyJwtMiddleware, (req, res) => {
  const assets = readJson(ASSETS_FILE);
  const filtered = assets.filter(a => a.id !== req.params.id);
  writeJson(ASSETS_FILE, filtered);
  res.json({ success: true });
});

module.exports = router;
