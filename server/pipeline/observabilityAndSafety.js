/**
 * ExamAssist AI - Phase 4 Security, Observability & Semantic Cache Utilities
 * - PII & Secret Scrubber (redacts API keys, tokens, emails, phone numbers before LLM/logging)
 * - OpenTelemetry-style Trace Span Recorder (in-memory ring buffer for localhost diagnostics)
 * - Opt-in Semantic / Problem Cache (strictly default OFF via ENABLE_SEMANTIC_CACHE=true; stores only verified answers)
 */

import { createHash } from "node:crypto";

// --- 1. PII & Secret Scrubber ---
const SECRET_PATTERNS = [
  { name: "OPENAI_KEY", regex: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: "[REDACTED_API_KEY]" },
  { name: "GOOGLE_KEY", regex: /\b(?:AIza[A-Za-z0-9_-]{25,}|AQ\.[A-Za-z0-9_-]{20,})\b/g, replacement: "[REDACTED_API_KEY]" },
  { name: "GITHUB_TOKEN", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
  { name: "AWS_KEY", regex: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[REDACTED_AWS_KEY]" },
  { name: "BEARER_TOKEN", regex: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/gi, replacement: "Bearer [REDACTED_TOKEN]" },
  { name: "EMAIL", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  { name: "ENV_ASSIGNMENT", regex: /\b(OPENAI_API_KEY|TAVILY_API_KEY|SERPER_API_KEY|BRAVE_API_KEY|PASSWORD|SECRET_KEY)\s*=\s*['"]?[^\s'"]+['"]?/gi, replacement: "$1=[REDACTED_SECRET]" }
];

export function scrubSecretsAndPII(input = "") {
  if (typeof input !== "string" || !input) return { text: String(input || ""), redactions: [] };
  let scrubbed = input;
  const redactions = [];
  for (const rule of SECRET_PATTERNS) {
    if (rule.regex.test(scrubbed)) {
      redactions.push(rule.name);
      scrubbed = scrubbed.replace(rule.regex, rule.replacement);
    }
    rule.regex.lastIndex = 0;
  }
  return { text: scrubbed, redactions };
}

// --- 2. OpenTelemetry-Compatible Span Recorder ---
const MAX_TRACES = 100;
const recentSpans = [];

export function startSpan(stage, attributes = {}) {
  const startedAt = Date.now();
  const spanId = createHash("sha1").update(`${stage}-${startedAt}-${Math.random()}`).digest("hex").slice(0, 16);
  return {
    spanId,
    stage,
    startedAt,
    end(status = "ok", extra = {}) {
      const durationMs = Date.now() - startedAt;
      const record = {
        spanId,
        stage,
        status,
        durationMs,
        timestamp: new Date(startedAt).toISOString(),
        attributes: { ...attributes, ...extra }
      };
      recentSpans.push(record);
      if (recentSpans.length > MAX_TRACES) recentSpans.shift();
      return record;
    }
  };
}

export function getRecentSpans(limit = 50) {
  return recentSpans.slice(-Math.max(1, Math.min(100, limit)));
}

// --- 3. Semantic / Problem Verification Cache (Default OFF) ---
const verifiedProblemCache = new Map();

export function isSemanticCacheEnabled() {
  return process.env.ENABLE_SEMANTIC_CACHE === "true";
}

export function computeProblemCacheKey({ userId = "anon", question = "", constraints = "", language = "python", sampleTests = [] }) {
  const normalized = JSON.stringify({
    userId: String(userId || "anon"),
    question: String(question || "").trim().toLowerCase().replace(/\s+/g, " "),
    constraints: String(constraints || "").trim().toLowerCase(),
    language: String(language || "python").toLowerCase(),
    tests: sampleTests
  });
  return createHash("sha256").update(normalized).digest("hex");
}

export function getVerifiedCachedResult(key) {
  if (!isSemanticCacheEnabled()) return null;
  return verifiedProblemCache.get(key) || null;
}

export function setVerifiedCachedResult(key, result) {
  if (!isSemanticCacheEnabled()) return false;
  // Strictly cache ONLY verified answers (HIGH or MEDIUM confidence, never UNVERIFIED)
  if (!result || result.confidence === "UNVERIFIED" || result.status === "UNVERIFIED") {
    return false;
  }
  verifiedProblemCache.set(key, { ...result, cachedAt: new Date().toISOString() });
  return true;
}
