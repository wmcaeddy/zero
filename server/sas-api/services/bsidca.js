const { BSIDCA_URL, BSIDCA_EMAIL, BSIDCA_USER, BSIDCA_PASSWORD } = require('../config');
const { xmlEscape, parseSoapResponse } = require('../utils/xml');

// BSIDCA session management
let bsidcaSessionCookie = null;
let bsidcaSessionExpiry = null;

/**
 * BSIDCA: Authenticate and establish session
 * @returns {Promise<object>} - Authentication result with cookie
 */
async function connectBSIDCA() {
  // Check if we have a valid session
  if (bsidcaSessionCookie && bsidcaSessionExpiry && Date.now() < bsidcaSessionExpiry) {
    return { success: true, cookie: bsidcaSessionCookie, cached: true };
  }

  // Use BSIDCA_EMAIL for operator email, fall back to BSIDCA_USER if not set
  const operatorEmail = BSIDCA_EMAIL || BSIDCA_USER;

  if (!operatorEmail || !BSIDCA_PASSWORD) {
    return { success: false, error: 'BSIDCA credentials not configured (need BSIDCA_Email and BSIDCA_Password)' };
  }

  // Build SOAP envelope for Connect
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Connect xmlns="http://www.cryptocard.com/blackshield/">
      <OperatorEmail>${operatorEmail}</OperatorEmail>
      <OTP>${BSIDCA_PASSWORD}</OTP>
    </Connect>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch(BSIDCA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.cryptocard.com/blackshield/Connect'
      },
      body: soapEnvelope
    });

    const responseText = await response.text();
    const parsed = parseSoapResponse(responseText, 'Connect');

    // Extract session cookie from response headers
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      bsidcaSessionCookie = setCookie.split(';')[0];
      bsidcaSessionExpiry = Date.now() + (20 * 60 * 1000); // Session valid for 20 minutes
    }

    const connectResult = parsed.parsed?.ConnectResult || 'UNKNOWN';

    if (connectResult === 'AUTH_SUCCESS') {
      return {
        success: true,
        cookie: bsidcaSessionCookie,
        result: connectResult,
        parsed: parsed.parsed
      };
    } else if (connectResult === 'CHALLENGE') {
      return {
        success: false,
        error: 'Challenge authentication not supported in this demo',
        result: connectResult,
        challenge: parsed.parsed?.challenge
      };
    } else {
      return {
        success: false,
        error: `Authentication failed: ${connectResult}`,
        result: connectResult,
        parsed: parsed.parsed
      };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  connectBSIDCA
};
