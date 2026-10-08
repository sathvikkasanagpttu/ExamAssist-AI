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
import { runToolCallingAgent } from "./toolCallingAgent.js";

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
  aiClient = defaultAIClient,
  onProgress = null
}) {
  const progress = async (event, data = {}) => {
    if (onProgress) await onProgress(event, data);
  };
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
  await progress("classified", { questionType: classification.questionType, subject: classification.subject, questionQuality: classification.questionQuality });

  // Do not spend retrieval or model calls to force an answer from an unclear
  // prompt. The extension presents this disposition with its edit controls.
  if (classification.questionQuality.status !== "clear") {
    const quality = classification.questionQuality;
    return {
      question: classification.rawQuestion,
      questionType: classification.questionType,
      subject: classification.subject,
      topic: classification.topic,
      difficulty: classification.difficulty,
      questionQuality: quality,
      directAnswer: "UNVERIFIED",
      questionRestated: `Clarify: ${classification.rawQuestion}`,
      ownSolution: "The visible prompt needs revision before it can be answered safely.",
      confidence: "UNVERIFIED",
      confidenceReason: quality.reason,
      explanation: `${quality.reason}${quality.missing ? ` Please provide: ${quality.missing}` : ""}`,
      reasoningSteps: [],
      optionAnalysis: [],
      toolEvidence: [],
      evidenceUsed: [],
      evidenceAgreesWithSolution: false,
      verification: {
        status: "UNVERIFIED",
        supported: [],
        conflicting: [],
        unsupported: [quality.reason]
      },
      sources: [],
      retrievalTimestamp: new Date().toISOString()
    };
  }

  // 2-3. The f_agent experiment replaces static routing with a bounded native
  // function-calling loop. Any error deliberately falls through to the proven
  // solve-first pipeline below, preserving the existing product behavior.
  let allSources = [];
  let reasonedOutput = null;
  let agentTrace = null;
  if (evaluationConfig?.toolCallingAgent) {
    try {
      await progress("solving");
      const agent = await runToolCallingAgent({
        question: classification.rawQuestion,
        classification,
        options: classification.options,
        userId,
        aiClient,
        budget: evaluationConfig.agentBudget
      });
      allSources = agent.sources;
      agentTrace = agent.agentTrace;
      reasonedOutput = {
        ...agent,
        questionRestated: `Determine: ${classification.rawQuestion}`,
        ownSolution: agent.explanation,
        evidenceUsed: [],
        evidenceAgreesWithSolution: true
      };
    } catch (error) {
      logger.warn("Tool-calling agent unavailable; using static pipeline", { code: error.code || "AGENT_FALLBACK" });
    }
  }

  if (!reasonedOutput) {
    let sources = [];
    if (classification.webSearchNeeded && !evaluationConfig?.skipSearch) {
      await progress("searching");
      const queries = await generateSearchQueries(classification.rawQuestion, classification.subject, aiClient);
      sources = await orchestrateSearch(queries, maxSources, classification.rawQuestion, classification.questionType);
      await progress("retrieved", { count: sources.length });
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
    allSources = [...sources, ...courseNotes];
    await progress("solving");
    reasonedOutput = await generateReasonedAnswer({
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
      specializedSolvers: evaluationConfig ? Boolean(evaluationConfig.specializedSolvers) : true
    });
  }

  // 4. Verification Pass & Contradiction Detection
  await progress("verifying");
  const verification = await runVerificationPass({
    question: classification.rawQuestion,
    directAnswer: typeof reasonedOutput.directAnswer === "object" ? (reasonedOutput.directAnswer?.text || "") : reasonedOutput.directAnswer,
    explanation: reasonedOutput.explanation,
    sources: allSources,
    aiClient
  });
  if (reasonedOutput.toolEvidence?.some((item) => !item.executed || !item.success)) {
    verification.status = "UNVERIFIED";
    verification.unsupported = [...(verification.unsupported || []), "A requested deterministic tool did not execute."];
  }

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
    questionQuality: classification.questionQuality,
    directAnswer: reasonedOutput.directAnswer,
    questionRestated: reasonedOutput.questionRestated,
    ownSolution: reasonedOutput.ownSolution,
    confidence: finalConfidence,
    confidenceReason: finalConfidenceReason,
    explanation: reasonedOutput.explanation,
    reasoningSteps: reasonedOutput.reasoningSteps,
    optionAnalysis: reasonedOutput.optionAnalysis,
    toolEvidence: reasonedOutput.toolEvidence || [],
    ...(agentTrace ? { agentTrace } : {}),
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
      authorityTier: s.authorityTier,
      relevanceTier: s.relevanceTier,
      snippet: s.snippet
    })),
    retrievalTimestamp: new Date().toISOString()
  };
}
