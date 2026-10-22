/**
 * ExamAssist AI - Hardened Rate Limiter Middleware
 * Features:
 * - Keyed strictly on req.ip (never raw X-Forwarded-For headers)
 * - LRU-capped in-memory map to prevent memory exhaustion
 * - Optional Redis-backed distributed store support
 * - Window reset and precise sliding-window rate tracking
 */

export class LRUMap {
  constructor(maxEntries = 10000) {
    this.maxEntries = Math.max(1, maxEntries);
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    // Refresh access order (move to most recent)
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      // Evict oldest (first key in map iterator)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
    return this;
  }

  has(key) {
    return this.map.has(key);
  }

  delete(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }

  keys() {
    return this.map.keys();
  }

  entries() {
    return this.map.entries();
  }
}

export class MemoryRateLimitStore {
  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
    this.clients = new LRUMap(maxEntries);
  }

  async increment(key, windowMs) {
    const now = Date.now();
    const timestamps = this.clients.get(key) || [];
    const windowStart = now - windowMs;
    const recent = timestamps.filter(t => t > windowStart);
    recent.push(now);
    this.clients.set(key, recent);
    const oldestTimestamp = recent[0] || now;
    return { count: recent.length, oldestTimestamp };
  }

  async reset(key) {
    this.clients.delete(key);
  }

  async clear() {
    this.clients.clear();
  }

  get size() {
    return this.clients.size;
  }
}

export class RedisRateLimitStore {
  constructor(redisClient, keyPrefix = "examassist:rl:") {
    if (!redisClient) {
      throw new Error("RedisRateLimitStore requires an active Redis client");
    }
    this.client = redisClient;
    this.keyPrefix = keyPrefix;
  }

  async increment(key, windowMs) {
    const redisKey = `${this.keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const member = `${now}:${Math.random().toString(36).slice(2, 9)}`;

    const multi = this.client.multi();
    multi.zremrangebyscore(redisKey, 0, windowStart);
    multi.zadd(redisKey, now, member);
    multi.zcard(redisKey);
    multi.zrange(redisKey, 0, 0, "WITHSCORES");
    multi.pexpire(redisKey, windowMs * 2);

    const results = await multi.exec();
    const count = (results && results[2] && results[2][1]) || 1;
    const oldestRange = results && results[3] && results[3][1];
    let oldestTimestamp = now;
    if (Array.isArray(oldestRange) && oldestRange.length >= 2) {
      oldestTimestamp = Number(oldestRange[1]);
    }
    return { count, oldestTimestamp };
  }

  async reset(key) {
    const redisKey = `${this.keyPrefix}${key}`;
    await this.client.del(redisKey);
  }

  async clear() {
    // Optional helper for test cleanup if needed
    const keys = await this.client.keys(`${this.keyPrefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}

export function createRateLimiter({
  windowMs = 60 * 1000,
  maxRequests = 60,
  maxEntries = Number(process.env.RATE_LIMIT_MAX_ENTRIES || 10000),
  store = null,
  redisClient = null,
  keyGenerator = null,
  skipTestEnv = true
} = {}) {
  const activeStore = store || (redisClient ? new RedisRateLimitStore(redisClient) : new MemoryRateLimitStore(maxEntries));

  const middleware = async (req, res, next) => {
    if (skipTestEnv && process.env.NODE_ENV === "test") {
      return next();
    }

    // Key on req.ip (configured via Express trust proxy), never directly reading raw X-Forwarded-For
    let ip = "127.0.0.1";
    try {
      ip = keyGenerator ? keyGenerator(req) : (req.ip || req.socket?.remoteAddress || "127.0.0.1");
    } catch {
      ip = "127.0.0.1";
    }

    try {
      const { count, oldestTimestamp } = await activeStore.increment(ip, windowMs);

      if (count > maxRequests) {
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestTimestamp + windowMs - Date.now()) / 1000));
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please wait a moment before submitting another request.",
          retryAfterSeconds
        });
      }

      next();
    } catch (err) {
      // In case of store error, fail open to avoid taking down service
      next();
    }
  };

  middleware.store = activeStore;
  return middleware;
}
