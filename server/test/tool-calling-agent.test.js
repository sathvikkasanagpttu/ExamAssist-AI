import test from "node:test";
import assert from "node:assert/strict";
import { executeAgentTool, runToolCallingAgent } from "../pipeline/toolCallingAgent.js";
import { AIClient } from "../aiClient.js";
import { processAssessmentQuestion } from "../pipeline/assessmentOrchestrator.js";

test("tool-calling agent validates calculator input and records a completed tool trace", async () => {
  const aiClient = new AIClient({
    toolLoopHandler: async ({ executeTool }) => {
      const result = await executeTool("calculator", { expression: "6 * 7", operation: "evaluate", variable: "x" });
      return {
        final: {
          directAnswer: "42",
          explanation: "The calculator evaluated 6 * 7.",
          reasoningSteps: ["Evaluate the visible expression."],
          confidence: "LOW",
          confidenceReason: "Deterministic result still needs independent evidence.",
          optionAnalysis: []
        },
        trace: [{ toolCallId: "call_1", tool: "calculator", args: { expression: "6 * 7" }, result: JSON.stringify(result), elapsedMs: 1 }],
        usage: { totalTokens: 12, totalCostUsd: 0.001, elapsedMs: 1 }
      };
    }
  });
  const result = await runToolCallingAgent({
    question: "Calculate 6 times 7.",
    classification: { questionType: "NUMERICAL", subject: "Mathematics", topic: "Arithmetic" },
    aiClient
  });
  assert.equal(result.directAnswer, "42");
  assert.equal(result.toolEvidence[0].tool, "calculator");
  assert.equal(result.toolEvidence[0].executed, true);
  assert.equal(result.agentTrace.toolCalls.length, 1);
});

test("agent tool schemas reject unexpected calculator arguments", async () => {
  await assert.rejects(
    () => executeAgentTool("calculator", { expression: "1 + 1", operation: "evaluate", variable: "x", hidden: "no" }, { questionType: "NUMERICAL", userId: null, sources: [] }),
    /unrecognized key/i
  );
});

test("native loop sends strict tools and records a timed-out tool as failed evidence", async () => {
  const aiClient = new AIClient({ apiKey: "test-key" });
  let calls = 0;
  let sentTools;
  aiClient.openai = {
    chat: {
      completions: {
        create: async ({ tools }) => {
          sentTools = tools;
          calls += 1;
          if (calls === 1) {
            return {
              choices: [{ message: { content: "", tool_calls: [{ id: "tool_1", function: { name: "calculator", arguments: '{"expression":"1+1","operation":"evaluate","variable":"x"}' } }] } }],
              usage: { total_tokens: 10 }
            };
          }
          return { choices: [{ message: { content: '{"directAnswer":"UNVERIFIED"}' } }], usage: { total_tokens: 10 } };
        }
      }
    }
  };
  const result = await aiClient.runToolLoop({
    systemPrompt: "test",
    userPrompt: "test",
    tools: [{ type: "function", function: { name: "calculator", strict: true, parameters: { type: "object" } } }],
    executeTool: async () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 30)),
    maxToolMs: 5,
    maxTotalMs: 1000,
    maxTokens: 100,
    maxUsd: 1,
    costPer1kTokensUsd: 0.01
  });
  assert.equal(sentTools[0].function.strict, true);
  assert.equal(result.trace.length, 1);
  assert.match(result.trace[0].result, /AI_TIMEOUT/);
});

test("agent converts an answer outside the visible options to UNVERIFIED", async () => {
  const aiClient = new AIClient({
    toolLoopHandler: async () => ({
      final: {
        directAnswer: { option: "Z", text: "invented" },
        explanation: "Untrusted answer.",
        reasoningSteps: [],
        confidence: "HIGH",
        confidenceReason: "Wrong option.",
        optionAnalysis: []
      },
      trace: [],
      usage: { totalTokens: 1, totalCostUsd: 0, elapsedMs: 1 }
    })
  });
  const result = await runToolCallingAgent({
    question: "Choose one.",
    options: ["A) first", "B) second"],
    classification: { questionType: "MCQ", subject: "General Academic", topic: "Test" },
    aiClient
  });
  assert.equal(result.directAnswer, "UNVERIFIED");
  assert.equal(result.confidence, "UNVERIFIED");
});

test("agent configuration falls back to the static solve-first pipeline", async () => {
  const aiClient = new AIClient({
    apiKey: "test-key",
    mockHandler: async ({ systemPrompt, userPrompt }) => {
      if (String(systemPrompt).includes("evidence verification") || String(userPrompt).includes("EVIDENCE_VERIFICATION")) {
        return JSON.stringify({ claims: [{ claim: "Arithmetic is deterministic", status: "SUPPORTED" }] });
      }
      return JSON.stringify({
        directAnswer: { option: "B", text: "4" },
        explanation: "Two plus two equals four.",
        reasoningSteps: ["Add two and two."],
        confidence: "MEDIUM",
        confidenceReason: "Derived from arithmetic.",
        optionAnalysis: []
      });
    }
  });
  const result = await processAssessmentQuestion({
    question: "What is 2 + 2?",
    options: ["3", "4"],
    type: "MCQ",
    subject: "Mathematics",
    evaluationConfig: { toolCallingAgent: true, skipSearch: true, ragEnabled: false, specializedSolvers: false },
    aiClient
  });
  assert.equal(result.directAnswer.option, "B");
  assert.equal(result.agentTrace, undefined);
});
