/**
 * ExamAssist AI — Langfuse Observability & Tracing Integration
 *
 * Implements Langfuse AI Agent Skill best practices:
 * 1. Automatic OpenAI SDK instrumentation via @langfuse/openai (observeOpenAI)
 *    capturing model name, token usage, cost, latency, and streaming chunks.
 * 2. Hierarchical tracing with OpenTelemetry context propagation (@langfuse/otel & @langfuse/tracing).
 * 3. Specific observation types (chain, agent, tool, retriever, generation).
 * 4. Categorical tags, sessions (session_id), user tracking (user_id), and metadata.
 * 5. PII and secret redaction aligned with OTEL_REDACT_CODE_AND_QUESTIONS.
 * 6. Graceful degradation when Langfuse credentials are not provided.
 */

import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  startActiveObservation,
  propagateAttributes,
  getActiveTraceId,
  getActiveSpanId
} from "@langfuse/tracing";
import { observeOpenAI } from "@langfuse/openai";
import { scrubSecretsAndPII, redactSpanAttributes } from "./pipeline/observabilityAndSafety.js";

let tracerProvider = null;
let spanProcessor = null;
let initialized = false;

function cleanEnvVal(val) {
  if (!val || typeof val !== "string") return "";
  return val.trim().replace(/^["']|["']$/g, "");
}

export function getLangfuseConfig() {
  const publicKey = cleanEnvVal(process.env.LANGFUSE_PUBLIC_KEY);
  const secretKey = cleanEnvVal(process.env.LANGFUSE_SECRET_KEY);
  const baseUrl =
    cleanEnvVal(process.env.LANGFUSE_BASE_URL) ||
    cleanEnvVal(process.env.LANGFUSE_HOST) ||
    "https://cloud.langfuse.com";

  const configured = Boolean(
    publicKey &&
    secretKey &&
    !publicKey.includes("replace_me") &&
    !secretKey.includes("replace_me")
  );

  return {
    publicKey,
    secretKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    configured
  };
}

export function isLangfuseConfigured() {
  return getLangfuseConfig().configured;
}

export function initLangfuseTracing() {
  if (initialized) return tracerProvider;

  const config = getLangfuseConfig();
  if (!config.configured) {
    return null;
  }

  // Ensure environment variables expected by Langfuse SDK are in place
  process.env.LANGFUSE_PUBLIC_KEY = config.publicKey;
  process.env.LANGFUSE_SECRET_KEY = config.secretKey;
  process.env.LANGFUSE_BASE_URL = config.baseUrl;
  process.env.LANGFUSE_HOST = config.baseUrl;

  try {
    spanProcessor = new LangfuseSpanProcessor({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl
    });

    tracerProvider = new NodeTracerProvider({
      spanProcessors: [spanProcessor]
    });

    tracerProvider.register();
    initialized = true;
    return tracerProvider;
  } catch (err) {
    console.warn("[Tracing] Langfuse initialization failed, running with no-op tracing:", err?.message || err);
    initialized = false;
    return null;
  }
}

export async function flushLangfuse() {
  if (tracerProvider) {
    try {
      await tracerProvider.forceFlush();
    } catch (err) {
      console.warn("[Tracing] Error flushing Langfuse traces:", err?.message || err);
    }
  }
}

export async function shutdownLangfuse() {
  if (tracerProvider) {
    try {
      await tracerProvider.shutdown();
    } catch (err) {
      console.warn("[Tracing] Error shutting down Langfuse tracer provider:", err?.message || err);
    }
  }
}

/**
 * Wraps an OpenAI client instance with Langfuse observeOpenAI if configured.
 */
export function wrapOpenAIClient(client, options = {}) {
  if (!client) return client;
  if (!isLangfuseConfigured()) return client;

  try {
    return observeOpenAI(client, {
      ...options
    });
  } catch (err) {
    console.warn("[Tracing] Failed to wrap OpenAI client with Langfuse:", err?.message || err);
    return client;
  }
}

class NoopSpan {
  constructor() {
    this.id = "noop";
    this.traceId = "noop";
  }
  update() {
    return this;
  }
}

/**
 * Executes a function inside a Langfuse active observation context.
 *
 * @param {string} name - Descriptive trace / span name (e.g. 'assessment.analyze')
 * @param {(span: any) => Promise<any>|any} fn - The callback to trace
 * @param {object} options
 * @param {'chain'|'agent'|'tool'|'retriever'|'span'} [options.asType='span'] - Observation type
 * @param {string} [options.userId] - User ID for tracking
 * @param {string} [options.sessionId] - Session ID for grouping multi-turn traces
 * @param {string[]} [options.tags] - Categorical tags
 * @param {object} [options.metadata] - High-cardinality metadata
 * @param {any} [options.input] - Trace / span input
 * @param {any} [options.output] - Trace / span output
 */
export async function traceObservation(name, fn, options = {}) {
  if (!isLangfuseConfigured()) {
    return await fn(new NoopSpan());
  }

  // Auto-initialize if not already done
  if (!initialized) {
    initLangfuseTracing();
  }

  const {
    asType = "span",
    userId,
    sessionId,
    tags,
    metadata,
    input,
    ...rest
  } = options;

  const propagateArgs = {};
  if (userId) propagateArgs.userId = String(userId);
  if (sessionId) propagateArgs.sessionId = String(sessionId);
  if (Array.isArray(tags) && tags.length > 0) propagateArgs.tags = tags.map(String);
  propagateArgs.traceName = name;

  const runWithObservation = async () => {
    return await startActiveObservation(
      name,
      async (span) => {
        if (input !== undefined) {
          const safeInput = typeof input === "object" ? redactSpanAttributes(input) : scrubSecretsAndPII(String(input)).text;
          span.update({ input: safeInput });
        }
        if (metadata && typeof metadata === "object") {
          span.update({ metadata: redactSpanAttributes(metadata) });
        }

        try {
          const result = await fn(span);
          if (result !== undefined && options.captureOutput !== false) {
            const safeOutput = typeof result === "object" ? redactSpanAttributes(result) : scrubSecretsAndPII(String(result)).text;
            span.update({ output: safeOutput });
          }
          return result;
        } catch (error) {
          span.update({
            level: "ERROR",
            statusMessage: error?.message || "Execution failed",
            metadata: {
              errorCode: error?.code,
              errorStatus: error?.status
            }
          });
          throw error;
        }
      },
      {
        asType,
        ...rest
      }
    );
  };

  if (Object.keys(propagateArgs).length > 0) {
    return await propagateAttributes(propagateArgs, runWithObservation);
  }

  return await runWithObservation();
}

/**
 * Pipeline Chain Observation (for multi-step pipelines)
 */
export async function traceChain(name, fn, options = {}) {
  return traceObservation(name, fn, { ...options, asType: "chain" });
}

/**
 * Agent Observation (for agent execution / dispatch)
 */
export async function traceAgent(name, fn, options = {}) {
  return traceObservation(name, fn, { ...options, asType: "agent" });
}

/**
 * Retriever Observation (for search, RAG, knowledge base lookups)
 */
export async function traceRetriever(name, fn, options = {}) {
  return traceObservation(name, fn, { ...options, asType: "retriever" });
}

/**
 * Tool Observation (for deterministic tool runs, sandboxes, calculators)
 */
export async function traceTool(name, fn, options = {}) {
  return traceObservation(name, fn, { ...options, asType: "tool" });
}

export { getActiveTraceId, getActiveSpanId };
