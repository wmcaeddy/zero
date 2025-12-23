const { AUDIT_FILE } = require('../config');
const { readJson, writeJson } = require('./storage');

/**
 * Log audit event
 * @param {string} user - Username
 * @param {string} action - Action performed
 * @param {string} details - Additional details
 * @param {boolean} success - Success status
 */
function logAudit(user, action, details, success) {
  const logs = readJson(AUDIT_FILE);
  logs.unshift({
    timestamp: new Date(),
    user,
    action,
    details,
    success
  });
  // Keep last 1000 logs
  if (logs.length > 1000) logs.pop();
  writeJson(AUDIT_FILE, logs);
}

module.exports = {
  logAudit
};
