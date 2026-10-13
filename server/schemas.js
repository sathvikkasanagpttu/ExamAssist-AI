/**
 * ExamAssist AI - Request and Response Validation Schemas (Zod)
 * Shared across server and extension (@examassist/shared).
 */

import { z } from "zod";

export const APP_VERSION = "2.2.0";

export const QuestionTypeEnum = z.enum([
  "MCQ",
  "MULTI_SELECT",
  "TRUE_FALSE",
  "FILL_BLANK",
  "NUMERICAL",
  "CODING",
  "DEBUGGING",
  "OUTPUT_PREDICTION",
  "CODE_MCQ",
  "COMPLEXITY",
  "FILL_IN_CODE",
  "SQL",
  "CONCEPTUAL",
  "SHORT_ANSWER"
]);

export const CodingQuestionSubTypeEnum = z.enum([
  "coding_problem",
  "debug_my_code",
  "predict_the_output",
  "code_mcq",
  "sql_query",
  "complexity_question",
  "fill_in_the_code"
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

export const QuestionQualityStatusEnum = z.enum([
  "clear", "ambiguous", "missing_info", "multiple_correct", "contradictory_options", "truncated"
]);

export const ExplanationLevelEnum = z.enum([
  "Simple",
  "Technical",
  "Interview"
]);

export const SupportedCodeLanguageEnum = z.enum([
  "python",
  "javascript",
  "c",
  "cpp",
  "java",
  "go",
  "rust",
  "sql"
]);

export const SampleTestCaseSchema = z.object({
  stdin: z.string().default(""),
  expectedOutput: z.string().default(""),
  explanation: z.string().optional().default("")
});

export const ExtractedEditorStateSchema = z.object({
  adapter: z.enum(["MonacoAdapter", "CodeMirror6Adapter", "CodeMirror5Adapter", "AceAdapter", "TextareaAdapter", "PreCodeAdapter", "none"]).default("none"),
  code: z.string().default(""),
  language: z.string().default(""),
  selectedText: z.string().default(""),
  cursorLine: z.number().int().nonnegative().nullable().default(null),
  consoleOutput: z.string().default("")
});

export const ExtractedCodingProblemSchema = z.object({
  platform: z.enum(["Generic", "HackerRank", "LeetCode", "GeeksforGeeks", "Moodle", "Canvas", "CustomPortal"]).default("Generic"),
  questionSubType: CodingQuestionSubTypeEnum.default("coding_problem"),
  title: z.string().default(""),
  statement: z.string().default(""),
  constraints: z.string().default(""),
  inputFormat: z.string().default(""),
  outputFormat: z.string().default(""),
  sampleTests: z.array(SampleTestCaseSchema).default([]),
  starterCode: z.string().default(""),
  language: z.string().default("python"),
  failingOutput: z.string().default(""),
  options: z.array(z.string()).default([]),
  editor: ExtractedEditorStateSchema.optional()
});

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

export const CodeAnalyzeRequestSchema = z.object({
  question: z.string().min(3).max(50000),
  title: z.string().max(500).optional().default(""),
  questionSubType: CodingQuestionSubTypeEnum.optional(),
  language: z.string().max(40).optional().default("python"),
  starterCode: z.string().max(64000).optional().default(""),
  userCode: z.string().max(64000).optional().default(""),
  constraints: z.string().max(10000).optional().default(""),
  inputFormat: z.string().max(5000).optional().default(""),
  outputFormat: z.string().max(5000).optional().default(""),
  sampleTests: z.array(SampleTestCaseSchema).max(20).optional().default([]),
  failingOutput: z.string().max(16000).optional().default(""),
  options: z.array(z.string()).max(12).optional().default([]),
  sqlSchema: z.string().max(64000).optional().default(""),
  dialect: z.enum(["SQLite", "PostgreSQL", "MySQL"]).optional().default("SQLite"),
  explanationLevel: ExplanationLevelEnum.optional().default("Technical"),
  mode: z.enum(["Practice Mode", "Authorized Assessment Mode"]).optional().default("Practice Mode")
});

export const CodeDebugRequestSchema = z.object({
  question: z.string().min(3).max(50000),
  language: z.string().max(40).optional().default("python"),
  userCode: z.string().min(1).max(64000),
  failingOutput: z.string().max(16000).optional().default(""),
  sampleTests: z.array(SampleTestCaseSchema).max(20).optional().default([]),
  explanationLevel: ExplanationLevelEnum.optional().default("Technical")
});

export const CodeHintRequestSchema = z.object({
  question: z.string().min(3).max(50000),
  language: z.string().max(40).optional().default("python"),
  userCode: z.string().max(64000).optional().default(""),
  level: z.number().int().min(1).max(4).optional().default(1),
  explanationLevel: ExplanationLevelEnum.optional().default("Technical")
});

export const CodeExplainRequestSchema = z.object({
  question: z.string().min(3).max(50000),
  code: z.string().min(1).max(64000),
  language: z.string().max(40).optional().default("python"),
  explanationLevel: ExplanationLevelEnum.optional().default("Technical")
});

export const CodeComplexityRequestSchema = z.object({
  code: z.string().min(1).max(64000),
  language: z.string().max(40).optional().default("python"),
  question: z.string().max(25000).optional().default(""),
  measureEmpirical: z.boolean().optional().default(true)
});

export const CodeRunSamplesRequestSchema = z.object({
  userCode: z.string().min(1).max(64000),
  language: z.string().max(40).optional().default("python"),
  sampleTests: z.array(SampleTestCaseSchema).max(20).optional().default([])
});

export const CodeReviewRequestSchema = z.object({
  question: z.string().max(50000).optional().default(""),
  code: z.string().min(1).max(64000),
  language: z.string().max(40).optional().default("python")
});

export const CodeTranslateRequestSchema = z.object({
  question: z.string().max(50000).optional().default(""),
  sourceCode: z.string().min(1).max(64000),
  sourceLanguage: z.string().max(40).optional().default("python"),
  targetLanguage: z.string().min(1).max(40),
  sampleTests: z.array(SampleTestCaseSchema).max(20).optional().default([])
});

export const CodeExplainErrorRequestSchema = z.object({
  code: z.string().max(64000).optional().default(""),
  language: z.string().max(40).optional().default("python"),
  errorOutput: z.string().min(1).max(32000)
});

export const CodeAstRequestSchema = z.object({
  code: z.string().min(1).max(64000),
  language: z.string().max(40).optional().default("")
});

export const VisionExtractRequestSchema = z.object({
  imageDataUrl: z.string().min(16).max(6000000),
  mimeType: z.string().max(40).optional().default(""),
  hintContext: z.string().max(500).optional().default("")
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

// Native tool-calling schemas. These are deliberately narrow because model
// tool arguments are untrusted input at the API boundary.
export const WebSearchToolArgsSchema = z.object({
  query: z.string().trim().min(3).max(500),
  maxResults: z.number().int().min(1).max(5).optional().default(5)
}).strict();

export const KnowledgeBaseSearchToolArgsSchema = z.object({
  query: z.string().trim().min(3).max(500)
}).strict();

export const CalculatorToolArgsSchema = z.object({
  expression: z.string().trim().min(1).max(1000),
  operation: z.enum(["evaluate", "simplify", "differentiate", "integrate"]).optional().default("evaluate"),
  variable: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/).optional().default("x")
}).strict();

export const RunCodeToolArgsSchema = z.object({
  language: z.enum(["python", "javascript", "c", "cpp", "java"]),
  code: z.string().min(1).max(64000),
  stdin: z.string().max(12000).optional().default(""),
  timeoutSeconds: z.number().min(0.1).max(3).optional().default(2)
}).strict();

export const RunSqlToolArgsSchema = z.object({
  schema: z.string().max(64000).optional().default(""),
  query: z.string().trim().min(1).max(64000)
}).strict();

// Response Schemas
export const SourceItemSchema = z.object({
  type: z.enum(["web", "course_notes"]),
  title: z.string().optional(),
  url: z.string().optional(),
  domain: z.string().optional(),
  file: z.string().optional(),
  page: z.number().nullable().optional(),
  section: z.string().nullable().optional(),
  authorityTier: z.enum(["HIGH", "MEDIUM", "LOW", "UNASSESSED"]).optional(),
  relevanceTier: z.enum(["HIGH", "MEDIUM", "LOW", "UNASSESSED"]).optional(),
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

export const AgentFinalResponseSchema = z.object({
  directAnswer: z.union([z.string(), z.object({ option: z.string().optional(), text: z.string().optional() })]),
  explanation: z.string().min(1).max(12000),
  reasoningSteps: z.array(z.string().max(2000)).max(12).optional().default([]),
  confidence: ConfidenceEnum.optional().default("UNVERIFIED"),
  confidenceReason: z.string().max(2000).optional().default("Agent result requires verification."),
  optionAnalysis: z.array(OptionAnalysisItemSchema).max(10).optional().default([])
}).strict();

export const AssessmentResponseSchema = z.object({
  question: z.string(),
  questionType: QuestionTypeEnum,
  subject: z.string(),
  topic: z.string(),
  difficulty: DifficultyEnum,
  questionQuality: z.object({
    status: QuestionQualityStatusEnum,
    reason: z.string(),
    missing: z.string()
  }).optional(),
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
  toolEvidence: z.array(z.object({
    tool: z.string(), executed: z.boolean(), success: z.boolean().optional(), output: z.string(),
    language: z.string().optional(), dialect: z.string().optional(), expression: z.string().optional()
  })).optional(),
  verification: z.object({
    status: VerificationStatusEnum,
    supported: z.array(z.string()),
    conflicting: z.array(z.string()),
    unsupported: z.array(z.string())
  }),
  sources: z.array(SourceItemSchema),
  retrievalTimestamp: z.string()
});

export const ExtractedQuestionPayloadSchema = z.object({
  question: z.string().default(""),
  options: z.array(z.string()).default([]),
  codeSnippet: z.string().optional().default(""),
  tableData: z.string().optional().default(""),
  mathFormula: z.string().optional().default(""),
  source: z.string().optional().default("Generic"),
  success: z.boolean().optional().default(true)
});

export const ExtensionMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("RESEARCH_SELECTION"),
    text: z.string().optional().default("")
  }),
  z.object({
    type: z.literal("TRIGGER_EXAM_ASSIST")
  }),
  z.object({
    type: z.literal("ASK"),
    question: z.string().min(1)
  }),
  z.object({
    type: z.literal("EXTRACT_CODING_PROBLEM")
  }),
  z.object({
    type: z.literal("CAPTURE_VISIBLE_TAB")
  }),
  z.object({
    type: z.literal("OPEN_SIDE_PANEL"),
    payload: ExtractedQuestionPayloadSchema.optional()
  })
]);

export const LegacyActionMessageSchema = z.object({
  action: z.enum(["EXTRACT_CODING_PROBLEM", "OPEN_SIDE_PANEL"]),
  payload: z.any().optional()
});

export const RuntimeMessageEnvelopeSchema = z.union([
  ExtensionMessageSchema,
  LegacyActionMessageSchema
]);

export const StreamingEventSchema = z.object({
  event: z.enum(["progress", "stage", "partial", "done", "error"]),
  data: z.record(z.string(), z.any())
});

