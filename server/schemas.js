/**
 * ExamAssist AI - Request and Response Validation Schemas (Zod)
 */

import { z } from "zod";

export const QuestionTypeEnum = z.enum([
  "MCQ",
  "MULTI_SELECT",
  "TRUE_FALSE",
  "FILL_BLANK",
  "NUMERICAL",
  "CODING",
  "DEBUGGING",
  "SQL",
  "CONCEPTUAL",
  "SHORT_ANSWER"
]);

export const DifficultyEnum = z.enum([
  "Introductory",
  "Intermediate",
  "Advanced"
]);

export const ConfidenceEnum = z.enum([
  "HIGH",
  "MEDIUM",
  "LOW",
  "UNVERIFIED"
]);

export const VerificationStatusEnum = z.enum([
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "INFERRED",
  "CONFLICTING",
  "UNVERIFIED"
]);

// Request Schemas
export const AssessmentAnalyzeRequestSchema = z.object({
  question: z.string().optional(),
  text: z.string().optional(),
  options: z.array(z.union([z.string(), z.record(z.string(), z.any())])).optional().default([]),
  type: z.string().optional(),
  subject: z.string().optional(),
  context: z.string().max(10000).optional().default(""),
  codeSnippet: z.string().optional(),
  tableData: z.string().optional(),
  mathFormula: z.string().optional(),
  maxSources: z.number().int().min(1).max(10).optional().default(5),
  mode: z.enum(["Practice Mode", "Authorized Assessment Mode"]).optional().default("Practice Mode")
});

export const QuestionClassifyRequestSchema = z.object({
  question: z.string().min(3).max(25000),
  options: z.array(z.any()).optional().default([])
});

export const SearchRequestSchema = z.object({
  queries: z.array(z.string()).min(1).max(8),
  maxResults: z.number().int().min(1).max(15).optional().default(6)
});

export const EvidenceVerifyRequestSchema = z.object({
  question: z.string().min(3),
  draftAnswer: z.string().min(1),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string().optional()
  })).default([])
});

export const AnswerGenerateRequestSchema = z.object({
  question: z.string().min(3),
  questionType: QuestionTypeEnum,
  subject: z.string(),
  options: z.array(z.any()).optional().default([]),
  sources: z.array(z.any()).default([])
});

// Response Schemas
export const SourceItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  authority: z.number().min(0).max(100),
  relevance: z.number().min(0).max(100),
  snippet: z.string().optional()
});

export const DirectAnswerSchema = z.union([
  z.string(),
  z.object({
    option: z.string().optional(),
    text: z.string().optional()
  })
]);

export const OptionAnalysisItemSchema = z.object({
  option: z.string().optional(),
  text: z.string().optional(),
  correct: z.boolean().optional(),
  isCorrect: z.boolean().optional(),
  reason: z.string().optional(),
  analysis: z.string().optional()
});

export const AssessmentResponseSchema = z.object({
  question: z.string(),
  questionType: QuestionTypeEnum,
  subject: z.string(),
  topic: z.string(),
  difficulty: DifficultyEnum,
  directAnswer: DirectAnswerSchema,
  questionRestated: z.string().optional(),
  ownSolution: z.string().optional(),
  evidenceAgreesWithSolution: z.boolean().optional(),
  evidenceUsed: z.array(z.any()).optional(),
  confidence: ConfidenceEnum,
  confidenceReason: z.string(),
  explanation: z.string(),
  reasoningSteps: z.array(z.string()),
  optionAnalysis: z.array(OptionAnalysisItemSchema),
  verification: z.object({
    status: VerificationStatusEnum,
    supported: z.array(z.string()),
    conflicting: z.array(z.string()),
    unsupported: z.array(z.string())
  }),
  sources: z.array(SourceItemSchema),
  retrievalTimestamp: z.string()
});
