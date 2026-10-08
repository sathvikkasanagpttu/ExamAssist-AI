/**
 * ExamAI Pipeline - Step 11: Master Orchestrator
 * Coordinates the full end-to-end evidence-first reasoning pipeline:
 *
 *                    USER QUESTION
 *                         │
 *                         ▼
 *              ┌────────────────────┐
 *              │ Question Analyzer   │
 *              └─────────┬──────────┘
 *                        │
 *                        ▼
 *              ┌────────────────────┐
 *              │ Query Generator    │
 *              └─────────┬──────────┘
 *                        │
 *             ┌──────────┼──────────┐
 *             ▼          ▼          ▼
 *          Search 1   Search 2   Search 3
 *             │          │          │
 *             └──────────┼──────────┘
 *                        ▼
 *              ┌────────────────────┐
 *              │ Source Dedup       │
 *              └─────────┬──────────┘
 *                        ▼
 *              ┌────────────────────┐
 *              │ Source Evaluation  │
 *              └─────────┬──────────┘
 *                        ▼
 *              ┌────────────────────┐
 *              │ Evidence Extraction│
 *              └─────────┬──────────┘
 *                        ▼
 *              ┌────────────────────┐
 *              │ AI Answer Draft    │
 *              └─────────┬──────────┘
 *                        ▼
 *              ┌────────────────────┐
 *              │ Verification       │
 *              │ + Contradictions   │
 *              └─────────┬──────────┘
 *                        ▼
 *              ┌────────────────────┐
 *              │ Final Answer       │
 *              │ + Confidence       │
 *              │ + Citations        │
 *              └─────────┬──────────┘
 *                        ▼
 *              Chrome Extension UI
 */

import { analyzeQuestion } from "./analyzer.js";
import { generateSearchQueries } from "./queryGenerator.js";
import { executeParallelSearches } from "./search.js";
import { evaluateSources } from "./evaluator.js";
import { draftAnswer } from "./drafter.js";
import { detectContradictions, verifyEvidence } from "./verifier.js";
import { generateFinalAnswer } from "./finalizer.js";
import { defaultAIClient } from "../aiClient.js";

export async function runExamAIPipeline(questionText, options = {}, aiClient = defaultAIClient) {
  const startTime = Date.now();
  const pipelineLog = [];

  const logStep = (stepName, detail) => {
    pipelineLog.push({
      step: stepName,
      timestamp: Date.now() - startTime,
      detail
    });
  };

  // 1. Question Analyzer
  logStep("Analyze Question", "Extracting question type, subject, keywords, and constraints...");
  const analysis = analyzeQuestion(questionText, options.optionsOverride || null);
  logStep("Question Analyzed", {
    category: analysis.category,
    subject: analysis.subject,
    keywords: analysis.keywords
  });

  // 2. Search Query Generator
  logStep("Generate Queries", "Generating 3–6 multi-angle search queries...");
  const searchQueries = await generateSearchQueries(analysis, aiClient);
  logStep("Queries Generated", { queriesCount: searchQueries.length, queries: searchQueries.map(q => q.query) });

  // 3 & 4. Parallel Search & Deduplication
  logStep("Execute Parallel Searches", `Running ${searchQueries.length} parallel searches...`);
  const rawSources = await executeParallelSearches(searchQueries, options.maxSources || 6);
  logStep("Sources Retrieved & Deduplicated", { count: rawSources.length });

  // 5. Source Evaluation
  logStep("Evaluate Sources", "Scoring authority, relevance, and evidence quality...");
  const evaluatedSources = await evaluateSources(rawSources, analysis, aiClient);
  logStep("Sources Evaluated", {
    highQualityCount: evaluatedSources.filter(s => s.quality === "HIGH").length,
    mediumQualityCount: evaluatedSources.filter(s => s.quality === "MEDIUM").length
  });

  // 6. AI Answer Draft
  logStep("Draft Answer", `Drafting category-tailored response (${analysis.category})...`);
  const draft = await draftAnswer(analysis, evaluatedSources, aiClient);
  logStep("Answer Drafted", { draftSnippet: draft.slice(0, 100) + "..." });

  // 7. Contradiction Detection
  logStep("Detect Contradictions", "Analyzing retrieved sources for genuine disagreements...");
  const contradictionData = await detectContradictions(analysis.rawQuestion, evaluatedSources, aiClient);
  logStep("Contradictions Checked", { status: contradictionData.status });

  // 8. Evidence Verification & Anti-Hallucination Audit
  logStep("Verify Evidence", "Classifying claim support and enforcing Anti-Hallucination checks...");
  const verificationData = await verifyEvidence(
    analysis.rawQuestion,
    draft,
    evaluatedSources,
    contradictionData,
    aiClient
  );
  logStep("Evidence Verified", {
    overallEvidenceLevel: verificationData.overall_evidence_level,
    claimsVerified: verificationData.claims?.length || 0
  });

  // 9. Final Answer Synthesis
  logStep("Final Answer Generation", "Synthesizing exam-ready answer with confidence & citations...");
  const finalResult = await generateFinalAnswer({
    rawQuestion: analysis.rawQuestion,
    draftAnswer: draft,
    evaluatedSources,
    verificationData,
    contradictionData,
    analysis,
    aiClient
  });

  const durationMs = Date.now() - startTime;
  logStep("Pipeline Completed", { durationMs });

  return {
    success: true,
    question: analysis.rawQuestion,
    category: analysis.category,
    subject: analysis.subject,
    isMCQ: analysis.isMCQ,
    options: analysis.options,
    directAnswer: finalResult.directAnswer,
    explanation: finalResult.explanation,
    keyPoints: finalResult.keyPoints,
    evidenceLevel: finalResult.evidenceLevel,
    verificationNotes: finalResult.verificationNotes,
    claims: finalResult.claims,
    contradictions: finalResult.contradictions,
    sources: finalResult.sources.map(s => ({
      title: s.title,
      url: s.url,
      domain: s.domain,
      quality: s.quality,
      reason: s.evaluation_reason || s.snippet
    })),
    formattedText: finalResult.formattedText,
    searchQueries: searchQueries.map(q => q.query),
    pipelineLog,
    executionTimeMs: durationMs
  };
}
