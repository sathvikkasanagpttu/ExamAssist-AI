/**
 * ExamAssist AI - Master Assessment Orchestrator
 * Coordinates question classification, multi-angle search, evidence extraction,
 * specialized reasoning, verification pass, and confidence calculation.
 */

import { classifyQuestion } from "./classifier.js";
import { generateSearchQueries, orchestrateSearch } from "./searchOrchestrator.js";
import { generateReasonedAnswer } from "./reasoningEngine.js";
import { runVerificationPass } from "./verificationPass.js";
import { computeConfidence } from "./confidenceEngine.js";
import { defaultAIClient } from "../aiClient.js";
import { logger } from "../logger.js";

export async function processAssessmentQuestion({
  question,
  text,
  options = [],
  type,
  questionType: qTypeParam,
  context = "",
  subject: subjectOverride,
  codeSnippet,
  tableData,
  mathFormula,
  maxSources = 5,
  mode = "Practice Mode",
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

  // 2. Multi-Angle Search Orchestration
  let sources = [];
  if (classification.webSearchNeeded) {
    const queries = await generateSearchQueries(classification.rawQuestion, classification.subject, aiClient);
    sources = await orchestrateSearch(queries, maxSources, classification.rawQuestion);
  }

  // 3. Specialized Reasoning Draft
  const reasonedOutput = await generateReasonedAnswer({
    question: classification.rawQuestion,
    questionType: classification.questionType,
    subject: classification.subject,
    topic: classification.topic,
    options: classification.options,
    sources,
    aiClient
  });

  // 4. Verification Pass & Contradiction Detection
  const verification = await runVerificationPass({
    question: classification.rawQuestion,
    directAnswer: typeof reasonedOutput.directAnswer === "object" ? (reasonedOutput.directAnswer?.text || "") : reasonedOutput.directAnswer,
    explanation: reasonedOutput.explanation,
    sources,
    aiClient
  });

  // 5. Confidence Engine
  const { confidence, confidenceReason } = computeConfidence({
    verificationStatus: verification.status,
    sources,
    hasContradiction: verification.hasContradiction,
    contradictionExplanation: verification.contradictionExplanation,
    questionType: classification.questionType
  });

  const latencyMs = Date.now() - startTime;
  logger.info("Assessment processed", {
    questionType: classification.questionType,
    confidence,
    sourcesCount: sources.length,
    latencyMs
  });

  // 6. Assemble Exact Standard Response
  return {
    question: classification.rawQuestion,
    questionType: classification.questionType,
    subject: classification.subject,
    topic: classification.topic,
    difficulty: classification.difficulty,
    directAnswer: reasonedOutput.directAnswer,
    questionRestated: reasonedOutput.questionRestated,
    ownSolution: reasonedOutput.ownSolution,
    confidence: reasonedOutput.confidence || confidence,
    confidenceReason: reasonedOutput.confidenceReason || confidenceReason,
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
    sources: sources.map(s => ({
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
