/**
 * Rate Limiting Middleware
 * In-memory rate limiter to prevent brute force attacks
 */

const rateLimitStore = {
  byIp: new Map(),      // IP address -> { attempts: number, resetAt: timestamp }
  byUsername: new Map() // username -> { attempts: number, resetAt: timestamp }
};

// Cleanup old rate limit entries every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();

  // Clean IP records
  for (const [key, value] of rateLimitStore.byIp.entries()) {
    if (now > value.resetAt) {
      rateLimitStore.byIp.delete(key);
    }
  }

  // Clean username records
  for (const [key, value] of rateLimitStore.byUsername.entries()) {
    if (now > value.resetAt) {
      rateLimitStore.byUsername.delete(key);
    }
  }

  console.log(`[RateLimit] Cleanup: ${rateLimitStore.byIp.size} IPs, ${rateLimitStore.byUsername.size} usernames tracked`);
}, 10 * 60 * 1000); // 10 minutes

/**
 * Rate limiting middleware for authentication endpoints
 * - Limits by IP: 5 attempts per minute
 * - Limits by username: 10 attempts per 5 minutes
 */
const authRateLimiter = (req, res, next) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { username } = req.body;

  const now = Date.now();

  // Check IP-based rate limit (5 attempts per minute)
  const ipLimit = 5;
  const ipWindow = 60 * 1000; // 1 minute

  let ipRecord = rateLimitStore.byIp.get(clientIp);
  if (!ipRecord || now > ipRecord.resetAt) {
    // Create new record or reset expired one
    ipRecord = { attempts: 0, resetAt: now + ipWindow };
    rateLimitStore.byIp.set(clientIp, ipRecord);
  }

  ipRecord.attempts++;

  if (ipRecord.attempts > ipLimit) {
    const retryAfter = Math.ceil((ipRecord.resetAt - now) / 1000);
    console.log(`[RateLimit] IP ${clientIp} exceeded limit: ${ipRecord.attempts}/${ipLimit}`);

    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      success: false,
      error: 'Too many authentication attempts',
      message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
      retryAfter: retryAfter,
      limitType: 'ip',
      limit: `${ipLimit} attempts per minute`
    });
  }

  // Check username-based rate limit (10 attempts per 5 minutes)
  if (username) {
    const usernameLimit = 10;
    const usernameWindow = 5 * 60 * 1000; // 5 minutes

    let usernameRecord = rateLimitStore.byUsername.get(username);
    if (!usernameRecord || now > usernameRecord.resetAt) {
      // Create new record or reset expired one
      usernameRecord = { attempts: 0, resetAt: now + usernameWindow };
      rateLimitStore.byUsername.set(username, usernameRecord);
    }

    usernameRecord.attempts++;

    if (usernameRecord.attempts > usernameLimit) {
      const retryAfter = Math.ceil((usernameRecord.resetAt - now) / 1000);
      console.log(`[RateLimit] Username ${username} exceeded limit: ${usernameRecord.attempts}/${usernameLimit}`);

      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: 'Too many authentication attempts for this account',
        message: `Rate limit exceeded for this username. Please try again in ${retryAfter} seconds.`,
        retryAfter: retryAfter,
        limitType: 'username',
        limit: `${usernameLimit} attempts per 5 minutes`
      });
    }
  }

  // Rate limit checks passed
  next();
};

module.exports = {
  authRateLimiter
};
