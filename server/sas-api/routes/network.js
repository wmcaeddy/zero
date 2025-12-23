const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const { verifyJwtMiddleware } = require('../middleware/auth');
const InputValidator = require('../middleware/validation');
const { ASSETS_FILE, POLICIES_FILE } = require('../config');
const { readJson } = require('../utils/storage');
const { logAudit } = require('../utils/audit');

/**
 * POST /api/network/connect
 * Connect to network target (SPA)
 * Protected by JWT authentication
 * Body: { "targetIp": "192.168.1.10", "port": 22, "protocol": "tcp" }
 */
router.post('/connect', verifyJwtMiddleware, async (req, res) => {
  const { targetIp, port = 22, protocol = 'tcp' } = req.body;

  // Get authenticated user from JWT token
  const user = req.user.sub;

  // Validate required fields
  if (!targetIp) {
    return res.status(400).json({
      success: false,
      error: 'targetIp is required'
    });
  }

  // Validate targetIp format
  if (!InputValidator.isValidIpAddress(targetIp)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid target IP address format. Must be a valid IPv4 address.',
      provided: targetIp
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

  // Validate protocol
  const protocolValue = protocol.toLowerCase();
  if (!InputValidator.isValidProtocol(protocolValue)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid protocol. Must be "tcp" or "udp".',
      provided: protocol
    });
  }

  // --- ZERO NETWORKS POLICY ENFORCEMENT ---

  // 1. Resolve Asset
  const assets = readJson(ASSETS_FILE);
  const policies = readJson(POLICIES_FILE);

  // Find policies that might apply (User match or Wildcard)
  const userPolicies = policies.filter(p => p.user === '*' || p.user === user);

  let accessAllowed = false;
  let policyName = 'Default Deny';

  // Check if any policy allows this IP:Port
  for (const p of userPolicies) {
    const asset = assets.find(a => a.id === p.assetId);
    if (asset && asset.ip === targetIp && p.port === parseInt(port)) {
      if (p.action === 'allow') {
        accessAllowed = true;
        policyName = `Policy:${p.id} (User: ${p.user} -> ${asset.name})`;
        break;
      }
    }
  }

  // 2. Audit Log (Learning Mode)
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  // Validate clientIp is a valid IPv4 address (defensive programming)
  let validatedClientIp = clientIp;
  if (!InputValidator.isValidIpAddress(clientIp)) {
    console.warn(`Invalid client IP detected: ${clientIp}, using fallback`);
    validatedClientIp = '127.0.0.1'; // Fallback to localhost if invalid
  }

  logAudit(user, 'CONNECT_ATTEMPT', `Target: ${targetIp}:${port} | Client: ${validatedClientIp} | Result: ${accessAllowed ? 'ALLOWED' : 'BLOCKED'} via ${policyName} `, accessAllowed);

  if (!accessAllowed) {
    console.log(`Blocked access for ${user} to ${targetIp}:${port} (No Policy)`);
    return res.status(403).json({ success: false, error: 'Access Denied by Identity Segmentation Policy' });
  }

  console.log(`Sending SPA packet for ${validatedClientIp} to access ${targetIp}:${port}/${protocolValue} (Allowed by ${policyName})`);

  // Execute fwknop using execFile (safer - no shell injection)
  const args = [
    '-n', targetIp,
    '-a', validatedClientIp,
    '--Access', `${protocolValue}/${port}`
  ];

  execFile('fwknop', args, (error, stdout, stderr) => {
    if (error) {
      console.error(`fwknop error: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: 'Failed to send SPA packet',
        details: stderr
      });
    }

    res.json({
      success: true,
      message: 'Network access granted',
      details: {
        target: targetIp,
        port: port,
        clientIp: validatedClientIp,
        duration: '30s' // Default fwknop duration
      }
    });
  });
});

module.exports = router;
