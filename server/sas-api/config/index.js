const crypto = require('crypto');
const path = require('path');

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY = parseInt(process.env.JWT_EXPIRY || '3600', 10); // Default: 1 hour

// Log warning if using auto-generated JWT secret
if (!process.env.JWT_SECRET) {
  console.warn('[JWT] WARNING: JWT_SECRET not set, using auto-generated secret (not suitable for production with multiple instances)');
  console.warn('[JWT] Set JWT_SECRET environment variable for production deployments');
}

// Password protection
const APP_PASSWORD = process.env.APP_PASSWORD || '';

// Environment variables for STA API
const SCIM_API_URL = process.env.SCIM_API_Endpoint_Url || '';
const API_KEY = process.env.API_KEY || '';

// BSIDCA SOAP endpoint for token provisioning
const BSIDCA_URL = process.env.BSIDCA_Endpoint_Url || 'https://cloud.eu.safenetid.com/bsidca/BSIDCA.asmx';
const BSIDCA_EMAIL = process.env.BSIDCA_Email || '';  // Operator email for authentication
const BSIDCA_USER = process.env.BSIDCA_User || '';    // Operator username
const BSIDCA_PASSWORD = process.env.BSIDCA_Password || '';
const ORGANIZATION = process.env.ORGANIZATION || '';

// SAS (Local SafeNet Authentication Service) environment variables
const SAS_URL = process.env.SAS_Endpoint_Url || '';
const SAS_USER = process.env.SAS_User || '';
const SAS_PASSWORD = process.env.SAS_Password || '';
const SAS_ORGANIZATION = process.env.SAS_ORGANIZATION || '';

// Persistent storage configuration
const PERSISTENT_DATA_PATH = '/app/data';
const DATA_DIR = '/app/data'; // Explicit persistent path
const ASSETS_FILE = path.join(DATA_DIR, 'assets.json');
const POLICIES_FILE = path.join(DATA_DIR, 'policies.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const SAS_CACHE_FILE = path.join(PERSISTENT_DATA_PATH, 'sas_users_cache.json');

// Server configuration
const PORT = process.env.PORT || 3000;

module.exports = {
  // Server
  PORT,
  APP_PASSWORD,

  // JWT
  JWT_SECRET,
  JWT_EXPIRY,

  // SCIM API
  SCIM_API_URL,
  API_KEY,

  // BSIDCA
  BSIDCA_URL,
  BSIDCA_EMAIL,
  BSIDCA_USER,
  BSIDCA_PASSWORD,
  ORGANIZATION,

  // SAS
  SAS_URL,
  SAS_USER,
  SAS_PASSWORD,
  SAS_ORGANIZATION,

  // Storage paths
  PERSISTENT_DATA_PATH,
  DATA_DIR,
  ASSETS_FILE,
  POLICIES_FILE,
  AUDIT_FILE,
  SAS_CACHE_FILE
};
