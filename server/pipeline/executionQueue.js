/**
 * ExamAssist AI - Sandbox Execution Job Queue (Phase 2)
 * - BullMQ + Redis job queue when REDIS_URL is configured and reachable
 * - Per-user concurrency limits (MAX_CONCURRENT_JOBS_PER_USER)
 * - Queue wait timeouts (QUEUE_TIMEOUT_MS)
 * - Compile-once SHA-256 code hash tracking
 * - Clean fallback to in-memory per-user bounded queue when Redis is not configured
 */

import crypto from "crypto";
import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";

const DEFAULT_PER_USER_CONCURRENCY = Number(process.env.SANDBOX_USER_CONCURRENCY || 2);
const DEFAULT_QUEUE_TIMEOUT_MS = Number(process.env.SANDBOX_QUEUE_TIMEOUT_MS || 8000);
const QUEUE_NAME = "examassist-sandbox-exec";

const activeCountByUser = new Map();
const waitQueueByUser = new Map();
const compiledHashes = new Set();

let totalEnqueued = 0;
let totalCompleted = 0;
let totalTimedOutInQueue = 0;
let compileCacheHits = 0;

let bullQueue = null;
let bullWorker = null;
let bullEvents = null;
let redisConnected = false;
let redisInitAttempted = false;
let directExecutorFn = null;

export function computeCodeHash(language = "python", code = "") {
  return crypto
    .createHash("sha256")
    .update(`${String(language).toLowerCase()}:${String(code)}`)
    .digest("hex")
    .slice(0, 32);
}

export async function initBullMqIfConfigured(executor) {
  directExecutorFn = executor;
  const redisUrl = process.env.REDIS_URL || "";
  if (!redisUrl || redisInitAttempted) return redisConnected;
  redisInitAttempted = true;

  try {
    const connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 1200,
      lazyConnect: true
    });
    connection.on("error", () => {});
    await connection.connect();
    await connection.ping();

    bullQueue = new Queue(QUEUE_NAME, { connection });
    bullEvents = new QueueEvents(QUEUE_NAME, { connection: connection.duplicate({ maxRetriesPerRequest: null }) });
    bullWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        if (!directExecutorFn) {
          return { executed: false, error: "Sandbox executor not registered" };
        }
        return await directExecutorFn(job.data.path, job.data.payload);
      },
      {
        connection: connection.duplicate({ maxRetriesPerRequest: null }),
        concurrency: Number(process.env.SANDBOX_GLOBAL_CONCURRENCY || 8)
      }
    );
    redisConnected = true;
    return true;
  } catch {
    redisConnected = false;
    return false;
  }
}

/**
 * Acquires a per-user concurrency slot with a strict queue wait timeout.
 */
function acquireUserSlot(userId = "anon", maxConcurrent = DEFAULT_PER_USER_CONCURRENCY, queueTimeoutMs = DEFAULT_QUEUE_TIMEOUT_MS) {
  const key = String(userId || "anon");
  const current = activeCountByUser.get(key) || 0;

  if (current < maxConcurrent) {
    activeCountByUser.set(key, current + 1);
    return Promise.resolve(() => releaseUserSlot(key));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const q = waitQueueByUser.get(key) || [];
      const idx = q.findIndex((entry) => entry.timer === timer);
      if (idx >= 0) q.splice(idx, 1);
      totalTimedOutInQueue++;
      const err = new Error(`Sandbox queue timeout exceeded (${queueTimeoutMs}ms) for user ${key}`);
      err.code = "SANDBOX_QUEUE_TIMEOUT";
      reject(err);
    }, queueTimeoutMs);

    const waiters = waitQueueByUser.get(key) || [];
    waiters.push({
      timer,
      grant: () => {
        clearTimeout(timer);
        resolve(() => releaseUserSlot(key));
      }
    });
    waitQueueByUser.set(key, waiters);
  });
}

function releaseUserSlot(userId = "anon") {
  const key = String(userId || "anon");
  const waiters = waitQueueByUser.get(key) || [];
  if (waiters.length > 0) {
    const next = waiters.shift();
    next.grant();
    return;
  }
  const current = activeCountByUser.get(key) || 1;
  if (current <= 1) {
    activeCountByUser.delete(key);
  } else {
    activeCountByUser.set(key, current - 1);
  }
}

/**
 * Enqueues a sandbox execution request with per-user concurrency limits, queue timeout,
 * and compile-once hash tracking.
 */
export async function enqueueSandboxExecution({
  path = "/execute",
  payload = {},
  userId = "anon",
  maxConcurrentPerUser = DEFAULT_PER_USER_CONCURRENCY,
  queueTimeoutMs = DEFAULT_QUEUE_TIMEOUT_MS,
  executor
}) {
  totalEnqueued++;
  const lang = String(payload?.language || "python").toLowerCase();
  const code = String(payload?.code || "");
  const codeHash = code ? computeCodeHash(lang, code) : null;
  const isCompiledLang = lang === "c" || lang === "cpp" || lang === "java";
  const wasPreCompiled = Boolean(codeHash && isCompiledLang && compiledHashes.has(codeHash));
  if (wasPreCompiled) {
    compileCacheHits++;
  }

  let release;
  try {
    release = await acquireUserSlot(userId, maxConcurrentPerUser, queueTimeoutMs);
  } catch (err) {
    return {
      executed: false,
      queueTimedOut: true,
      code: err.code || "SANDBOX_QUEUE_TIMEOUT",
      error: err.message
    };
  }

  try {
    await initBullMqIfConfigured(executor);
    let result;
    if (redisConnected && bullQueue && bullEvents) {
      const job = await bullQueue.add(
        "sandbox-run",
        { path, payload: { ...payload, codeHash }, userId },
        { removeOnComplete: true, removeOnFail: true }
      );
      result = await job.waitUntilFinished(bullEvents, queueTimeoutMs);
    } else {
      result = await executor(path, { ...payload, codeHash });
    }

    if (result?.executed && isCompiledLang && codeHash && !result.compileError) {
      compiledHashes.add(codeHash);
      if (wasPreCompiled && result.compileCached === undefined) {
        result.compileCached = true;
      }
    }
    if (codeHash && result && typeof result === "object") {
      result.codeHash = result.codeHash || codeHash;
    }

    totalCompleted++;
    return result;
  } catch (err) {
    return {
      executed: false,
      error: err.message || "Sandbox job execution failed"
    };
  } finally {
    release?.();
  }
}

export function getSandboxQueueStatus() {
  let activeJobs = 0;
  for (const count of activeCountByUser.values()) activeJobs += count;
  let waitingJobs = 0;
  for (const list of waitQueueByUser.values()) waitingJobs += list.length;

  return {
    engine: redisConnected ? "bullmq-redis" : "in-memory-bounded",
    redisConnected,
    perUserConcurrencyLimit: DEFAULT_PER_USER_CONCURRENCY,
    queueTimeoutMs: DEFAULT_QUEUE_TIMEOUT_MS,
    activeJobs,
    waitingJobs,
    totalEnqueued,
    totalCompleted,
    totalTimedOutInQueue,
    compileCacheEntries: compiledHashes.size,
    compileCacheHits
  };
}
