import test from "node:test";
import assert from "node:assert/strict";
import {
  AIClient,
  AIConfigError,
  AIRateLimitError,
  AITimeoutError,
  AIUnavailableError
} from "../aiClient.js";
import { processAssessmentQuestion } from "../pipeline/assessmentOrchestrator.js";
import { validateOptionIntegrity, generateReasonedAnswer } from "../pipeline/reasoningEngine.js";
import { runVerificationPass } from "../pipeline/verificationPass.js";

test("AI Client: No key throws AI_NOT_CONFIGURED (never a fake answer)", async () => {
  const client = new AIClient({ apiKey: "" });
  assert.equal(client.isConfigured, false);

  await assert.rejects(
    async () => {
      await client.generateCompletion({ userPrompt: "What is 2+2?" });
    },
    (err) => {
      assert.ok(err instanceof AIConfigError);
      assert.equal(err.code, "AI_NOT_CONFIGURED");
      return true;
    }
  );

  // Verify processAssessmentQuestion does NOT return a canned answer when unconfigured
  await assert.rejects(
    async () => {
      await processAssessmentQuestion({
        question: "Explain the Heisenberg uncertainty principle.",
        aiClient: client
      });
    },
    (err) => {
      assert.equal(err.code, "AI_NOT_CONFIGURED");
      return true;
    }
  );
});

test("AI Client: Invalid JSON retries then fails safely without canned answer", async () => {
  let callCount = 0;
  const mockClient = new AIClient({
    apiKey: "test-mock-key",
    mockHandler: async () => {
      callCount++;
      return "This is pure prose with no JSON whatsoever.";
    }
  });

  const parsed = await mockClient.generateJson({
    systemPrompt: "Test prompt",
    userPrompt: "Give me json"
  });

  assert.equal(parsed, null);
  // Checked that it attempted a repair retry (initial call + repair call = 2)
  assert.equal(callCount, 2);
});

test("Option Integrity: Letter/text mismatch is detected and rejected", () => {
  const normalizedOptions = [
    { option: "A", text: "Quick sort" },
    { option: "B", text: "Bubble sort" },
    { option: "C", text: "Merge sort" }
  ];

  // Matching letter and text
  const validCheck = validateOptionIntegrity({ option: "B", text: "Bubble sort" }, normalizedOptions);
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.option, "B");

  // Mismatch: Letter says A (Quick sort) but text says Bubble sort (Option B)
  const mismatchCheck = validateOptionIntegrity({ option: "A", text: "Bubble sort" }, normalizedOptions);
  assert.equal(mismatchCheck.valid, false);
  assert.ok(mismatchCheck.reason.includes("does not match"));

  // Non-existent option
  const invalidLetter = validateOptionIntegrity({ option: "Z", text: "Heap sort" }, normalizedOptions);
  assert.equal(invalidLetter.valid, false);
});

test("Disagreement: Solver passes disagreeing on answer triggers tie-break and LOW confidence", async () => {
  let passNum = 0;
  const mockClient = new AIClient({
    apiKey: "test-mock-key",
    mockHandler: async ({ systemPrompt, userPrompt }) => {
      passNum++;
      if (passNum === 1) {
        // Pass 1: First principles selects Option A
        return JSON.stringify({
          directAnswer: { option: "A", text: "Option A" },
          ownSolution: "Option A",
          explanation: "First principles derivation supports A.",
          confidence: "HIGH"
        });
      } else if (passNum === 2) {
        // Pass 2: Evidence-informed pass selects Option B
        return JSON.stringify({
          directAnswer: { option: "B", text: "Option B" },
          ownSolution: "Option B",
          explanation: "Web evidence suggests B.",
          confidence: "HIGH"
        });
      } else {
        // Tie-break pass reconciling both
        return JSON.stringify({
          directAnswer: { option: "B", text: "Option B" },
          ownSolution: "Option B",
          explanation: "Reconciled: Option A was a distractor.",
          confidence: "MEDIUM"
        });
      }
    }
  });

  const result = await generateReasonedAnswer({
    question: "Complex theoretical question?",
    questionType: "MCQ",
    options: ["Option A", "Option B", "Option C"],
    sources: [{ title: "Ref 1", url: "https://example.edu", snippet: "Evidence snippet", authority: 80, relevance: 80 }],
    aiClient: mockClient
  });

  assert.equal(result.confidence, "LOW");
  assert.ok(result.confidenceReason.includes("Disagreement"));
  assert.equal(result.evidenceAgreesWithSolution, false);
});

test("Evaluation ablation can skip tie-break while keeping disagreement LOW confidence", async () => {
  let calls = 0;
  const mockClient = new AIClient({
    apiKey: "test-mock-key",
    mockHandler: async () => {
      calls++;
      const option = calls === 1 ? "A" : "B";
      return JSON.stringify({
        directAnswer: { option, text: `Option ${option}` },
        ownSolution: `Option ${option}`,
        explanation: `Pass ${calls}`,
        confidence: "HIGH"
      });
    }
  });
  const result = await generateReasonedAnswer({
    question: "Ablation disagreement test question?",
    questionType: "MCQ",
    options: ["Option A", "Option B"],
    sources: [{ title: "Retrieved source", url: "https://example.edu/ref", snippet: "Evidence", authority: 90, relevance: 90 }],
    skipTieBreak: true,
    aiClient: mockClient
  });
  assert.equal(calls, 2);
  assert.equal(result.confidence, "LOW");
  assert.equal(result.evidenceAgreesWithSolution, false);
});

test("Verification: No sources strictly returns status UNVERIFIED", async () => {
  const result = await runVerificationPass({
    question: "What is quantum superposition?",
    directAnswer: "State of multiple simultaneous states",
    explanation: "Standard quantum mechanics principle",
    sources: []
  });

  assert.equal(result.status, "UNVERIFIED");
  assert.equal(result.supported.length, 0);
  assert.ok(result.unsupported.length > 0);
});
