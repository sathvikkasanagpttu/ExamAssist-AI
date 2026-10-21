/**
 * ExamAssist AI — Phase 5: OpenTelemetry Observability, Redaction & Safety Utilities
 *
 * Features:
 * 1. PII & Secret Scrubber (redacts API keys, tokens, emails, env assignments)
 * 2. Default Redaction of Code and Question Text in OpenTelemetry span attributes
 *    (controlled by OTEL_REDACT_CODE_AND_QUESTIONS, default true)
 * 3. W3C OpenTelemetry Spans for every pipeline stage and tool call
 * 4. OTLP HTTP/JSON Exporter (OTEL_EXPORTER_OTLP_ENDPOINT) and Optional Langfuse Exporter
 *    (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_HOST)
 * 5. Localhost-only Trace Viewer buffer (`isLocalhostRequest` guard + `getRecentSpans`)
 * 6. Opt-in Semantic / Problem Verification Cache (strictly default OFF; caches only verified results)
 */

import { createHash, randomBytes } from "node:crypto";
import { APP_VERSION } from "../schemas.js";

// --- 1. PII & Secret Scrubber ---
const SECRET_PATTERNS = [
  { name: "OPENAI_KEY", regex: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: "[REDACTED_API_KEY]" },
  { name: "GOOGLE_KEY", regex: /\b(?:AIza[A-Za-z0-9_-]{25,}|AQ\.[A-Za-z0-9_-]{20,})\b/g, replacement: "[REDACTED_API_KEY]" },
  { name: "GITHUB_TOKEN", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
  { name: "AWS_KEY", regex: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[REDACTED_AWS_KEY]" },
  { name: "BEARER_TOKEN", regex: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/gi, replacement: "Bearer [REDACTED_TOKEN]" },
  { name: "EMAIL", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  {
    name: "ENV_ASSIGNMENT",
    regex: /\b(OPENAI_API_KEY|TAVILY_API_KEY|SERPER_API_KEY|BRAVE_API_KEY|LANGFUSE_SECRET_KEY|PASSWORD|SECRET_KEY)\s*=\s*['"]?[^\s'"]+['"]?/gi,
    replacement: "$1=[REDACTED_SECRET]"
  }
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

// --- 2. Default Redaction of Code and Question Text ---
const SENSITIVE_CONTENT_KEYS = new Set([
  "code",
  "usercode",
  "startercode",
  "sourcecode",
  "referencecode",
  "question",
  "statement",
  "prompt",
  "userprompt",
  "systemprompt",
  "stdin",
  "stdout",
  "stderr",
  "imagedataurl",
  "query",
  "sqlschema",
  "schema",
  "text"
]);

export function shouldRedactCodeAndQuestions() {
  return process.env.OTEL_REDACT_CODE_AND_QUESTIONS !== "false";
}

export function redactSpanAttributes(attributes = {}, redactContent = shouldRedactCodeAndQuestions()) {
  if (!attributes || typeof attributes !== "object") return {};
  const out = {};
  for (const [key, val] of Object.entries(attributes)) {
    const lowerKey = key.toLowerCase();
    if (val === undefined) continue;
    if (val === null || typeof val === "number" || typeof val === "boolean") {
      out[key] = val;
      continue;
    }
    if (typeof val === "string") {
      if (redactContent && SENSITIVE_CONTENT_KEYS.has(lowerKey)) {
        const digest = createHash("sha256").update(val).digest("hex").slice(0, 8);
        out[key] = `[REDACTED_CONTENT len=${val.length} sha256=${digest}]`;
      } else {
        out[key] = scrubSecretsAndPII(val).text;
      }
      continue;
    }
    if (Array.isArray(val)) {
      out[key] = redactContent && SENSITIVE_CONTENT_KEYS.has(lowerKey)
        ? `[REDACTED_ARRAY count=${val.length}]`
        : val.map((item) => (typeof item === "string" ? scrubSecretsAndPII(item).text : item));
      continue;
    }
    if (typeof val === "object") {
      out[key] = redactSpanAttributes(val, redactContent);
    }
  }
  return out;
}

// --- 3. OpenTelemetry Span Recorder + OTLP & Langfuse Exporters ---
const MAX_TRACES = 200;
const recentSpans = [];
const exportedOtlpPayloads = [];
const exportedLangfusePayloads = [];

function randomHex(bytes) {
  try {
    return randomBytes(bytes).toString("hex");
  } catch {
    return createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, bytes * 2);
  }
}

/**
 * Formats a span record into standard OpenTelemetry OTLP/JSON structure.
 */
export function buildOtlpSpanPayload(record) {
  const attributesList = Object.entries(record.attributes || {}).map(([key, value]) => ({
    key,
    value:
      typeof value === "number"
        ? Number.isInteger(value)
          ? { intValue: String(value) }
          : { doubleValue: value }
        : typeof value === "boolean"
        ? { boolValue: value }
        : { stringValue: String(value) }
  }));

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "examassist-ai-backend" } },
            { key: "service.version", value: { stringValue: APP_VERSION } }
          ]
        },
        scopeSpans: [
          {
            scope: { name: "examassist.pipeline.tracer", version: APP_VERSION },
            spans: [
              {
                traceId: record.traceId,
                spanId: record.spanId,
                parentSpanId: record.parentSpanId || undefined,
                name: record.stage,
                kind: record.kind === "TOOL" ? 3 : 1,
                startTimeUnixNano: record.startTimeUnixNano,
                endTimeUnixNano: record.endTimeUnixNano,
                status: {
                  code: record.status === "ok" ? 1 : 2,
                  message: record.status
                },
                attributes: attributesList
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * Formats a span record into a Langfuse ingestion batch payload (redacted by default).
 */
export function buildLangfuseSpanPayload(record) {
  const baseMs = Number.isFinite(record.startedAt) ? record.startedAt : Date.parse(record.timestamp) || Date.now();
  return {
    batch: [
      {
        id: `lf-${record.spanId}`,
        type: "span-create",
        timestamp: record.timestamp,
        body: {
          id: record.spanId,
          traceId: record.traceId,
          parentObservationId: record.parentSpanId || null,
          name: record.stage,
          startTime: record.timestamp,
          endTime: new Date(baseMs + (Number(record.durationMs) || 0)).toISOString(),
          metadata: record.attributes,
          level: record.status === "ok" ? "DEFAULT" : "ERROR",
          statusMessage: record.status
        }
      }
    ]
  };
}

export async function exportSpanToOtlp(record, endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const payload = buildOtlpSpanPayload(record);
  exportedOtlpPayloads.push(payload);
  if (exportedOtlpPayloads.length > MAX_TRACES) exportedOtlpPayloads.shift();

  if (!endpoint) return { exported: false, reason: "OTEL_EXPORTER_OTLP_ENDPOINT not configured", payload };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2500)
    });
    return { exported: res.ok, status: res.status, payload };
  } catch (err) {
    return { exported: false, error: err?.message || "OTLP export failed", payload };
  }
}

export async function exportSpanToLangfuse(
  record,
  {
    publicKey = process.env.LANGFUSE_PUBLIC_KEY?.replace(/^["']|["']$/g, ""),
    secretKey = process.env.LANGFUSE_SECRET_KEY?.replace(/^["']|["']$/g, ""),
    host = (process.env.LANGFUSE_HOST || process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com").replace(/^["']|["']$/g, "")
  } = {}
) {
  const payload = buildLangfuseSpanPayload(record);
  exportedLangfusePayloads.push(payload);
  if (exportedLangfusePayloads.length > MAX_TRACES) exportedLangfusePayloads.shift();

  if (!publicKey || !secretKey) {
    return { exported: false, reason: "LANGFUSE credentials not configured", payload };
  }
  try {
    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
    const res = await fetch(`${host.replace(/\/+$/, "")}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2500)
    });
    return { exported: res.ok, status: res.status, payload };
  } catch (err) {
    return { exported: false, error: err?.message || "Langfuse export failed", payload };
  }
}

export function startSpan(stage, attributes = {}, options = {}) {
  const startedAt = Date.now();
  const traceId = options.traceId || randomHex(16);
  const spanId = randomHex(8);
  const parentSpanId = options.parentSpanId || null;
  const kind = options.kind || (String(stage).startsWith("tool.") ? "TOOL" : "STAGE");
  const startTimeUnixNano = String(BigInt(startedAt) * 1000000n);

  return {
    traceId,
    spanId,
    parentSpanId,
    stage,
    kind,
    startedAt,
    end(status = "ok", extra = {}) {
      const endedAt = Date.now();
      const durationMs = Math.max(0, endedAt - startedAt);
      const endTimeUnixNano = String(BigInt(endedAt) * 1000000n);
      const safeAttributes = redactSpanAttributes({ ...attributes, ...extra });

      const record = {
        traceId,
        spanId,
        parentSpanId,
        stage,
        kind,
        status,
        startedAt,
        durationMs,
        timestamp: new Date(startedAt).toISOString(),
        startTimeUnixNano,
        endTimeUnixNano,
        redactedByDefault: shouldRedactCodeAndQuestions(),
        attributes: safeAttributes
      };

      recentSpans.push(record);
      if (recentSpans.length > MAX_TRACES) recentSpans.shift();

      if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
        void exportSpanToOtlp(record);
      }
      if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
        void exportSpanToLangfuse(record);
      }

      return record;
    }
  };
}

export function startToolSpan(toolName, toolArgs = {}, parentSpan = null) {
  return startSpan(
    `tool.${toolName}`,
    { tool: toolName, ...toolArgs },
    {
      traceId: parentSpan?.traceId,
      parentSpanId: parentSpan?.spanId,
      kind: "TOOL"
    }
  );
}

export function getRecentSpans(limit = 50) {
  return recentSpans.slice(-Math.max(1, Math.min(200, limit)));
}

export function isLocalhostRequest(req) {
  const remoteAddr = String(req?.socket?.remoteAddress || req?.ip || "").trim();
  const hostHeader = String(req?.get?.("host") || req?.headers?.host || "").toLowerCase();
  const localIps = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);
  if (localIps.has(remoteAddr)) return true;
  if (!remoteAddr && (hostHeader.startsWith("localhost") || hostHeader.startsWith("127.0.0.1"))) return true;
  return false;
}

// --- 4. Semantic / Problem Verification Cache (Default OFF) ---
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
