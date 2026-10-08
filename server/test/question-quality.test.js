import test from "node:test";
import assert from "node:assert/strict";
import { assessQuestionQuality } from "../pipeline/questionQuality.js";
import { processAssessmentQuestion } from "../pipeline/assessmentOrchestrator.js";

test("question quality detector labels each non-clear disposition with an actionable reason", () => {
  const cases = [
    ["Which programming language is the best?", [], "CONCEPTUAL", "ambiguous"],
    ["A train travels at 60 km/h. How long does the trip take?", [], "NUMERICAL", "missing_info"],
    ["Select the correct parity of 7.", ["A. Even", "B. Even"], "MCQ", "contradictory_options"],
    ["Which answer is correct?", ["A. same", "B. same", "C. different"], "MCQ", "multiple_correct"],
    ["Finish the derivation...", [], "CONCEPTUAL", "truncated"]
  ];
  for (const [question, options, type, expected] of cases) {
    const result = assessQuestionQuality(question, options, type);
    assert.equal(result.status, expected);
    assert.ok(result.reason.length > 10);
  }
});

test("non-clear questions return UNVERIFIED without calling a solver", async () => {
  const result = await processAssessmentQuestion({
    question: "Compute 10 divided by 0.",
    type: "NUMERICAL",
    aiClient: { generateJson: async () => { throw new Error("solver must not be called"); } }
  });
  assert.equal(result.questionQuality.status, "ambiguous");
  assert.equal(result.directAnswer, "UNVERIFIED");
  assert.equal(result.confidence, "UNVERIFIED");
});
