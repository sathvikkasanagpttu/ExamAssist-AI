/**
 * ExamAssist AI - Master Assessment Orchestrator
 * Coordinates:
 * 1. Question Classification & Context Extraction
 * 2. Multi-Angle Search (relevance-first, skipped for pure math/code)
 * 3. Solve-Before-Searching Reasoning (first principles -> evidence -> tie-break)
 * 4. Verification Pass & Contradiction Detection (strict UNVERIFIED if unverified)
 * 5. Calibrated Confidence (LOWER of model confidence and confidence engine)
 */

import { classifyQuestion } from "./classifier.js";
import { generateSearchQueries, orchestrateSearch } from "./searchOrchestrator.js";
import { generateReasonedAnswer } from "./reasoningEngine.js";
import { runVerificationPass } from "./verificationPass.js";
import { computeConfidence } from "./confidenceEngine.js";
import { defaultAIClient } from "../aiClient.js";
import { logger } from "../logger.js";
import { ragEnabled, searchKnowledgeBase } from "../kb/knowledgeBase.js";

const CONFIDENCE_RANKS = {
  UNVERIFIED: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
};

function pickLowerConfidence(confA, confB) {
  const normA = (confA || "UNVERIFIED").toUpperCase();
  const normB = (confB || "UNVERIFIED").toUpperCase();
  const rankA = CONFIDENCE_RANKS[normA] !== undefined ? CONFIDENCE_RANKS[normA] : 0;
  const rankB = CONFIDENCE_RANKS[normB] !== undefined ? CONFIDENCE_RANKS[normB] : 0;
  return rankA <= rankB ? normA : normB;
}

export async function processAssessmentQuestion({
  question,
  text,
  options = [],
  type,
  questionType: qTypeParam,
  context = "",
  subject: subjectOverride,
  userId = null,
  codeSnippet = "",
  tableData = "",
  mathFormula = "",
  maxSources = 5,
  mode = "Practice Mode",
  evaluationConfig = null,
  aiClient = defaultAIClient
}) {
  const startTime = Date.now();
  const rawQ = (question || text || "").trim();
  if (!rawQ || rawQ.length < 5) {
    throw new Error("EMPTY_QUESTION");
  }

  // 1. Classify Question
  let combinedQuestion = rawQ;
  if (codeSnippet && !combinedQuestion.includes(codeSnippet)) {
    combinedQuestion += `\n\nCode Snippet:\n\`\`\`\n${codeSnippet}\n\`\`\``;
  }
  if (tableData && !combinedQuestion.includes(tableData)) {
    combinedQuestion += `\n\nTable Data:\n${tableData}`;
  }
  if (mathFormula && !combinedQuestion.includes(mathFormula)) {
    combinedQuestion += `\n\nFormula: ${mathFormula}`;
  }
  if (context && !combinedQuestion.includes(context)) {
    combinedQuestion = `Context: ${context}\n\n${combinedQuestion}`;
  }

  const classification = classifyQuestion(combinedQuestion, options);
  if (type || qTypeParam) classification.questionType = type || qTypeParam;
  if (subjectOverride) classification.subject = subjectOverride;

  logger.info("Question classified", {
    questionType: classification.questionType,
    subject: classification.subject,
    difficulty: classification.difficulty
  });

  // 2. Multi-Angle Search Orchestration (Priority 3: relevance-first, skipped for pure math/code)
  let sources = [];
  if (classification.webSearchNeeded && !evaluationConfig?.skipSearch) {
    const queries = await generateSearchQueries(classification.rawQuestion, classification.subject, aiClient);
    sources = await orchestrateSearch(queries, maxSources, classification.rawQuestion, classification.questionType);
  }

  let courseNotes = [];
  if (ragEnabled() && userId && evaluationConfig?.ragEnabled !== false) {
    try {
      const retrieval = await searchKnowledgeBase({ userId, question: classification.rawQuestion });
      courseNotes = retrieval.matches.map((match) => ({
        type: "course_notes",
        title: match.file,
        domain: "Course Notes",
        file: match.file,
        page: match.page,
        snippet: match.snippet,
        section: match.section
      }));
    } catch (error) {
      logger.warn("Course Notes retrieval unavailable", { code: error.code || "KB_RETRIEVAL_FAILED" });
    }
  }
  const allSources = [...sources, ...courseNotes];

  // 3. Specialized Reasoning (Solve before search, mathjs/sandbox, option integrity)
  const reasonedOutput = await generateReasonedAnswer({
    question: classification.rawQuestion,
    questionType: classification.questionType,
    subject: classification.subject,
    topic: classification.topic,
    options: classification.options,
    sources: allSources,
    codeSnippet,
    mathFormula,
    aiClient,
    skipTieBreak: Boolean(evaluationConfig?.skipTieBreak),
    specializedSolvers: Boolean(evaluationConfig?.specializedSolvers)
  });

  // 4. Verification Pass & Contradiction Detection
  const verification = await runVerificationPass({
    question: classification.rawQuestion,
    directAnswer: typeof reasonedOutput.directAnswer === "object" ? (reasonedOutput.directAnswer?.text || "") : reasonedOutput.directAnswer,
    explanation: reasonedOutput.explanation,
    sources: allSources,
    aiClient
  });

  // 5. Confidence Engine Calibration
  const engineResult = computeConfidence({
    verificationStatus: verification.status,
    sources: allSources,
    hasContradiction: verification.hasContradiction,
    contradictionExplanation: verification.contradictionExplanation,
    questionType: classification.questionType
  });

  // Priority 1 point 4: Compute final confidence as the LOWER of engine confidence and model confidence. Never default to HIGH.
  const finalConfidence = pickLowerConfidence(engineResult.confidence, reasonedOutput.confidence);
  let finalConfidenceReason = engineResult.confidenceReason;
  if (finalConfidence === (reasonedOutput.confidence || "").toUpperCase() && reasonedOutput.confidenceReason) {
    finalConfidenceReason = reasonedOutput.confidenceReason;
  }
  if (verification.status === "UNVERIFIED" || allSources.length === 0) {
    finalConfidenceReason = "Evidence is unverified or unavailable; independent verification required.";
  }

  const latencyMs = Date.now() - startTime;
  logger.info("Assessment processed", {
    questionType: classification.questionType,
    confidence: finalConfidence,
    sourcesCount: allSources.length,
    latencyMs
  });

  // 6. Return Structured Assessment Response
  return {
    question: classification.rawQuestion,
    questionType: classification.questionType,
    subject: classification.subject,
    topic: classification.topic,
    difficulty: classification.difficulty,
    directAnswer: reasonedOutput.directAnswer,
    questionRestated: reasonedOutput.questionRestated,
    ownSolution: reasonedOutput.ownSolution,
    confidence: finalConfidence,
    confidenceReason: finalConfidenceReason,
    explanation: reasonedOutput.explanation,
    reasoningSteps: reasonedOutput.reasoningSteps,
    optionAnalysis: reasonedOutput.optionAnalysis,
    evidenceUsed: reasonedOutput.evidenceUsed || [],
    evidenceAgreesWithSolution: reasonedOutput.evidenceAgreesWithSolution !== undefined ? reasonedOutput.evidenceAgreesWithSolution : true,
    verification: {
      status: verification.status,
      supported: verification.supported,
      conflicting: verification.conflicting,
      unsupported: verification.unsupported
    },
    sources: allSources.map(s => ({
      ...(s.type === "course_notes" ? { type: "course_notes", file: s.file, page: s.page } : { type: "web" }),
      title: s.title,
      url: s.url,
      domain: s.domain,
      authority: s.authority,
      relevance: s.relevance,
      snippet: s.snippet
    })),
    retrievalTimestamp: new Date().toISOString()
  };
}
