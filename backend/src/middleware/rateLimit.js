// In-memory rate limiter for login attempts
// Tracks failed login attempts per IP. After maxAttempts failures within windowMs,
// blocks that IP for windowMs. Returns 429 with retry info.

const loginAttempts = new Map(); // ip -> { count, firstAttempt, blockedUntil }

const WINDOW_MS    = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

export function loginRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();

  let record = loginAttempts.get(ip);

  // Clean up expired records
  if (record && record.blockedUntil && now > record.blockedUntil) {
    loginAttempts.delete(ip);
    record = undefined;
  }
  if (record && !record.blockedUntil && (now - record.firstAttempt) > WINDOW_MS) {
    loginAttempts.delete(ip);
    record = undefined;
  }

  // Check if IP is currently blocked
  if (record?.blockedUntil && now < record.blockedUntil) {
    const remainMs = record.blockedUntil - now;
    const remainMin = Math.ceil(remainMs / 60000);
    return res.status(429).json({
      success: false,
      error: `Too many login attempts. Try again in ${remainMin} minute${remainMin !== 1 ? 's' : ''}.`,
      retryAfter: Math.ceil(remainMs / 1000),
    });
  }

  // Store original res.json to intercept failed login responses
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    // If login failed (401 or success:false), count the attempt
    if (res.statusCode === 401 || (body && body.success === false)) {
      let rec = loginAttempts.get(ip);
      if (!rec) {
        rec = { count: 0, firstAttempt: now, blockedUntil: null };
        loginAttempts.set(ip, rec);
      }
      rec.count++;
      if (rec.count >= MAX_ATTEMPTS) {
        rec.blockedUntil = now + WINDOW_MS;
        console.log(`[RATE-LIMIT] IP ${ip} blocked for 15 minutes after ${rec.count} failed login attempts`);
      }
    } else if (body && body.success === true) {
      // Successful login — clear the record
      loginAttempts.delete(ip);
    }
    return originalJson(body);
  };

  next();
}

// Periodic cleanup of stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (record.blockedUntil && now > record.blockedUntil) {
      loginAttempts.delete(ip);
    } else if (!record.blockedUntil && (now - record.firstAttempt) > WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);
