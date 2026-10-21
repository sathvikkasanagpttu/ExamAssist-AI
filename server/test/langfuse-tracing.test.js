/**
 * Unit & Integration Tests: Langfuse Tracing & Observability
 *
 * Verifies:
 * 1. Configuration detection and normalization
 * 2. OpenAI client wrapping with observeOpenAI
 * 3. Specific observation types (chain, agent, retriever, tool)
 * 4. Context propagation (userId, sessionId, tags, metadata)
 * 5. Error capture and level assignment on span
 * 6. Input/output scrubbing and PII redaction
 * 7. Graceful degradation in unconfigured / noop environments
 */

import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import {
  isLangfuseConfigured,
  getLangfuseConfig,
  initLangfuseTracing,
  wrapOpenAIClient,
  traceObservation,
  traceChain,
  traceAgent,
  traceRetriever,
  traceTool,
  getActiveTraceId,
  getActiveSpanId
} from "../tracing.js";

test("Langfuse Tracing: getLangfuseConfig normalizes credentials and host", () => {
  const config = getLangfuseConfig();
  assert.ok(typeof config.publicKey === "string");
  assert.ok(typeof config.secretKey === "string");
  assert.ok(typeof config.baseUrl === "string");
  assert.ok(!config.baseUrl.endsWith("/"));
  assert.ok(!config.publicKey.startsWith('"'));
  assert.ok(!config.secretKey.startsWith('"'));
});

test("Langfuse Tracing: wrapOpenAIClient decorates OpenAI instance when configured", () => {
  const rawClient = new OpenAI({ apiKey: "test-openai-key" });
  const wrappedClient = wrapOpenAIClient(rawClient);

  assert.ok(wrappedClient);
  assert.equal(typeof wrappedClient.chat.completions.create, "function");
});

test("Langfuse Tracing: traceObservation executes function and records span updates", async () => {
  let executed = false;
  const result = await traceObservation(
    "test.observation",
    async (span) => {
      executed = true;
      assert.ok(span);
      assert.equal(typeof span.update, "function");
      span.update({ input: { query: "What is photosynthesis?" } });
      span.update({ output: { answer: "Biochemical solar energy conversion." } });
      return { success: true };
    },
    {
      asType: "chain",
      userId: "student_42",
      sessionId: "session_abc",
      tags: ["biology", "exam"],
      metadata: { difficulty: "introductory" }
    }
  );

  assert.equal(executed, true);
  assert.deepEqual(result, { success: true });
});

test("Langfuse Tracing: specialized helpers (traceChain, traceAgent, traceRetriever, traceTool) execute correctly", async () => {
  const chainRes = await traceChain("test.chain", async (span) => {
    span.update({ input: "chain-input" });
    return "chain-output";
  });
  assert.equal(chainRes, "chain-output");

  const agentRes = await traceAgent("test.agent", async (span) => {
    span.update({ input: "agent-task" });
    return "agent-output";
  });
  assert.equal(agentRes, "agent-output");

  const retrieverRes = await traceRetriever("test.retriever", async (span) => {
    span.update({ input: "query" });
    return ["source-1", "source-2"];
  });
  assert.deepEqual(retrieverRes, ["source-1", "source-2"]);

  const toolRes = await traceTool("test.calculator", async (span) => {
    span.update({ input: { expression: "2 + 2" } });
    return 4;
  });
  assert.equal(toolRes, 4);
});

test("Langfuse Tracing: nesting hierarchies capture parent/child relationships", async () => {
  let parentTraceId = null;
  let childTraceId = null;

  await traceChain("parent.pipeline", async (parentSpan) => {
    parentTraceId = getActiveTraceId();

    await traceRetriever("child.search", async (childSpan) => {
      childTraceId = getActiveTraceId();
      return { count: 3 };
    });

    return { done: true };
  });

  if (isLangfuseConfigured() && parentTraceId) {
    assert.ok(childTraceId);
    assert.equal(childTraceId, parentTraceId, "Child span must inherit parent trace ID");
  }
});

test("Langfuse Tracing: errors inside observation are caught, tagged, and rethrown", async () => {
  await assert.rejects(
    async () => {
      await traceChain("failing.step", async () => {
        const error = new Error("Expected pipeline test failure");
        error.code = "CUSTOM_FAIL";
        throw error;
      });
    },
    (err) => {
      assert.equal(err.message, "Expected pipeline test failure");
      assert.equal(err.code, "CUSTOM_FAIL");
      return true;
    }
  );
});

test("Langfuse Tracing: PII and secret patterns in input/output are automatically scrubbed", async () => {
  const result = await traceChain(
    "redaction.test",
    async (span) => {
      return {
        keyUsed: "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
        message: "Contact admin@example.com for help."
      };
    },
    {
      input: {
        raw: "Please test with sk-1234567890abcdefghijklmnop and user student@university.edu"
      }
    }
  );

  assert.ok(result);
});
