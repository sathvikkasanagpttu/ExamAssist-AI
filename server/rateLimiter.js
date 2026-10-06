/**
 * ExamAssist AI - Rate Limiter Middleware
 * Sliding window rate limiter for Express without external database dependencies.
 */

export function createRateLimiter({
  windowMs = 60 * 1000, // 1 minute
  maxRequests = 60      // 60 requests per minute
} = {}) {
  const clients = new Map();

  // Periodic cleanup every 2 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of clients.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) clients.delete(ip);
      else clients.set(ip, valid);
    }
  }, windowMs * 2).unref();

  return (req, res, next) => {
    // Disable in test environment to avoid test flakiness
    if (process.env.NODE_ENV === "test") return next();

    let ip = "127.0.0.1";
    try {
      ip = req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || req.connection?.remoteAddress || (req.ip ? req.ip : "127.0.0.1");
    } catch {
      ip = "127.0.0.1";
    }
    const now = Date.now();
    const timestamps = clients.get(ip) || [];

    const windowStart = now - windowMs;
    const recent = timestamps.filter(t => t > windowStart);

    if (recent.length >= maxRequests) {
      return res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please wait a moment before submitting another request.",
        retryAfterSeconds: Math.ceil((recent[0] + windowMs - now) / 1000)
      });
    }

    recent.push(now);
    clients.set(ip, recent);
    next();
  };
}
