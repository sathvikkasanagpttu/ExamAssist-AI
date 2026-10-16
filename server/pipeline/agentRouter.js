/**
 * ExamAssist AI - Specialized Agentic Orchestrator & Router
 * Feature B: Maintainable orchestration layer coordinating specialized agents:
 * 1. QuestionRouter: Classifies task and selects targeted workflow.
 * 2. ResearchAgent: Retrieves and reranks external sources.
 * 3. MathematicsAgent: Deterministic mathjs & symbolic calculator.
 * 4. ProgrammingAgent: Tree-sitter AST, complexity analysis, Docker sandbox execution.
 * 5. SQLAgent: SQLite schema inspection and query validation.
 * 6. KnowledgeAgent: Course notes vector search & GraphRAG prerequisite DAG.
 * 7. VerificationAgent: Claim-to-source agreement & contradiction detection.
 * 8. ResponseComposer: Structured, calibrated confidence synthesis.
 */

import { classifyQuestion } from "./classifier.js";
import { generateSearchQueries, orchestrateSearch } from "./searchOrchestrator.js";
import { rerankSources } from "./reranker.js";
import { safeMathEvaluate } from "./calculator.js";
import { executeSymbolic, executeInSandbox, executeSqlInSandbox } from "./sandboxClient.js";
import { defaultKnowledgeGraph } from "../kb/graphRAG.js";
import { searchDocsAndNotes, ragEnabled } from "../kb/knowledgeBase.js";
import { runVerificationPass } from "./verificationPass.js";
import { computeConfidence } from "./confidenceEngine.js";
import { logger } from "../logger.js";

export const WORKFLOW_MODES = {
  MATH: "MATH_WORKFLOW",
  PROGRAMMING: "PROGRAMMING_WORKFLOW",
  SQL: "SQL_WORKFLOW",
  RESEARCH_CONCEPTUAL: "RESEARCH_CONCEPTUAL_WORKFLOW"
};

/**
 * 1. Question Router
 */
export function routeQuestion(question, options = []) {
  const classification = classifyQuestion(question, options);
  let workflow = WORKFLOW_MODES.RESEARCH_CONCEPTUAL;
  const qText = String(question || "").toLowerCase();

  if (classification.questionType === "NUMERICAL" || /\b(calculate|compute|evaluate the expression|integral|derivative)\b/i.test(qText)) {
    workflow = WORKFLOW_MODES.MATH;
  } else if (
    classification.questionType === "CODING" ||
    classification.questionType === "DEBUGGING" ||
    classification.questionType === "OUTPUT_PREDICTION" ||
    /\b(write a function|function\s*\(|def |public static|console\.log|void main|return 0;)\b/i.test(qText) ||
    (/\b(python|javascript|cpp|java|c\+\+|golang)\b/i.test(qText) && /\b(function|reverse|sort|array|string|algorithm)\b/i.test(qText))
  ) {
    workflow = WORKFLOW_MODES.PROGRAMMING;
  } else if (classification.questionType === "SQL" || /\b(select\s+.+\s+from|create\s+table)\b/i.test(qText)) {
    workflow = WORKFLOW_MODES.SQL;
  }

  return {
    workflow,
    classification
  };
}

/**
 * 2. Research Agent
 */
export async function runResearchAgent({ question, subject, questionType, maxResults = 5, aiClient }) {
  const queries = await generateSearchQueries(question, subject, aiClient);
  const rawSources = await orchestrateSearch(queries, maxResults, question, questionType);
  const reranked = rerankSources({ question, sources: rawSources, maxResults });
  return {
    queries,
    sources: reranked.rankedSources,
    contradictions: reranked.contradictions
  };
}

/**
 * 3. Mathematics Agent
 */
export async function runMathematicsAgent({ expression, operation = "evaluate", variable = "x" }) {
  if (operation === "evaluate") {
    const val = safeMathEvaluate(expression);
    return {
      executed: val !== null,
      success: val !== null,
      result: val,
      engine: "mathjs"
    };
  }
  const symbolic = await executeSymbolic({ expression, operation, variable });
  return symbolic;
}

/**
 * 4. Programming Agent
 */
export async function runProgrammingAgent({ language, code, stdin = "", timeoutSeconds = 2 }) {
  const result = await executeInSandbox({ language, code, stdin, timeoutSeconds });
  return {
    ...result,
    language
  };
}

/**
 * 5. SQL Agent
 */
export async function runSqlAgent({ schema = "", query }) {
  return await executeSqlInSandbox({ schema, query });
}

/**
 * 6. Knowledge Agent (Course Notes + GraphRAG)
 */
export async function runKnowledgeAgent({ userId, question, maxDepth = 2 }) {
  const graphContext = defaultKnowledgeGraph.traverseGraphForQuestion(question, { maxDepth });
  let courseNotes = [];

  if (ragEnabled() && userId) {
    try {
      const found = await searchDocsAndNotes({ userId, question });
      courseNotes = (found.matches || []).map((m) => ({
        type: "course_notes",
        title: m.title || m.file || "Course Notes",
        file: m.file,
        snippet: m.snippet,
        page: m.page,
        section: m.section
      }));
    } catch (err) {
      logger.warn("KnowledgeAgent: Course Notes retrieval unavailable", { message: err?.message });
    }
  }

  return {
    graphContext,
    courseNotes
  };
}

/**
 * 7. Verification Agent
 */
export async function runVerificationAgent({ question, directAnswer, sources = [] }) {
  return await runVerificationPass({
    question,
    directAnswer: typeof directAnswer === "object" ? directAnswer.text : directAnswer,
    sources
  });
}

/**
 * 8. Response Composer
 */
export function composeResponse({
  classification,
  directAnswer,
  explanation,
  reasoningSteps = [],
  optionAnalysis = [],
  toolEvidence = [],
  sources = [],
  verification,
  graphContext,
  latencyMs
}) {
  const isSupported = verification?.status === "VERIFIED" || verification?.status === "SUPPORTED";
  const { confidence, confidenceReason } = computeConfidence({
    verificationStatus: isSupported ? "SUPPORTED" : verification?.status === "CONFLICTING" ? "CONFLICTING" : "UNVERIFIED",
    sources,
    hasContradiction: verification?.status === "CONFLICTING",
    questionType: classification.questionType
  });
  const finalConfidence = (verification?.status === "VERIFIED" && sources.length >= 1) ? "HIGH" : confidence;

  return {
    question: classification.rawQuestion,
    questionType: classification.questionType,
    subject: classification.subject,
    topic: classification.topic,
    difficulty: classification.difficulty,
    questionQuality: classification.questionQuality,
    directAnswer,
    explanation,
    reasoningSteps,
    optionAnalysis,
    toolEvidence,
    verification: {
      status: verification?.status || "UNVERIFIED",
      supported: verification?.supported || [],
      conflicting: verification?.conflicting || [],
      unsupported: verification?.unsupported || []
    },
    sources,
    ...(graphContext && graphContext.matchedConcepts.length > 0 ? { graphContext } : {}),
    confidence: finalConfidence,
    confidenceReason,
    latencyMs,
    retrievalTimestamp: new Date().toISOString()
  };
}
