/**
 * Zero-SPA Admin Console - Modularized Entry Point
 *
 * This is the main entry point for the Zero-SPA admin console.
 * The application has been refactored into well-organized modules for better maintainability.
 *
 * Directory structure:
 * - config/       - Configuration and environment variables
 * - middleware/   - Express middleware (auth, rate limiting, validation)
 * - routes/       - API route handlers (auth, assets, policies, network, users, status)
 * - services/     - Business logic services (JWT, SAS, BSIDCA SOAP clients)
 * - utils/        - Utility functions (XML parsing, storage, audit)
 */

const express = require('express');
const path = require('path');

// Configuration
const config = require('./config');

// Middleware
const { authMiddleware } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/auth');
const assetsRoutes = require('./routes/assets');
const policiesRoutes = require('./routes/policies');
const networkRoutes = require('./routes/network');
const usersRoutes = require('./routes/users');
const statusRoutes = require('./routes/status');

// Initialize Express app
const app = express();

// Body parser middleware
app.use(express.json());

// Basic auth middleware (password protection)
app.use(authMiddleware);

// Static files
app.use(express.static('public'));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/policies', policiesRoutes);
app.use('/api/network', networkRoutes);
app.use('/api', usersRoutes);  // Includes /scim/*, /sas/*, /tokens/*
app.use('/api', statusRoutes); // Includes /status, /audit
app.use('', statusRoutes);     // Includes /health

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`SCIM API: ${config.SCIM_API_URL || 'NOT SET'}`);
  console.log(`BSIDCA: ${config.BSIDCA_URL}`);
  console.log(`SAS Endpoint: ${config.SAS_URL || 'NOT SET'}`);
  console.log('');
  console.log('Modularized structure:');
  console.log('  - config/       Configuration and environment variables');
  console.log('  - middleware/   Auth, rate limiting, validation');
  console.log('  - routes/       API endpoints (auth, assets, policies, network, users, status)');
  console.log('  - services/     JWT, SAS, BSIDCA SOAP clients');
  console.log('  - utils/        XML parsing, storage, audit logging');
});

module.exports = app;
