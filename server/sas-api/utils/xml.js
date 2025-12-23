/**
 * XML Utilities for SOAP API integration
 */

/**
 * XML-escape strings for SOAP
 * @param {string} str - String to escape
 * @returns {string} - XML-safe string
 */
function xmlEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parse SOAP response and extract result
 * @param {string} xmlText - SOAP XML response
 * @param {string} methodName - SOAP method name
 * @returns {object} - Parsed response with elements
 */
function parseSoapResponse(xmlText, methodName) {
  try {
    // Extract the response element
    const resultPattern = new RegExp(`<${methodName}Response[^>]*>([\\s\\S]*?)<\\/${methodName}Response>`, 'i');
    const match = xmlText.match(resultPattern);

    if (!match) {
      return { error: 'Could not parse SOAP response', rawResponse: xmlText };
    }

    const responseBody = match[1];

    // Extract all elements from the response
    const elements = {};
    const elementPattern = /<(\w+)>([^<]*)<\/\1>/g;
    let elementMatch;

    while ((elementMatch = elementPattern.exec(responseBody)) !== null) {
      const [, key, value] = elementMatch;
      elements[key] = value;
    }

    return { parsed: elements, rawResponse: xmlText };
  } catch (e) {
    return { error: e.message, rawResponse: xmlText };
  }
}

/**
 * Parse SOAP array response
 * @param {string} xmlText - SOAP XML response
 * @param {string} methodName - SOAP method name
 * @param {string} arrayElementName - Name of array elements
 * @returns {object} - Parsed array response
 */
function parseSoapArrayResponse(xmlText, methodName, arrayElementName) {
  try {
    const resultPattern = new RegExp(`<${methodName}Response[^>]*>([\\s\\S]*?)<\\/${methodName}Response>`, 'i');
    const match = xmlText.match(resultPattern);

    if (!match) {
      return { error: 'Could not parse SOAP response', rawResponse: xmlText };
    }

    const responseBody = match[1];
    const items = [];

    // Extract array elements
    const elementPattern = new RegExp(`<${arrayElementName}>([^<]*)<\\/${arrayElementName}>`, 'g');
    let elementMatch;

    while ((elementMatch = elementPattern.exec(responseBody)) !== null) {
      items.push(elementMatch[1]);
    }

    return { parsed: items, rawResponse: xmlText };
  } catch (e) {
    return { error: e.message, rawResponse: xmlText };
  }
}

/**
 * Parse DataTable XML response (used by GetUsers)
 * @param {string} xmlText - SOAP XML response with DataTable
 * @returns {object} - Parsed users array
 */
function parseDataTableResponse(xmlText) {
  try {
    const users = [];

    // Extract each user row from the diffgram - can be <users> or <Table> elements
    const rowPattern = /<users[^>]*>([\s\S]*?)<\/users>|<Table[^>]*>([\s\S]*?)<\/Table>/g;
    let rowMatch;

    while ((rowMatch = rowPattern.exec(xmlText)) !== null) {
      const rowContent = rowMatch[1] || rowMatch[2];
      const user = {};

      // Extract common user fields (case-insensitive)
      const fields = ['userid', 'username', 'firstname', 'lastname', 'email', 'mobile', 'locked', 'container', 'containername', 'authmethod', 'authstate', 'accountStatus'];
      fields.forEach(field => {
        const fieldPattern = new RegExp(`<${field}>([^<]*)<\\/${field}>`, 'i');
        const fieldMatch = rowContent.match(fieldPattern);
        if (fieldMatch) {
          user[field.toLowerCase()] = fieldMatch[1];
        }
      });

      // Normalize: userid -> username if username not present
      if (user.userid && !user.username) {
        user.username = user.userid;
      }

      if (user.username || user.userid) {
        users.push(user);
      }
    }

    return { users, rawResponse: xmlText };
  } catch (e) {
    return { error: e.message, users: [], rawResponse: xmlText };
  }
}

/**
 * Mask sensitive data in SOAP envelope
 * @param {string} soapXml - SOAP XML string
 * @returns {string} - Masked SOAP XML
 */
function maskSoapEnvelope(soapXml) {
  // Mask password/OTP in Connect request
  let masked = soapXml.replace(
    /(<OTP>)(.*?)(<\/OTP>)/g,
    '$1***$3'
  );
  // Mask cookie values if present
  masked = masked.replace(
    /(ASP\.NET_SessionId=)([^;]+)/g,
    '$1***'
  );
  return masked;
}

module.exports = {
  xmlEscape,
  parseSoapResponse,
  parseSoapArrayResponse,
  parseDataTableResponse,
  maskSoapEnvelope
};
