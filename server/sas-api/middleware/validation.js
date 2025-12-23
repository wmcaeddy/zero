/**
 * Input Validation Utilities
 */

const InputValidator = {
  /**
   * Validate email format
   * @param {string} email - Email address to validate
   * @returns {boolean} - True if valid email format
   */
  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    // RFC 5322 simplified email regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email) && email.length <= 254;
  },

  /**
   * Validate username format
   * Allows alphanumeric characters, dots, underscores, hyphens
   * Length: 1-64 characters
   * @param {string} username - Username to validate
   * @returns {boolean} - True if valid username format
   */
  isValidUsername(username) {
    if (!username || typeof username !== 'string') return false;
    const usernameRegex = /^[a-zA-Z0-9._-]{1,64}$/;
    return usernameRegex.test(username);
  },

  /**
   * Validate OTP format - exactly 6 digits
   * @param {string} otp - OTP code to validate
   * @returns {boolean} - True if exactly 6 digits
   */
  isValidOtp(otp) {
    if (!otp || typeof otp !== 'string') return false;
    return /^\d{6}$/.test(otp);
  },

  /**
   * Validate IPv4 address format
   * @param {string} ip - IP address to validate
   * @returns {boolean} - True if valid IPv4 address
   */
  isValidIpAddress(ip) {
    if (!ip || typeof ip !== 'string') return false;
    const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  },

  /**
   * Validate port number (1-65535)
   * @param {number|string} port - Port number to validate
   * @returns {boolean} - True if valid port number
   */
  isValidPort(port) {
    const portNum = typeof port === 'string' ? parseInt(port, 10) : port;
    return Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;
  },

  /**
   * Validate hostname format
   * Allows alphanumeric, dots, hyphens
   * @param {string} hostname - Hostname to validate
   * @returns {boolean} - True if valid hostname format
   */
  isValidHostname(hostname) {
    if (!hostname || typeof hostname !== 'string') return false;
    if (hostname.length > 253) return false;
    const hostnameRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*$/;
    return hostnameRegex.test(hostname);
  },

  /**
   * Sanitize string - trim whitespace and limit length
   * @param {string} str - String to sanitize
   * @param {number} maxLength - Maximum length (default 1000)
   * @returns {string} - Sanitized string
   */
  sanitizeString(str, maxLength = 1000) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().substring(0, maxLength);
  },

  /**
   * Validate protocol (tcp or udp)
   * @param {string} protocol - Protocol to validate
   * @returns {boolean} - True if valid protocol
   */
  isValidProtocol(protocol) {
    if (!protocol || typeof protocol !== 'string') return false;
    return ['tcp', 'udp'].includes(protocol.toLowerCase());
  }
};

module.exports = InputValidator;
