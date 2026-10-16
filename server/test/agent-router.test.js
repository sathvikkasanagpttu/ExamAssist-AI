import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routeQuestion,
  runMathematicsAgent,
  runKnowledgeAgent,
  composeResponse,
  WORKFLOW_MODES
} from "../pipeline/agentRouter.js";

test("AgentRouter: routeQuestion classifies task into targeted workflow without running every agent", () => {
  const mathRoute = routeQuestion("Calculate 25 * 4 + 10");
  assert.equal(mathRoute.workflow, WORKFLOW_MODES.MATH);

  const codeRoute = routeQuestion("Write a function in python to reverse a string", ["A", "B"]);
  assert.equal(codeRoute.workflow, WORKFLOW_MODES.PROGRAMMING);

  const sqlRoute = routeQuestion("SELECT department_id, COUNT(*) FROM employees GROUP BY department_id");
  assert.equal(sqlRoute.workflow, WORKFLOW_MODES.SQL);

  const bioRoute = routeQuestion("What is the primary function of chloroplasts in plant cells?", ["A", "B", "C"]);
  assert.equal(bioRoute.workflow, WORKFLOW_MODES.RESEARCH_CONCEPTUAL);
});

test("AgentRouter: runMathematicsAgent executes deterministic calculation", async () => {
  const result = await runMathematicsAgent({ expression: "12 * 8 + 4" });
  assert.equal(result.executed, true);
  assert.equal(result.success, true);
  assert.equal(result.result, 100);
});

test("AgentRouter: runKnowledgeAgent retrieves GraphRAG prerequisite DAG", async () => {
  const result = await runKnowledgeAgent({ question: "Explain Dijkstra algorithm complexity" });
  assert.ok(result.graphContext);
  assert.ok(result.graphContext.matchedConcepts.some((c) => c.name.includes("Dijkstra")));
  assert.ok(result.graphContext.prerequisites.length > 0);
});

test("AgentRouter: composeResponse synthesizes calibrated confidence and complete metadata", () => {
  const classification = {
    rawQuestion: "What is mitochondria?",
    questionType: "MCQ",
    subject: "Biology",
    topic: "Cell Biology",
    difficulty: "Introductory",
    questionQuality: { status: "clear", reason: "", missing: "" }
  };

  const response = composeResponse({
    classification,
    directAnswer: "Powerhouse of the cell",
    explanation: "Mitochondria produce ATP through oxidative phosphorylation.",
    verification: { status: "VERIFIED", supported: ["Claim 1"], conflicting: [], unsupported: [] },
    sources: [{ title: "Biology Textbook", url: "https://mit.edu/bio" }],
    latencyMs: 120
  });

  assert.equal(response.directAnswer, "Powerhouse of the cell");
  assert.equal(response.confidence, "HIGH");
  assert.equal(response.verification.status, "VERIFIED");
  assert.ok(response.retrievalTimestamp);
});
