/**
 * ExamAssist AI - GraphRAG & Concept Prerequisite Knowledge Graph
 * Feature D: Graph-based knowledge retrieval representing:
 * - Concept to Prerequisite (DAG)
 * - Topic to Definition
 * - Formula to Variables
 * - Question to Concept mapping
 * - Concept to Common Pitfalls
 *
 * Fully integrated with fallback to baseline vector RAG.
 */

export class KnowledgeGraph {
  constructor() {
    this.concepts = new Map();
    this.formulas = new Map();
    this.pitfalls = new Map();
    this.documents = new Map();

    this.prerequisites = new Map(); // conceptId -> Set of prerequisite conceptIds
    this.related = new Map();       // conceptId -> Set of related conceptIds
    this.conceptFormulas = new Map(); // conceptId -> Set of formulaIds
    this.conceptPitfalls = new Map(); // conceptId -> Set of pitfallIds
    this.conceptDocuments = new Map(); // conceptId -> Set of documentIds
  }

  addConcept({ id, name, domain, definition, complexity = "Introductory", tags = [] }) {
    if (!id || !name) throw new Error("Concept requires id and name");
    this.concepts.set(id, { id, name, domain, definition, complexity, tags });
    if (!this.prerequisites.has(id)) this.prerequisites.set(id, new Set());
    if (!this.related.has(id)) this.related.set(id, new Set());
    if (!this.conceptFormulas.has(id)) this.conceptFormulas.set(id, new Set());
    if (!this.conceptPitfalls.has(id)) this.conceptPitfalls.set(id, new Set());
    if (!this.conceptDocuments.has(id)) this.conceptDocuments.set(id, new Set());
    return this;
  }

  addPrerequisite(conceptId, prerequisiteId) {
    if (!this.concepts.has(conceptId)) throw new Error(`Unknown concept ${conceptId}`);
    if (!this.concepts.has(prerequisiteId)) throw new Error(`Unknown prerequisite ${prerequisiteId}`);
    if (conceptId === prerequisiteId) throw new Error("A concept cannot be a prerequisite of itself");
    this.prerequisites.get(conceptId).add(prerequisiteId);
    return this;
  }

  addRelation(conceptIdA, conceptIdB) {
    if (!this.concepts.has(conceptIdA) || !this.concepts.has(conceptIdB)) return this;
    this.related.get(conceptIdA).add(conceptIdB);
    this.related.get(conceptIdB).add(conceptIdA);
    return this;
  }

  addFormula({ id, name, expression, variables = [], assumptions = "", domain = "" }) {
    this.formulas.set(id, { id, name, expression, variables, assumptions, domain });
    return this;
  }

  linkFormulaToConcept(conceptId, formulaId) {
    if (this.concepts.has(conceptId) && this.formulas.has(formulaId)) {
      this.conceptFormulas.get(conceptId).add(formulaId);
    }
    return this;
  }

  addPitfall({ id, conceptId, misconception, correction }) {
    this.pitfalls.set(id, { id, conceptId, misconception, correction });
    if (this.concepts.has(conceptId)) {
      this.conceptPitfalls.get(conceptId).add(id);
    }
    return this;
  }

  addDocument({ id, title, url, snippet = "" }) {
    this.documents.set(id, { id, title, url, snippet });
    return this;
  }

  linkDocumentToConcept(conceptId, documentId) {
    if (this.concepts.has(conceptId) && this.documents.has(documentId)) {
      this.conceptDocuments.get(conceptId).add(documentId);
    }
    return this;
  }

  /**
   * Traverse upstream prerequisites using BFS up to maxDepth
   */
  getPrerequisites(conceptId, maxDepth = 2) {
    const result = [];
    const visited = new Set([conceptId]);
    const queue = [{ id: conceptId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      if (depth >= maxDepth) continue;

      const prereqIds = this.prerequisites.get(id) || new Set();
      for (const pId of prereqIds) {
        if (!visited.has(pId)) {
          visited.add(pId);
          const concept = this.concepts.get(pId);
          if (concept) {
            result.push({ ...concept, depth: depth + 1 });
            queue.push({ id: pId, depth: depth + 1 });
          }
        }
      }
    }
    return result;
  }

  /**
   * Match question text to known concepts using lexical keyword matching
   */
  findMatchingConcepts(text, maxMatches = 3) {
    if (!text || typeof text !== "string") return [];
    const normalize = (s) => String(s || "").toLowerCase().replace(/['"’]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    const cleanLower = normalize(text);
    const scored = [];

    for (const concept of this.concepts.values()) {
      let score = 0;
      const cNameNorm = normalize(concept.name);
      if (cleanLower.includes(cNameNorm)) {
        score += 15;
      }

      for (const tag of concept.tags) {
        const tagNorm = normalize(tag);
        if (cleanLower.includes(tagNorm)) {
          score += 8;
        }
      }

      if (score > 0) {
        scored.push({ concept, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxMatches).map((s) => s.concept);
  }

  /**
   * Core GraphRAG Traversal for a given question
   */
  traverseGraphForQuestion(questionText, { maxDepth = 2, maxConcepts = 3 } = {}) {
    const matched = this.findMatchingConcepts(questionText, maxConcepts);
    if (!matched.length) {
      return {
        matchedConcepts: [],
        prerequisites: [],
        relatedConcepts: [],
        formulas: [],
        pitfalls: [],
        explanationContext: ""
      };
    }

    const allPrereqs = new Map();
    const allRelated = new Map();
    const allFormulas = new Map();
    const allPitfalls = new Map();
    const allDocs = new Map();

    for (const m of matched) {
      const prereqs = this.getPrerequisites(m.id, maxDepth);
      for (const p of prereqs) allPrereqs.set(p.id, p);

      const relIds = this.related.get(m.id) || new Set();
      for (const rId of relIds) {
        const c = this.concepts.get(rId);
        if (c && !allPrereqs.has(rId) && rId !== m.id) allRelated.set(rId, c);
      }

      const fIds = this.conceptFormulas.get(m.id) || new Set();
      for (const fId of fIds) {
        const f = this.formulas.get(fId);
        if (f) allFormulas.set(fId, f);
      }

      const pitIds = this.conceptPitfalls.get(m.id) || new Set();
      for (const pitId of pitIds) {
        const pit = this.pitfalls.get(pitId);
        if (pit) allPitfalls.set(pitId, pit);
      }

      const docIds = this.conceptDocuments.get(m.id) || new Set();
      for (const dId of docIds) {
        const doc = this.documents.get(dId);
        if (doc) allDocs.set(dId, doc);
      }
    }

    // Build human-readable context snippet for LLM / User inspection
    const lines = [];
    lines.push(`Core Concepts: ${matched.map((c) => c.name).join(", ")}`);

    if (allPrereqs.size > 0) {
      lines.push(`Prerequisites: ${[...allPrereqs.values()].map((p) => `${p.name} (${p.definition})`).join("; ")}`);
    }
    if (allFormulas.size > 0) {
      lines.push(`Formulas: ${[...allFormulas.values()].map((f) => `${f.name}: ${f.expression} [vars: ${f.variables.join(", ")}]`).join("; ")}`);
    }
    if (allPitfalls.size > 0) {
      lines.push(`Common Pitfalls: ${[...allPitfalls.values()].map((pit) => `"${pit.misconception}" -> ${pit.correction}`).join("; ")}`);
    }

    return {
      matchedConcepts: matched,
      prerequisites: [...allPrereqs.values()],
      relatedConcepts: [...allRelated.values()],
      formulas: [...allFormulas.values()],
      pitfalls: [...allPitfalls.values()],
      documents: [...allDocs.values()],
      explanationContext: lines.join("\n")
    };
  }
}

/**
 * Build & populate the canonical academic concept knowledge graph
 */
export function createDefaultAcademicKnowledgeGraph() {
  const kg = new KnowledgeGraph();

  // --- Computer Science & Data Structures ---
  kg.addConcept({ id: "array", name: "Array", domain: "Data Structures", definition: "Contiguous block of memory holding elements of the same type with O(1) random access by index.", tags: ["indexing", "contiguous", "vector"] });
  kg.addConcept({ id: "linked_list", name: "Linked List", domain: "Data Structures", definition: "Linear collection of data elements where order is given by pointers.", tags: ["nodes", "pointers", "singly", "doubly"] });
  kg.addConcept({ id: "tree", name: "Tree", domain: "Data Structures", definition: "Hierarchical data structure consisting of nodes with a parent-child relationship and no cycles.", tags: ["binary tree", "root", "leaf"] });
  kg.addConcept({ id: "bst", name: "Binary Search Tree", domain: "Data Structures", definition: "Binary tree where left subtree keys < node key < right subtree keys.", tags: ["inorder", "search tree"] });
  kg.addConcept({ id: "heap", name: "Heap", domain: "Data Structures", definition: "Complete binary tree satisfying heap property (min-heap or max-heap).", tags: ["priority queue", "min-heap", "max-heap"] });
  kg.addConcept({ id: "graph", name: "Graph", domain: "Data Structures", definition: "Set of vertices connected by directed or undirected edges.", tags: ["vertices", "edges", "adjacency"] });

  kg.addPrerequisite("tree", "linked_list");
  kg.addPrerequisite("bst", "tree");
  kg.addPrerequisite("heap", "tree");
  kg.addPrerequisite("heap", "array");
  kg.addPrerequisite("graph", "array");

  // --- Algorithms ---
  kg.addConcept({ id: "recursion", name: "Recursion", domain: "Algorithms", definition: "Solving a problem by dividing it into smaller sub-instances of the same problem with a base case.", tags: ["recursive", "base case", "call stack"] });
  kg.addConcept({ id: "binary_search", name: "Binary Search", domain: "Algorithms", definition: "Divide-and-conquer search in a sorted array running in O(log n) time.", tags: ["sorted", "logarithmic", "bisection"] });
  kg.addConcept({ id: "bfs", name: "Breadth-First Search", domain: "Algorithms", definition: "Level-order traversal of a graph or tree using a FIFO queue.", tags: ["queue", "shortest path", "level order"] });
  kg.addConcept({ id: "dfs", name: "Depth-First Search", domain: "Algorithms", definition: "Explores as deep as possible along each branch before backtracking using a stack or recursion.", tags: ["dfs", "depth first search", "stack", "backtracking"] });
  kg.addConcept({ id: "dijkstra", name: "Dijkstra's Algorithm", domain: "Algorithms", definition: "Finds shortest paths from source to all vertices in a weighted graph with non-negative edge weights using a priority queue.", tags: ["dijkstra", "dijkstras", "dijkstras algorithm", "shortest path", "greedy", "relaxation"] });
  kg.addConcept({ id: "dynamic_programming", name: "Dynamic Programming", domain: "Algorithms", definition: "Solving problems by breaking them into overlapping subproblems and storing results (memoization/tabulation).", tags: ["dp", "dynamic programming", "memoization", "tabulation", "optimal substructure"] });

  kg.addPrerequisite("binary_search", "array");
  kg.addPrerequisite("bfs", "graph");
  kg.addPrerequisite("dfs", "recursion");
  kg.addPrerequisite("dfs", "graph");
  kg.addPrerequisite("dijkstra", "bfs");
  kg.addPrerequisite("dijkstra", "heap");
  kg.addPrerequisite("dynamic_programming", "recursion");

  // Pitfalls
  kg.addPitfall({
    id: "dijkstra_neg_weights",
    conceptId: "dijkstra",
    misconception: "Dijkstra works on graphs with negative edge weights.",
    correction: "Dijkstra assumes non-negative edge weights; use Bellman-Ford for negative edge weights."
  });
  kg.addPitfall({
    id: "binary_search_unsorted",
    conceptId: "binary_search",
    misconception: "Binary search can be applied to any arbitrary array.",
    correction: "Binary search strictly requires the collection to be sorted or monotonic."
  });

  // --- Mathematics & Statistics ---
  kg.addConcept({ id: "probability", name: "Probability", domain: "Mathematics", definition: "Numerical description of how likely an event is to occur between 0 and 1.", tags: ["events", "likelihood", "sample space"] });
  kg.addConcept({ id: "conditional_probability", name: "Conditional Probability", domain: "Mathematics", definition: "Probability of an event given that another event has occurred: P(A|B).", tags: ["given", "joint probability"] });
  kg.addConcept({ id: "bayes_theorem", name: "Bayes' Theorem", domain: "Mathematics", definition: "Computes posterior probability based on prior probability and likelihood.", tags: ["bayes", "bayes theorem", "prior", "posterior", "likelihood", "evidence"] });

  kg.addPrerequisite("conditional_probability", "probability");
  kg.addPrerequisite("bayes_theorem", "conditional_probability");

  kg.addFormula({
    id: "bayes_formula",
    name: "Bayes' Law",
    expression: "P(A|B) = (P(B|A) * P(A)) / P(B)",
    variables: ["P(A|B): Posterior", "P(B|A): Likelihood", "P(A): Prior", "P(B): Marginal Evidence"],
    assumptions: "P(B) > 0",
    domain: "Mathematics"
  });
  kg.linkFormulaToConcept("bayes_theorem", "bayes_formula");

  // --- Database Systems ---
  kg.addConcept({ id: "relational_model", name: "Relational Model", domain: "Databases", definition: "Database model based on first-order predicate logic and relations (tables) with attributes.", tags: ["table", "tuple", "attribute", "schema"] });
  kg.addConcept({ id: "acid", name: "ACID Transactions", domain: "Databases", definition: "Atomicity, Consistency, Isolation, and Durability guarantees for database transactions.", tags: ["atomicity", "consistency", "isolation", "durability", "transaction"] });
  kg.addConcept({ id: "sql_join", name: "SQL JOIN", domain: "Databases", definition: "Combines columns from one or more tables based on a related column.", tags: ["inner join", "left join", "cartesian product"] });

  kg.addPrerequisite("acid", "relational_model");
  kg.addPrerequisite("sql_join", "relational_model");

  return kg;
}

export const defaultKnowledgeGraph = createDefaultAcademicKnowledgeGraph();

/**
 * Compare standard RAG vs GraphRAG for evaluation benchmarks
 */
export function compareRagVsGraphRag(question, { graph = defaultKnowledgeGraph, rawSources = [] } = {}) {
  const plainRagSnippetCount = rawSources.length;
  const graphResult = graph.traverseGraphForQuestion(question);

  return {
    question,
    plainRag: {
      sourcesRetrieved: plainRagSnippetCount,
      hasPrerequisites: false,
      hasFormulas: false,
      hasPitfalls: false
    },
    graphRag: {
      matchedConcepts: graphResult.matchedConcepts.map((c) => c.name),
      prerequisitesFound: graphResult.prerequisites.map((p) => p.name),
      formulasFound: graphResult.formulas.map((f) => f.name),
      pitfallsFound: graphResult.pitfalls.map((p) => p.misconception),
      enhancedContext: graphResult.explanationContext
    },
    deltaBenefit: {
      prerequisiteDepth: graphResult.prerequisites.length,
      formulaVariablesGrounded: graphResult.formulas.reduce((acc, f) => acc + f.variables.length, 0),
      pitfallsAlerted: graphResult.pitfalls.length
    }
  };
}
