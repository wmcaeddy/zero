const fs = require('fs');
const { DATA_DIR, PERSISTENT_DATA_PATH, SAS_CACHE_FILE } = require('../config');

/**
 * Check if persistent storage is available
 * @returns {boolean} - True if persistent storage is writable
 */
function isPersistentStorageAvailable() {
  try {
    if (fs.existsSync(PERSISTENT_DATA_PATH)) {
      // Test write access
      const testFile = require('path').join(PERSISTENT_DATA_PATH, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return true;
    }
    return false;
  } catch (err) {
    console.log('Persistent storage not available:', err.message);
    return false;
  }
}

/**
 * Read JSON file
 * @param {string} file - File path
 * @returns {Array} - Parsed JSON array or empty array
 */
function readJson(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return [];
  }
}

/**
 * Write JSON file
 * @param {string} file - File path
 * @param {*} data - Data to write
 * @returns {boolean} - True if successful
 */
function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error('Failed to create data directory:', e.message);
    }
  }
}

// Initialize data directory
ensureDataDir();

module.exports = {
  isPersistentStorageAvailable,
  readJson,
  writeJson,
  ensureDataDir
};
