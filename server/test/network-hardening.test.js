import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { isOriginAllowed, parseAllowedOrigins, matchesOriginRule } from "../server.js";
import {
  LRUMap,
  MemoryRateLimitStore,
  RedisRateLimitStore,
  createRateLimiter
} from "../rateLimiter.js";

// Helper to simulate express requests
function createMockReqRes({ ip = "127.0.0.1", headers = {}, socket = { remoteAddress: "127.0.0.1" } } = {}) {
  const req = {
    ip,
    headers: { ...headers },
    socket,
    connection: socket
  };
  let statusCode = 200;
  let jsonBody = null;
  const resHeaders = {};

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(k, v) {
      resHeaders[k.toLowerCase()] = v;
      return this;
    },
    getHeader(k) {
      return resHeaders[k.toLowerCase()];
    },
    json(data) {
      jsonBody = data;
      return this;
    },
    getStatusCode: () => statusCode,
    getBody: () => jsonBody,
    getHeaders: () => resHeaders
  };

  return { req, res };
}

// ==========================================
// 1. CORS & Host Binding Tests
// ==========================================

test("CORS: explicit ALLOWED_ORIGINS matches allowed origins", () => {
  const env = {
    ALLOWED_ORIGINS: "https://myportal.edu, https://examassist.ai",
    NODE_ENV: "production"
  };

  assert.equal(isOriginAllowed("https://myportal.edu", env), true);
  assert.equal(isOriginAllowed("https://examassist.ai", env), true);
  assert.equal(isOriginAllowed("https://evil.com", env), false);
});

test("CORS: EXTENSION_ID allows specific chrome-extension origin but rejects others", () => {
  const env = {
    ALLOWED_ORIGINS: "https://myportal.edu",
    EXTENSION_ID: "abcdefghijklmnopabcdefghijklmnop",
    NODE_ENV: "production"
  };

  const allowedOrigin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
  const untrustedExtOrigin = "chrome-extension://maliciousunknownextensionid";

  assert.equal(isOriginAllowed(allowedOrigin, env), true);
  assert.equal(isOriginAllowed(untrustedExtOrigin, env), false);
});

test("CORS: rejects blanket chrome-extension:// when not explicitly allowed", () => {
  const env = {
    ALLOWED_ORIGINS: "https://trusted.com",
    NODE_ENV: "production"
  };
  assert.equal(isOriginAllowed("chrome-extension://randomextensionid", env), false);
});

test("CORS: matches chrome-extension://* wildcard when configured", () => {
  const env = {
    ALLOWED_ORIGINS: "http://localhost:8787,chrome-extension://*",
    NODE_ENV: "production"
  };
  assert.equal(isOriginAllowed("chrome-extension://abcdefghijklmnop", env), true);
  assert.equal(isOriginAllowed("chrome-extension://anotherid12345678", env), true);
  assert.equal(isOriginAllowed("https://evil.com", env), false);
});

test("CORS: matches domain and subdomain wildcards (e.g. https://*.leetcode.com)", () => {
  const env = {
    ALLOWED_ORIGINS: "https://*.leetcode.com, https://*.hackerrank.com",
    NODE_ENV: "production"
  };
  assert.equal(isOriginAllowed("https://leetcode.com", env), true);
  assert.equal(isOriginAllowed("https://discuss.leetcode.com", env), true);
  assert.equal(isOriginAllowed("https://www.hackerrank.com", env), true);
  assert.equal(isOriginAllowed("https://attacker-leetcode.com", env), false);
  assert.equal(isOriginAllowed("https://otherdomain.com", env), false);
});

test("CORS: rejects 'null' origin unless explicitly listed in ALLOWED_ORIGINS", () => {
  const envWithoutNull = {
    ALLOWED_ORIGINS: "https://trusted.com",
    NODE_ENV: "production"
  };
  assert.equal(isOriginAllowed("null", envWithoutNull), false);

  const envWithNull = {
    ALLOWED_ORIGINS: "null, https://trusted.com",
    NODE_ENV: "production"
  };
  assert.equal(isOriginAllowed("null", envWithNull), true);
});

test("CORS: development mode allows only localhost and 127.0.0.1, not arbitrary domains", () => {
  const devEnv = {
    ALLOWED_ORIGINS: "",
    NODE_ENV: "development"
  };

  assert.equal(isOriginAllowed("http://localhost:3000", devEnv), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:8787", devEnv), true);
  assert.equal(isOriginAllowed("https://evil.com", devEnv), false);
  assert.equal(isOriginAllowed("https://attacker.org", devEnv), false);
});

test("CORS: production mode rejects localhost unless explicitly in ALLOWED_ORIGINS", () => {
  const prodEnv = {
    ALLOWED_ORIGINS: "https://examassist.ai",
    NODE_ENV: "production"
  };

  assert.equal(isOriginAllowed("http://localhost:3000", prodEnv), false);
  assert.equal(isOriginAllowed("http://127.0.0.1:8787", prodEnv), false);
});

// ==========================================
// 2. Rate Limiter Tests (Spoofing, Cap, Window Reset, Redis)
// ==========================================

test("Rate limiter: header spoofing prevention (keys on req.ip, ignores raw X-Forwarded-For)", async () => {
  const limiter = createRateLimiter({
    windowMs: 5000,
    maxRequests: 2,
    skipTestEnv: false
  });

  // Client socket is 127.0.0.1. Express with trust proxy = false resolves req.ip as 127.0.0.1
  const { req: req1, res: res1 } = createMockReqRes({
    ip: "127.0.0.1",
    headers: { "x-forwarded-for": "198.51.100.1" }
  });
  let calledNext1 = false;
  await limiter(req1, res1, () => { calledNext1 = true; });
  assert.equal(calledNext1, true);

  // Second request from same socket, but attempting to spoof different X-Forwarded-For
  const { req: req2, res: res2 } = createMockReqRes({
    ip: "127.0.0.1",
    headers: { "x-forwarded-for": "198.51.100.2" }
  });
  let calledNext2 = false;
  await limiter(req2, res2, () => { calledNext2 = true; });
  assert.equal(calledNext2, true);

  // Third request: limit is 2. Even with a brand new spoofed X-Forwarded-For header, it must be blocked!
  const { req: req3, res: res3 } = createMockReqRes({
    ip: "127.0.0.1",
    headers: { "x-forwarded-for": "198.51.100.3" }
  });
  let calledNext3 = false;
  await limiter(req3, res3, () => { calledNext3 = true; });
  assert.equal(calledNext3, false);
  assert.equal(res3.getStatusCode(), 429);
  assert.equal(res3.getBody().error, "Too Many Requests");
});

test("Rate limiter: LRU cap behavior strictly enforces maxEntries limit", async () => {
  const maxEntries = 3;
  const store = new MemoryRateLimitStore(maxEntries);

  // Add 3 entries
  await store.increment("1.1.1.1", 60000);
  await store.increment("2.2.2.2", 60000);
  await store.increment("3.3.3.3", 60000);
  assert.equal(store.size, 3);

  // Access 1.1.1.1 so 2.2.2.2 becomes the least recently used
  await store.increment("1.1.1.1", 60000);

  // Add 4th entry - should evict 2.2.2.2
  await store.increment("4.4.4.4", 60000);
  assert.equal(store.size, 3);

  // Check that 2.2.2.2 was evicted
  assert.equal(store.clients.has("2.2.2.2"), false);
  assert.equal(store.clients.has("1.1.1.1"), true);
  assert.equal(store.clients.has("3.3.3.3"), true);
  assert.equal(store.clients.has("4.4.4.4"), true);

  // Add 5th entry - should evict 3.3.3.3
  await store.increment("5.5.5.5", 60000);
  assert.equal(store.size, 3);
  assert.equal(store.clients.has("3.3.3.3"), false);
  assert.equal(store.clients.has("5.5.5.5"), true);
});

test("Rate limiter: window reset clears rate count and allows subsequent requests", async () => {
  const store = new MemoryRateLimitStore(100);
  const limiter = createRateLimiter({
    windowMs: 50,
    maxRequests: 1,
    store,
    skipTestEnv: false
  });

  const { req: req1, res: res1 } = createMockReqRes({ ip: "10.0.0.1" });
  let calledNext1 = false;
  await limiter(req1, res1, () => { calledNext1 = true; });
  assert.equal(calledNext1, true);

  // Second request exceeds limit
  const { req: req2, res: res2 } = createMockReqRes({ ip: "10.0.0.1" });
  let calledNext2 = false;
  await limiter(req2, res2, () => { calledNext2 = true; });
  assert.equal(calledNext2, false);
  assert.equal(res2.getStatusCode(), 429);

  // Explicit reset of the key
  await store.reset("10.0.0.1");

  // Subsequent request succeeds immediately after reset
  const { req: req3, res: res3 } = createMockReqRes({ ip: "10.0.0.1" });
  let calledNext3 = false;
  await limiter(req3, res3, () => { calledNext3 = true; });
  assert.equal(calledNext3, true);

  // Also verify time-based window expiration
  const { req: req4, res: res4 } = createMockReqRes({ ip: "10.0.0.2" });
  await limiter(req4, res4, () => {});
  // Wait for windowMs (50ms) to pass
  await new Promise(r => setTimeout(r, 60));

  const { req: req5, res: res5 } = createMockReqRes({ ip: "10.0.0.2" });
  let calledNext5 = false;
  await limiter(req5, res5, () => { calledNext5 = true; });
  assert.equal(calledNext5, true);
});

test("Rate limiter: optional Redis store implementation", async () => {
  // Mock Redis client with multi() support
  const storage = new Map();
  const mockRedisClient = {
    multi() {
      const ops = [];
      return {
        zremrangebyscore(key, min, max) {
          ops.push(["zremrangebyscore", key, min, max]);
          return this;
        },
        zadd(key, score, member) {
          ops.push(["zadd", key, score, member]);
          return this;
        },
        zcard(key) {
          ops.push(["zcard", key]);
          return this;
        },
        zrange(key, start, stop, withScores) {
          ops.push(["zrange", key, start, stop, withScores]);
          return this;
        },
        pexpire(key, ms) {
          ops.push(["pexpire", key, ms]);
          return this;
        },
        async exec() {
          let count = 0;
          let oldest = [Date.now().toString(), Date.now()];
          for (const [op, key, ...args] of ops) {
            if (op === "zadd") {
              const current = storage.get(key) || [];
              current.push({ score: args[0], member: args[1] });
              storage.set(key, current);
            } else if (op === "zcard") {
              count = (storage.get(key) || []).length;
            } else if (op === "zrange") {
              const current = storage.get(key) || [];
              if (current.length > 0) {
                oldest = [current[0].member, current[0].score];
              }
            }
          }
          return [
            [null, 0],
            [null, 1],
            [null, count],
            [null, oldest],
            [null, 1]
          ];
        }
      };
    },
    async del(key) {
      storage.delete(key);
    }
  };

  const redisStore = new RedisRateLimitStore(mockRedisClient);
  const limiter = createRateLimiter({
    windowMs: 60000,
    maxRequests: 2,
    store: redisStore,
    skipTestEnv: false
  });

  const { req: r1, res: s1 } = createMockReqRes({ ip: "192.168.1.100" });
  let next1 = false;
  await limiter(r1, s1, () => { next1 = true; });
  assert.equal(next1, true);

  const { req: r2, res: s2 } = createMockReqRes({ ip: "192.168.1.100" });
  let next2 = false;
  await limiter(r2, s2, () => { next2 = true; });
  assert.equal(next2, true);

  const { req: r3, res: s3 } = createMockReqRes({ ip: "192.168.1.100" });
  let next3 = false;
  await limiter(r3, s3, () => { next3 = true; });
  assert.equal(next3, false);
  assert.equal(s3.getStatusCode(), 429);

  // Reset
  await redisStore.reset("192.168.1.100");
  const { req: r4, res: s4 } = createMockReqRes({ ip: "192.168.1.100" });
  let next4 = false;
  await limiter(r4, s4, () => { next4 = true; });
  assert.equal(next4, true);
});
