const { verifyJWT } = require('../services/jwt');
const { APP_PASSWORD } = require('../config');

/**
 * JWT Verification Middleware
 * Extracts and verifies JWT from Authorization header
 * Attaches decoded user info to req.user
 */
function verifyJwtMiddleware(req, res, next) {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Missing or invalid Authorization header. Expected format: "Authorization: Bearer <token>"'
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Verify token
  const payload = verifyJWT(token);

  if (!payload) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      message: 'The provided JWT token is invalid or has expired. Please authenticate again.'
    });
  }

  // Attach user info to request
  req.user = payload;

  // Continue to next middleware/route
  next();
}

/**
 * Basic Auth Password Protection Middleware
 * Skip auth if no password is set
 */
function authMiddleware(req, res, next) {
  // Skip auth if no password is set
  if (!APP_PASSWORD) {
    return next();
  }

  // Allow health check without auth
  if (req.path === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="STA API Demo"');
    return res.status(401).send('Authentication required');
  }

  const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
  const [username, password] = credentials.split(':');

  // Accept any username, just check the password
  if (password === APP_PASSWORD) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="STA API Demo"');
  return res.status(401).send('Invalid credentials');
}

/**
 * Helper to mask sensitive data in headers
 * @param {object} headers - HTTP headers
 * @returns {object} - Headers with sensitive data masked
 */
function maskSensitiveHeaders(headers) {
  const masked = { ...headers };
  if (masked.Authorization) {
    const parts = masked.Authorization.split(' ');
    if (parts.length === 2) {
      masked.Authorization = `${parts[0]} ${parts[1].substring(0, 8)}...***`;
    }
  }
  if (masked.Cookie) {
    masked.Cookie = masked.Cookie.substring(0, 20) + '...***';
  }
  return masked;
}

module.exports = {
  verifyJwtMiddleware,
  authMiddleware,
  maskSensitiveHeaders
};
