import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KnowledgeGraph,
  defaultKnowledgeGraph,
  compareRagVsGraphRag
} from "../kb/graphRAG.js";

test("GraphRAG: KnowledgeGraph validates schema and prevents self-prerequisites", () => {
  const kg = new KnowledgeGraph();
  kg.addConcept({ id: "math", name: "Math", domain: "General", definition: "Study of numbers" });
  assert.throws(() => kg.addPrerequisite("math", "math"), /cannot be a prerequisite of itself/);
});

test("GraphRAG: Multi-hop upstream prerequisite traversal (Dijkstra -> BFS, Heap -> Tree, Graph)", () => {
  const prereqs = defaultKnowledgeGraph.getPrerequisites("dijkstra", 2);
  const names = prereqs.map((p) => p.name);

  // Dijkstra requires BFS and Heap (depth 1), which require Graph, Tree, Array (depth 2)
  assert.ok(names.includes("Breadth-First Search"));
  assert.ok(names.includes("Heap"));
  assert.ok(names.includes("Graph") || names.includes("Tree") || names.includes("Array"));
});

test("GraphRAG: traverseGraphForQuestion extracts matching concepts, prerequisites, formulas and pitfalls", () => {
  const question = "Calculate the probability using Bayes' Theorem given prior P(A) = 0.2 and likelihood P(B|A) = 0.8";
  const result = defaultKnowledgeGraph.traverseGraphForQuestion(question);

  assert.ok(result.matchedConcepts.length >= 1);
  assert.ok(result.matchedConcepts.some((c) => c.name.includes("Bayes")));

  // Prerequisites should include Conditional Probability or Probability
  assert.ok(result.prerequisites.some((p) => p.name.includes("Probability")));

  // Formulas should be linked with variables
  assert.ok(result.formulas.length >= 1);
  assert.equal(result.formulas[0].name, "Bayes' Law");
  assert.ok(result.formulas[0].variables.some((v) => v.includes("Posterior")));
  assert.ok(result.explanationContext.includes("Bayes"));
});

test("GraphRAG: common pitfalls alert student to common conceptual errors", () => {
  const question = "How does Dijkstra's algorithm work and can it handle negative weights?";
  const result = defaultKnowledgeGraph.traverseGraphForQuestion(question);

  assert.ok(result.pitfalls.length >= 1);
  assert.ok(result.pitfalls.some((pit) => pit.misconception.includes("negative edge weights")));
  assert.ok(result.pitfalls.some((pit) => pit.correction.includes("Bellman-Ford")));
});

test("GraphRAG: compareRagVsGraphRag measures prerequisite and formula grounding delta", () => {
  const question = "What is Bayes' Theorem and what are its components?";
  const comparison = compareRagVsGraphRag(question, { rawSources: [{ title: "Bayes snippet", snippet: "text" }] });

  assert.equal(comparison.plainRag.hasPrerequisites, false);
  assert.equal(comparison.plainRag.hasFormulas, false);
  assert.ok(comparison.deltaBenefit.prerequisiteDepth > 0);
  assert.ok(comparison.deltaBenefit.formulaVariablesGrounded > 0);
  assert.ok(comparison.graphRag.formulasFound.includes("Bayes' Law"));
});
