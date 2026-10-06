import { defaultAIClient } from "../aiClient.js";
import { setMockSearchHandler } from "../pipeline/search.js";

export function setupStandardMocks(overrides = {}) {
  setMockSearchHandler(async (query) => {
    return [
      {
        title: `${query || "Standard"} Academic Reference`,
        url: "https://example.edu/academic-reference",
        snippet: `Authoritative study reference confirming ${query || "academic question"} key domain principles and time complexity binary search.`,
        domain: "example.edu",
        provider: "mock",
        authority: 95,
        relevance: 95
      },
      {
        title: `${query || "National"} Science Library`,
        url: "https://ncbi.nlm.nih.gov/articles/PMC12345",
        snippet: `Cellular and computational baseline documentation on ${query || "topic"} and binary search.`,
        domain: "ncbi.nlm.nih.gov",
        provider: "mock",
        authority: 95,
        relevance: 95
      }
    ];
  });

  defaultAIClient.mockHandler = async ({ systemPrompt, userPrompt, json }) => {
    const sPrompt = String(systemPrompt || "");
    const uPrompt = String(userPrompt || "");

    // 1. Contradiction detection
    if (sPrompt.includes("contradiction-detection") || uPrompt.includes("CONTRADICTION")) {
      return JSON.stringify({
        status: overrides.contradictionStatus || "AGREEMENT",
        agreement: ["Sources agree on core findings."],
        conflicts: [],
        explanation: "No contradictions found."
      });
    }

    // 2. Evidence verification pass
    if (sPrompt.includes("evidence verification") || uPrompt.includes("EVIDENCE_VERIFICATION")) {
      return JSON.stringify({
        overall_evidence_level: overrides.evidenceLevel || "HIGH",
        status: overrides.verificationStatus || "SUPPORTED",
        claims: [
          {
            claim: "Claim confirmed by reference sources",
            status: "SUPPORTED",
            supporting_sources: [1],
            reason: "Explicitly documented in reference."
          }
        ],
        supported: ["Claim confirmed by reference sources"],
        conflicts: [],
        unsupported: []
      });
    }

    // 3. Search query generation
    if (sPrompt.includes("search-query") || uPrompt.includes("SEARCH_QUERY") || sPrompt.includes("Search Query")) {
      return JSON.stringify({
        queries: [
          { type: "exact", query: "mitochondria cellular respiration ATP synthase" },
          { type: "academic", query: "mitochondria structure function peer-reviewed" },
          { type: "primary_source", query: "NCBI cellular respiration ATP" }
        ]
      });
    }

    // 4. Draft answer
    if (sPrompt.includes("draft") || uPrompt.includes("DRAFT")) {
      return JSON.stringify({
        directAnswer: overrides.directAnswer || "O(log n)",
        explanation: "Binary search runs in logarithmic time O(log n).",
        keyPoints: ["Halves search space each step", "Worst case logarithmic time"]
      });
    }

    // 5. Finalizer
    if (sPrompt.includes("final") || sPrompt.includes("Synthesis")) {
      return JSON.stringify({
        directAnswer: overrides.directAnswer || "O(log n)",
        explanation: "Binary search runs in logarithmic time O(log n).",
        keyPoints: ["Halves search space each step", "Worst case logarithmic time"],
        evidenceLevel: overrides.evidenceLevel || "HIGH",
        verificationNotes: "Verified by authoritative sources."
      });
    }

    // 6. Default / Academic Solver response
    const option = overrides.option || "B";
    const text = overrides.text || "O(log n)";
    return JSON.stringify({
      directAnswer: overrides.directAnswer || { option, text },
      explanation: overrides.explanation || "Systematic academic analysis confirming the solution.",
      confidence: overrides.confidence || "HIGH",
      confidenceReason: overrides.confidenceReason || "Multiple authoritative references verify the solution.",
      optionAnalysis: overrides.optionAnalysis || [
        { option: "A", text: "Linear search", correct: false, isCorrect: false, reason: "Linear time" },
        { option: "B", text: text, correct: true, isCorrect: true, reason: "Logarithmic time" },
        { option: "C", text: "Quadratic time", correct: false, isCorrect: false, reason: "Quadratic complexity" },
        { option: "D", text: "Constant time", correct: false, isCorrect: false, reason: "Constant complexity" }
      ],
      questionRestated: overrides.questionRestated || "What is the primary solution?",
      ownSolution: overrides.ownSolution || text,
      reasoningSteps: overrides.reasoningSteps || [
        "1. Identify underlying rules and constraints.",
        "2. Derive solution from first principles.",
        "3. Verify against domain references."
      ],
      evidenceUsed: [1]
    });
  };
}

export function teardownStandardMocks() {
  defaultAIClient.mockHandler = null;
  setMockSearchHandler(null);
}
