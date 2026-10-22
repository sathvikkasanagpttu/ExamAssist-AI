import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  APP_VERSION,
  AssessmentAnalyzeRequestSchema,
  QuestionClassifyRequestSchema,
  SearchRequestSchema,
  EvidenceVerifyRequestSchema,
  AnswerGenerateRequestSchema,
  CodeAnalyzeRequestSchema,
  CodeDebugRequestSchema,
  CodeHintRequestSchema,
  CodeExplainRequestSchema,
  CodeComplexityRequestSchema,
  CodeRunSamplesRequestSchema,
  CodeReviewRequestSchema,
  CodeTranslateRequestSchema,
  CodeExplainErrorRequestSchema,
  CodeAstRequestSchema,
  VisionExtractRequestSchema
} from "./schemas.js";
import { createRateLimiter } from "./rateLimiter.js";
import { logger } from "./logger.js";
import { processAssessmentQuestion } from "./pipeline/assessmentOrchestrator.js";
import { classifyQuestion } from "./pipeline/classifier.js";
import { generateSearchQueries, orchestrateSearch } from "./pipeline/searchOrchestrator.js";
import { generateReasonedAnswer } from "./pipeline/reasoningEngine.js";
import { runVerificationPass } from "./pipeline/verificationPass.js";
import { defaultAIClient, AIError, AIConfigError } from "./aiClient.js";
import { getActiveSearchProvider } from "./pipeline/search.js";
import { sandboxHealth, sandboxDetailedHealth } from "./pipeline/sandboxClient.js";
import {
  analyzeCodingProblem,
  debugUserCode,
  generateCodingHint,
  estimateComplexity,
  runStaticCodeAnalysis,
  runUserCodeOnSamples,
  reviewUserCode,
  translateSolutionCode,
  explainCompilerOrRuntimeError
} from "./pipeline/codingEngine.js";
import { analyzeAstWithTreeSitter } from "./pipeline/treeSitterAnalyzer.js";
import { extractFromVisionRegion, VisionValidationError } from "./pipeline/visionExtractor.js";
import {
  scrubSecretsAndPII,
  startSpan,
  getRecentSpans,
  isLocalhostRequest,
  isSemanticCacheEnabled,
  computeProblemCacheKey,
  getVerifiedCachedResult,
  setVerifiedCachedResult
} from "./pipeline/observabilityAndSafety.js";
import multer from "multer";
import {
  deleteDocument,
  ingestDocument,
  initializeKnowledgeBase,
  isValidLocalUserId,
  KnowledgeBaseError,
  listDocuments,
  ragEnabled,
  searchKnowledgeBase,
  searchDocsAndNotes
} from "./kb/knowledgeBase.js";
import { defaultKnowledgeGraph, compareRagVsGraphRag } from "./kb/graphRAG.js";
import { initLangfuseTracing, flushLangfuse, isLangfuseConfigured, traceChain } from "./tracing.js";

initLangfuseTracing();

const app = express();

// Trust Proxy Configuration
const trustProxyEnv = process.env.TRUST_PROXY;
if (trustProxyEnv !== undefined) {
  if (trustProxyEnv === "true") {
    app.set("trust proxy", true);
  } else if (trustProxyEnv === "false") {
    app.set("trust proxy", false);
  } else if (!Number.isNaN(Number(trustProxyEnv))) {
    app.set("trust proxy", Number(trustProxyEnv));
  } else {
    app.set("trust proxy", trustProxyEnv);
  }
} else {
  app.set("trust proxy", false);
}

// 1. CORS Configuration
export function parseAllowedOrigins(env = process.env) {
  const raw = env.ALLOWED_ORIGINS || env.CORS_ALLOWED_ORIGINS || "";
  const list = raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (env.EXTENSION_ID) {
    const extOrigin = `chrome-extension://${env.EXTENSION_ID}`;
    if (!list.includes(extOrigin)) {
      list.push(extOrigin);
    }
  }
  return list;
}

export function isOriginAllowed(origin, env = process.env) {
  if (!origin) {
    return true;
  }

  const allowed = parseAllowedOrigins(env);

  if (allowed.includes("*")) {
    return true;
  }

  if (allowed.includes(origin)) {
    return true;
  }

  // "null" origin is ONLY allowed if explicitly configured in ALLOWED_ORIGINS
  if (origin === "null") {
    return allowed.includes("null");
  }

  // In development, allow ONLY localhost and 127.0.0.1 origins
  const isDev = env.NODE_ENV !== "production";
  if (isDev) {
    try {
      const url = new URL(origin);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        return true;
      }
    } catch {}
    return false;
  }

  return false;
}

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS origin not allowed by policy"));
    }
  }
}));

app.use((err, req, res, next) => {
  if (err && typeof err.message === "string" && err.message.includes("CORS origin not allowed")) {
    return res.status(403).json({ error: "Forbidden", message: err.message, code: "CORS_FORBIDDEN" });
  }
  next(err);
});

// 2. Request body parser with strict size limits (6MB only for /api/vision/extract; 64KB everywhere else)
app.use("/api/vision/extract", express.json({ limit: "6mb" }));
app.use(express.json({ limit: "64kb" }));

// 3. Rate limiting middleware
app.use(createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  maxEntries: Number(process.env.RATE_LIMIT_MAX_ENTRIES || 10000)
}));

const port = Number(process.env.PORT || 8787);
const defaultHost = "127.0.0.1";
const host = process.env.HOST || defaultHost;
if (host === "0.0.0.0") {
  logger.warn("Server bound to 0.0.0.0. External access is enabled - ensure appropriate network firewalls are configured.");
}
const kbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Number(process.env.KB_MAX_UPLOAD_BYTES || 10 * 1024 * 1024), files: 1 } });
const isTestRun =
  process.env.NODE_ENV === "test" ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.execArgv.some((arg) => arg.startsWith("--test")) ||
  process.argv.some((arg) => arg.startsWith("--test") || arg.endsWith(".test.js"));
if (!isTestRun) {
  void initializeKnowledgeBase();
}

function localUserId(req) {
  const value = req.get?.("x-local-user-id") || req.headers?.["x-local-user-id"];
  return isValidLocalUserId(value) ? value : null;
}

function sendKnowledgeBaseError(res, error) {
  if (error instanceof KnowledgeBaseError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  if (error instanceof multer.MulterError) {
    return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: "Upload could not be processed", code: error.code });
  }
  return res.status(500).json({ error: "Course Notes request failed", code: "KB_REQUEST_FAILED" });
}

function formatZodErrors(error) {
  const issues = error?.issues || error?.errors || [];
  return issues.map(e => `${(e.path && e.path.length) ? e.path.join(".") + ": " : ""}${e.message}`);
}

// --- ENDPOINTS ---

/**
 * GET /api/health - Service health and capabilities check
 */
app.get(["/health", "/api/health"], async (_req, res) => {
  await initializeKnowledgeBase();
  const detailedSandbox = await sandboxDetailedHealth();
  res.json({
    status: "ok",
    service: "ExamAssist AI Assessment Copilot",
    version: APP_VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
    aiConfigured: defaultAIClient.isConfigured,
    ragEnabled: ragEnabled(),
    sandboxEnabled: detailedSandbox.enabled,
    sandboxEnabledByLanguage: detailedSandbox.sandboxEnabledByLanguage,
    sandboxRuntime: detailedSandbox.runtime,
    queueStatus: detailedSandbox.queue,
    visionEnabled: defaultAIClient.isConfigured,
    searchProvider: getActiveSearchProvider(),
    model: defaultAIClient.model,
    pipelineSteps: [
      "1. Question Extraction & Analysis",
      "2. Subject & Type Classification",
      "3. Search Query Formulation",
      "4. Multi-Source Evidence Retrieval",
      "5. Domain Scoring & Ranking",
      "6. Evidence Snippet Extraction",
      "7. Specialized Domain Reasoning",
      "8. Distractor & Option Analysis",
      "9. Fact & Claim Cross-Verification",
      "10. Confidence Calibration & Error Handling",
      "11. Pedagogical Structured Response"
    ],
    features: {
      searchOrchestration: true,
      verificationPass: true,
      specializedReasoning: ["NUMERICAL", "CODING", "DEBUGGING", "SQL", "MCQ", "MULTI_SELECT"],
      cacheEnabled: true,
      langfuseTracing: isLangfuseConfigured()
    }
  });
});

// Course Notes are scoped to the extension's locally generated profile ID.
app.post("/api/kb/documents", (req, res) => {
  kbUpload.single("file")(req, res, async (uploadError) => {
    if (uploadError) return sendKnowledgeBaseError(res, uploadError);
    try {
      const document = await ingestDocument({
        userId: localUserId(req),
        fileName: req.file?.originalname || "",
        buffer: req.file?.buffer
      });
      res.status(document.duplicate ? 200 : 201).json({ document });
    } catch (error) {
      sendKnowledgeBaseError(res, error);
    }
  });
});

app.get("/api/kb/documents", async (req, res) => {
  try {
    res.json(await listDocuments(localUserId(req)));
  } catch (error) {
    sendKnowledgeBaseError(res, error);
  }
});

app.delete("/api/kb/documents/:id", async (req, res) => {
  try {
    const deleted = await deleteDocument(localUserId(req), req.params.id);
    res.status(deleted ? 200 : 404).json({ deleted });
  } catch (error) {
    sendKnowledgeBaseError(res, error);
  }
});

app.post("/api/kb/search", async (req, res) => {
  try {
    const result = await searchKnowledgeBase({ userId: localUserId(req), question: req.body?.question, debug: true });
    res.json(result);
  } catch (error) {
    sendKnowledgeBaseError(res, error);
  }
});

app.post("/api/kb/docs-search", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    if (!question) {
      return res.status(400).json({ error: "A search question is required.", code: "KB_QUERY_REQUIRED" });
    }
    const result = await searchDocsAndNotes({
      userId: localUserId(req),
      question,
      language: String(req.body?.language || "")
    });
    res.json(result);
  } catch (error) {
    sendKnowledgeBaseError(res, error);
  }
});

/**
 * GET /api/config - Public configuration for extensions
 */
app.get("/api/config", (_req, res) => {
  res.json({
    version: APP_VERSION,
    supportedQuestionTypes: [
      "MCQ", "MULTI_SELECT", "TRUE_FALSE", "FILL_BLANK",
      "NUMERICAL", "CODING", "DEBUGGING", "SQL", "CONCEPTUAL", "SHORT_ANSWER"
    ],
    defaultMode: "Practice Mode",
    modes: ["Practice Mode", "Authorized Assessment Mode"],
    maxQuestionLength: 25000,
    rateLimitPerMinute: 120
  });
});

/**
 * POST /api/graph/traverse - GraphRAG Concept & Prerequisite Traversal
 */
app.post("/api/graph/traverse", (req, res) => {
  const question = String(req.body?.question || req.body?.text || "").trim();
  if (!question) {
    return res.status(400).json({ error: "A question string is required for graph traversal." });
  }
  const maxDepth = Number(req.body?.maxDepth || 2);
  const result = defaultKnowledgeGraph.traverseGraphForQuestion(question, { maxDepth });
  res.json({
    status: "ok",
    question,
    ...result
  });
});

/**
 * GET /api/graph/compare - Comparative benchmark of standard RAG vs GraphRAG
 */
app.get("/api/graph/compare", (req, res) => {
  const rawQ = req.query?.question || (req.url && req.url.includes("?") ? new URLSearchParams(req.url.split("?")[1]).get("question") : "") || "Explain Bayes Theorem and how to calculate posterior probability";
  const question = decodeURIComponent(String(rawQ).replace(/\+/g, " ")).trim();
  const comparison = compareRagVsGraphRag(question);
  res.json({
    status: "ok",
    ...comparison
  });
});

/**
 * GET /api/demo/benchmarks - Recruiter Benchmark Showcase Scenarios
 */
app.get("/api/demo/benchmarks", (_req, res) => {
  res.json({
    status: "ok",
    suiteName: "ExamAssist AI Professional Showcase & Recruiter Suite",
    version: APP_VERSION,
    benchmarks: [
      {
        id: "bm_multimodal_vision",
        category: "Multimodal Question Understanding",
        title: "Diagram & OCR Parsing: Binary Search Tree",
        description: "Tests automated OCR fallback and image validation for diagram-heavy assessments.",
        samplePayload: {
          question: "Given a Binary Search Tree with root 10, left child 5, right child 15, what is the inorder traversal?",
          options: ["A) 15, 10, 5", "B) 5, 10, 15", "C) 10, 5, 15", "D) 5, 15, 10"],
          diagramType: "tree_diagram"
        }
      },
      {
        id: "bm_code_sandbox",
        category: "Secure Code Execution & Edge Cases",
        title: "Algorithmic Verification: Two Sum",
        description: "Runs generated Python/C++ code against 5+ hidden test cases in an isolated Docker sandbox.",
        samplePayload: {
          language: "python",
          question: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
          sampleTests: [{ stdin: "4\n2 7 11 15\n9", expectedOutput: "0 1" }]
        }
      },
      {
        id: "bm_math_deterministic",
        category: "Deterministic Mathematics",
        title: "Exact Calculation: Bayes' Posterior Probability",
        description: "Evaluates exact numerical formulas using MathJS without LLM arithmetic hallucination.",
        samplePayload: {
          question: "Calculate the posterior probability P(A|B) given P(A) = 0.01, P(B|A) = 0.99, P(B|not A) = 0.05.",
          mathFormula: "P(A|B) = (0.99 * 0.01) / (0.99 * 0.01 + 0.05 * 0.99)"
        }
      },
      {
        id: "bm_contradiction_detection",
        category: "Source Verification & Conflict Detection",
        title: "Contradiction Flagging: Time Complexity Disagreement",
        description: "Flags conflicting academic claims and labels confidence as UNVERIFIED or LOW.",
        samplePayload: {
          question: "Is Dijkstra's algorithm guaranteed to terminate on graphs with negative cycles?",
          options: ["A) Yes, always", "B) No, it may loop indefinitely", "C) Only in directed graphs", "D) Only in DAGs"]
        }
      },
      {
        id: "bm_graph_rag",
        category: "GraphRAG & Concept Prerequisite Traversal",
        title: "Knowledge Graph Traversal: Dijkstra's Algorithm",
        description: "Traverses concept DAG to retrieve foundational prerequisites, related theorems, and common pitfalls.",
        samplePayload: {
          question: "Explain Dijkstra's shortest path algorithm, its prerequisites, and limitations.",
          targetConcept: "dijkstra"
        }
      }
    ]
  });
});

/**
 * POST /api/assessment/analyze - Master End-to-End Endpoint
 */
app.post("/api/assessment/analyze", async (req, res) => {
  try {
    const rawQuestion = (req.body?.question || req.body?.text || "").trim();
    if (!rawQuestion || rawQuestion.length < 5) {
      return res.status(400).json({ error: "No question detected" });
    }

    const parseResult = AssessmentAnalyzeRequestSchema.safeParse({
      ...req.body,
      question: rawQuestion
    });
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: formatZodErrors(parseResult.error)
      });
    }

    const payload = parseResult.data;
    const response = await processAssessmentQuestion({ ...payload, userId: localUserId(req) });

    res.json(response);
  } catch (err) {
    if (err.message === "EMPTY_QUESTION") {
      return res.status(400).json({ error: "No question detected" });
    }
    if (err instanceof AIError || (err.code && err.code.startsWith("AI_"))) {
      logger.warn("Assessment analyze AI error", { code: err.code, message: err.message });
      return res.status(err.status || 503).json({
        error: err.message,
        code: err.code,
        message: err.message
      });
    }
    logger.error("Assessment analyze failed", { errorCategory: "PIPELINE_ERROR", message: err.message });
    res.status(500).json({
      error: "Analysis failed",
      message: err.message || "Unable to verify this answer because reliable evidence was not available."
    });
  }
});

/**
 * POST streaming variant. It keeps the regular JSON endpoint intact while
 * exposing only user-visible pipeline progress through server-sent events.
 */
app.post("/api/assessment/analyze/stream", async (req, res) => {
  let cancelled = false;
  const send = (event, data = {}) => {
    if (!cancelled && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const cancel = () => { cancelled = true; };
  req.once("aborted", cancel);
  res.once("close", cancel);
  try {
    const rawQuestion = (req.body?.question || req.body?.text || "").trim();
    if (!rawQuestion || rawQuestion.length < 5) {
      send("error", { code: "EMPTY_QUESTION", message: "No question detected" });
      return res.end();
    }
    const parseResult = AssessmentAnalyzeRequestSchema.safeParse({ ...req.body, question: rawQuestion });
    if (!parseResult.success) {
      send("error", { code: "VALIDATION_ERROR", message: "Validation Error", details: formatZodErrors(parseResult.error) });
      return res.end();
    }
    const response = await processAssessmentQuestion({
      ...parseResult.data,
      userId: localUserId(req),
      onProgress: async (event, data) => {
        if (cancelled) {
          const error = new Error("Client cancelled the analysis");
          error.code = "REQUEST_ABORTED";
          throw error;
        }
        send(event, data);
      }
    });
    send("done", { response });
  } catch (err) {
    if (!cancelled) send("error", { code: err.code || "PIPELINE_ERROR", message: err.message || "Analysis failed" });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

/**
 * POST /api/question/classify - Classify question type & subject
 */
app.post("/api/question/classify", (req, res) => {
  try {
    const parseResult = QuestionClassifyRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: formatZodErrors(parseResult.error)
      });
    }

    const { question, options } = parseResult.data;
    const classification = classifyQuestion(question, options);

    res.json(classification);
  } catch (err) {
    logger.error("Classification failed", { errorCategory: "CLASSIFICATION_ERROR", message: err.message });
    res.status(500).json({ error: "Classification failed" });
  }
});

/**
 * POST /api/search - Multi-angle search orchestrator
 */
app.post("/api/search", async (req, res) => {
  try {
    const parseResult = SearchRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: formatZodErrors(parseResult.error)
      });
    }

    const { queries, maxResults } = parseResult.data;
    const results = await orchestrateSearch(queries, maxResults);

    res.json({ queries, count: results.length, sources: results });
  } catch (err) {
    logger.error("Search failed", { errorCategory: "SEARCH_ERROR", message: err.message });
    res.status(500).json({ error: "Search retrieval failed", sources: [] });
  }
});

/**
 * POST /api/evidence/verify - Claim verification & contradiction detection
 */
app.post("/api/evidence/verify", async (req, res) => {
  try {
    const parseResult = EvidenceVerifyRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: formatZodErrors(parseResult.error)
      });
    }

    const { question, draftAnswer, sources } = parseResult.data;
    const verification = await runVerificationPass({
      question,
      directAnswer: draftAnswer,
      explanation: "",
      sources
    });

    res.json(verification);
  } catch (err) {
    logger.error("Verification failed", { errorCategory: "VERIFICATION_ERROR", message: err.message });
    res.status(500).json({
      error: "Verification failed",
      status: "UNVERIFIED",
      supported: [],
      conflicting: [],
      unsupported: ["Verification failed due to internal error."]
    });
  }
});

/**
 * POST /api/answer/generate - Specialized Reasoning Answer Generation
 */
app.post("/api/answer/generate", async (req, res) => {
  try {
    const parseResult = AnswerGenerateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Validation Error",
        details: formatZodErrors(parseResult.error)
      });
    }

    const { question, questionType, subject, options, sources } = parseResult.data;
    const answerData = await generateReasonedAnswer({
      question,
      questionType,
      subject,
      topic: subject,
      options,
      sources
    });

    res.json(answerData);
  } catch (err) {
    logger.error("Answer generation failed", { errorCategory: "REASONING_ERROR", message: err.message });
    res.status(500).json({
      error: "Answer generation failed",
      directAnswer: "Unable to verify this answer because reliable evidence was not available.",
      explanation: "Internal reasoning engine failure."
    });
  }
});

// --- BACKWARD COMPATIBILITY ALIASES ---
app.post("/api/answer", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    if (!question) return res.status(400).json({ error: "Question is required" });

    const options = Array.isArray(req.body?.options) ? req.body.options : [];
    const response = await processAssessmentQuestion({ question, options });

    // Output formatted fields along with standard schema
    res.json({
      ...response,
      answer: response.directAnswer,
      keyPoints: response.reasoningSteps || [],
      evidenceLevel: response.confidence,
      verificationNotes: response.confidenceReason,
      pipelineLog: [
        "1. Question Extraction & Analysis",
        "2. Subject Classification",
        "3. Multi-Angle Search",
        "4. Evidence Extraction",
        "5. Specialized Reasoning",
        "6. Fact Verification",
        "7. Confidence Calibration"
      ]
    });
  } catch (err) {
    res.status(500).json({
      error: "Assessment processing error",
      message: "Unable to verify this answer because reliable evidence was not available."
    });
  }
});

app.post("/api/analyze", (req, res) => {
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "Question is required" });
  const options = Array.isArray(req.body?.options) ? req.body.options : [];
  const result = classifyQuestion(question, options);
  res.json({
    ...result,
    isMCQ: result.questionType === "MCQ" || result.questionType === "MULTI_SELECT",
    isMath: result.questionType === "NUMERICAL",
    isCoding: result.questionType === "CODING" || result.questionType === "DEBUGGING" || result.questionType === "SQL"
  });
});

// --- PHASE 2 & 4: CODING ENGINE & OBSERVABILITY ENDPOINTS ---

/**
 * POST /api/code/analyze - Full Coding Engine Pipeline
 */
app.post("/api/code/analyze", async (req, res) => {
  return await traceChain(
    "code.analyze",
    async (traceSpan) => {
      const span = startSpan("code.analyze", { language: req.body?.language });
      try {
        const parseResult = CodeAnalyzeRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
          span.end("validation_error");
          traceSpan.update({ level: "WARNING", statusMessage: "Validation error" });
          return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
        }
        const payload = parseResult.data;
        const scrubbedQuestion = scrubSecretsAndPII(payload.question).text;
        const scrubbedUserCode = scrubSecretsAndPII(payload.userCode).text;
        traceSpan.update({
          input: { language: payload.language, question: scrubbedQuestion },
          metadata: { language: payload.language, constraints: payload.constraints },
          tags: ["coding", payload.language].filter(Boolean)
        });

        const cacheKey = computeProblemCacheKey({
          userId: localUserId(req) || "anon",
          question: scrubbedQuestion,
          constraints: payload.constraints,
          language: payload.language,
          sampleTests: payload.sampleTests
        });

        const cached = getVerifiedCachedResult(cacheKey);
        if (cached) {
          span.end("cache_hit");
          traceSpan.update({ output: { cached: true } });
          return res.json({ ...cached, fromSemanticCache: true });
        }

        const result = await analyzeCodingProblem({
          ...payload,
          question: scrubbedQuestion,
          userCode: scrubbedUserCode
        });
        setVerifiedCachedResult(cacheKey, result);
        span.end("ok", { confidence: result.confidence });
        traceSpan.update({
          output: {
            confidence: result.confidence,
            approachSummary: result.approachSummary
          }
        });
        res.json(result);
      } catch (err) {
        span.end("error", { code: err.code });
        traceSpan.update({ level: "ERROR", statusMessage: err.message });
        if (err instanceof AIError || (err.code && err.code.startsWith("AI_"))) {
          return res.status(err.status || 503).json({ error: err.message, code: err.code });
        }
        res.status(500).json({ error: "Code analysis failed", message: err.message });
      }
    },
    {
      userId: localUserId(req) || undefined,
      tags: ["coding", req.body?.language].filter(Boolean)
    }
  );
});

/**
 * POST /api/code/analyze/stream - SSE Streaming Coding Engine Pipeline
 */
app.post("/api/code/analyze/stream", async (req, res) => {
  let cancelled = false;
  const send = (event, data = {}) => {
    if (!cancelled && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const cancel = () => { cancelled = true; };
  req.once("aborted", cancel);
  res.once("close", cancel);

  try {
    const parseResult = CodeAnalyzeRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      send("error", { code: "VALIDATION_ERROR", message: "Validation Error", details: formatZodErrors(parseResult.error) });
      return res.end();
    }
    const payload = parseResult.data;
    const response = await analyzeCodingProblem({
      ...payload,
      question: scrubSecretsAndPII(payload.question).text,
      userCode: scrubSecretsAndPII(payload.userCode).text,
      onProgress: async (event, data) => {
        if (cancelled) throw new Error("Client cancelled code analysis");
        send(event, data);
      }
    });
    send("done", { response });
  } catch (err) {
    if (!cancelled) send("error", { code: err.code || "CODE_ENGINE_ERROR", message: err.message });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

/**
 * POST /api/code/debug - Pinpoint bug in user code + minimal read-only diff
 */
app.post("/api/code/debug", async (req, res) => {
  const span = startSpan("code.debug", { language: req.body?.language });
  try {
    const parseResult = CodeDebugRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      span.end("validation_error");
      return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
    }
    const payload = parseResult.data;
    const result = await debugUserCode({
      ...payload,
      question: scrubSecretsAndPII(payload.question).text,
      userCode: scrubSecretsAndPII(payload.userCode).text
    });
    span.end("ok");
    res.json(result);
  } catch (err) {
    span.end("error");
    if (err instanceof AIError || (err.code && err.code.startsWith("AI_"))) {
      return res.status(err.status || 503).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: "Code debug failed", message: err.message });
  }
});

/**
 * POST /api/code/hint - 4-level pedagogical hint ladder
 */
app.post("/api/code/hint", async (req, res) => {
  const span = startSpan("code.hint", { level: req.body?.level });
  try {
    const parseResult = CodeHintRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      span.end("validation_error");
      return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
    }
    const payload = parseResult.data;
    const result = await generateCodingHint({
      ...payload,
      question: scrubSecretsAndPII(payload.question).text,
      userCode: scrubSecretsAndPII(payload.userCode).text
    });
    span.end("ok");
    res.json(result);
  } catch (err) {
    span.end("error");
    if (err instanceof AIError || (err.code && err.code.startsWith("AI_"))) {
      return res.status(err.status || 503).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: "Hint generation failed", message: err.message });
  }
});

/**
 * POST /api/code/explain - Multi-level code explanation (Simple / Technical / Interview)
 */
app.post("/api/code/explain", async (req, res) => {
  const span = startSpan("code.explain", { explanationLevel: req.body?.explanationLevel });
  try {
    const parseResult = CodeExplainRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      span.end("validation_error");
      return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
    }
    const { question, code, language, explanationLevel } = parseResult.data;
    const staticCheck = runStaticCodeAnalysis(code, language);
    const parsed = await defaultAIClient.generateJson({
      systemPrompt:
        "Explain the supplied code clearly at the requested depth (Simple: intuitive analogy; Technical: invariants & data structures; Interview: optimality, trade-offs, follow-ups). " +
        "Return JSON: {\"summary\":\"...\",\"walkthrough\":[\"...\"],\"edgeCases\":[\"...\"],\"timeComplexity\":\"...\",\"spaceComplexity\":\"...\"}",
      userPrompt: `Question:\n${scrubSecretsAndPII(question).text}\nLanguage: ${language}\nLevel: ${explanationLevel}\nCode:\n${scrubSecretsAndPII(code).text}`,
      temperature: 0.1
    });
    span.end("ok");
    res.json({
      language: staticCheck.language,
      explanationLevel,
      summary: parsed?.summary || "Walkthrough of the submitted implementation.",
      walkthrough: Array.isArray(parsed?.walkthrough) ? parsed.walkthrough : [],
      edgeCases: Array.isArray(parsed?.edgeCases) ? parsed.edgeCases : [],
      staticAnalysis: staticCheck
    });
  } catch (err) {
    span.end("error");
    if (err instanceof AIError || (err.code && err.code.startsWith("AI_"))) {
      return res.status(err.status || 503).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: "Code explanation failed", message: err.message });
  }
});

/**
 * POST /api/code/complexity - Static + empirical sandbox complexity analysis
 */
app.post("/api/code/complexity", async (req, res) => {
  const span = startSpan("code.complexity");
  try {
    const parseResult = CodeComplexityRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      span.end("validation_error");
      return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
    }
    const { code, language, measureEmpirical } = parseResult.data;
    const result = await estimateComplexity({ code, language, measureEmpirical });
    span.end("ok");
    res.json(result);
  } catch (err) {
    span.end("error");
    res.status(500).json({ error: "Complexity estimation failed", message: err.message });
  }
});

/**
 * POST /api/code/run-samples - Visible user-triggered sample test runner
 */
app.post("/api/code/run-samples", async (req, res) => {
  const span = startSpan("code.run_samples", { language: req.body?.language });
  try {
    const parseResult = CodeRunSamplesRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      span.end("validation_error");
      return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
    }
    const payload = parseResult.data;
    const result = await runUserCodeOnSamples({
      userCode: scrubSecretsAndPII(payload.userCode).text,
      language: payload.language,
      sampleTests: payload.sampleTests,
      userId: localUserId(req) || "anon"
    });
    span.end("ok", { executed: result.executed, passedTests: result.passedTests });
    res.json(result);
  } catch (err) {
    span.end("error");
    res.status(500).json({ error: "Sample test execution failed", message: err.message });
  }
});

/**
 * POST /api/code/review - Readability, naming, edge cases, complexity & linter review
 */
app.post("/api/code/review", async (req, res) => {
  const span = startSpan("code.review", { language: req.body?.language });
  try {
    const parseResult = CodeReviewRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      span.end("validation_error");
      return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
    }
    const payload = parseResult.data;
    const result = await reviewUserCode({
      question: scrubSecretsAndPII(payload.question).text,
      code: scrubSecretsAndPII(payload.code).text,
      language: payload.language
    });
    span.end("ok");
    res.json(result);
  } catch (err) {
    span.end("error");
    if (err instanceof AIError || (err.code && err.code.startsWith("AI_"))) {
      return res.status(err.status || 503).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: "Code review failed", message: err.message });
  }
});

/**
 * POST /api/code/translate - Translate solution to another language and re-run sample tests
 */
app.post("/api/code/translate", async (req, res) => {
  const span = startSpan("code.translate", { targetLanguage: req.body?.targetLanguage });
  try {
    const parseResult = CodeTranslateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      span.end("validation_error");
      return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
    }
    const payload = parseResult.data;
    const result = await translateSolutionCode({
      question: scrubSecretsAndPII(payload.question).text,
      sourceCode: scrubSecretsAndPII(payload.sourceCode).text,
      sourceLanguage: payload.sourceLanguage,
      targetLanguage: payload.targetLanguage,
      sampleTests: payload.sampleTests,
      userId: localUserId(req) || "anon"
    });
    span.end("ok");
    res.json(result);
  } catch (err) {
    span.end("error");
    if (err instanceof AIError || (err.code && err.code.startsWith("AI_"))) {
      return res.status(err.status || 503).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: "Code translation failed", message: err.message });
  }
});

/**
 * POST /api/code/explain-error - Plain-English explanation of compiler or runtime errors
 */
app.post("/api/code/explain-error", async (req, res) => {
  const span = startSpan("code.explain_error", { language: req.body?.language });
  try {
    const parseResult = CodeExplainErrorRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      span.end("validation_error");
      return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
    }
    const payload = parseResult.data;
    const result = await explainCompilerOrRuntimeError({
      code: scrubSecretsAndPII(payload.code).text,
      language: payload.language,
      errorOutput: scrubSecretsAndPII(payload.errorOutput).text
    });
    span.end("ok");
    res.json(result);
  } catch (err) {
    span.end("error");
    if (err instanceof AIError || (err.code && err.code.startsWith("AI_"))) {
      return res.status(err.status || 503).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: "Error explanation failed", message: err.message });
  }
});

/**
 * POST /api/code/ast - Direct Tree-sitter WASM AST inspection
 */
app.post("/api/code/ast", async (req, res) => {
  try {
    const parseResult = CodeAstRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
    }
    const { code, language } = parseResult.data;
    const ast = await analyzeAstWithTreeSitter(code, language);
    res.json(ast);
  } catch (err) {
    res.status(500).json({ error: "AST analysis failed", message: err.message });
  }
});

/**
 * POST /api/vision/extract - User-triggered OCR + Vision extraction for captured region
 * Images are processed strictly in memory and never stored or logged.
 */
app.post("/api/vision/extract", async (req, res) => {
  const span = startSpan("vision.extract", { mimeType: req.body?.mimeType || "auto" });
  try {
    const parseResult = VisionExtractRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      span.end("validation_error");
      return res.status(400).json({ error: "Validation Error", details: formatZodErrors(parseResult.error) });
    }
    const { imageDataUrl, mimeType, hintContext } = parseResult.data;
    const result = await extractFromVisionRegion({
      imageDataUrl,
      mimeType,
      hintContext: scrubSecretsAndPII(hintContext).text
    });
    span.end("ok", {
      ocrConfidence: result.ocrConfidence,
      requiresUserConfirmation: result.requiresUserConfirmation,
      ocrEngine: result.ocrEngine
    });
    res.json(result);
  } catch (err) {
    span.end("error", { code: err?.code || "VISION_ERROR" });
    if (err instanceof VisionValidationError || err instanceof AIError || (err?.code && (err.code.startsWith("VISION_") || err.code.startsWith("AI_")))) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: "Vision extraction failed", message: err.message });
  }
});

/**
 * GET /api/traces - Localhost-only redacted trace viewer
 */
app.get("/api/traces", (req, res) => {
  if (!isLocalhostRequest(req)) {
    return res.status(403).json({
      error: "Trace viewer is restricted to localhost only.",
      code: "TRACE_VIEWER_LOCALHOST_ONLY"
    });
  }
  res.json({
    semanticCacheEnabled: isSemanticCacheEnabled(),
    otlpExporterConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
    langfuseExporterConfigured: Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY),
    redactedByDefault: process.env.OTEL_REDACT_CODE_AND_QUESTIONS !== "false",
    spans: getRecentSpans(50)
  });
});

// Start Server (skip when running under node --test or NODE_ENV=test)
if (!isTestRun) {
  app.listen(port, host, () => {
    logger.info(`ExamAssist AI Server running on port ${port}`, { port });
    console.log(`ExamAssist AI Server active on http://localhost:${port}`);
  });
}

// Graceful flush on process termination
if (!isTestRun) {
  const onShutdown = async () => {
    try {
      await flushLangfuse();
    } catch {}
    process.exit(0);
  };
  process.once("SIGTERM", onShutdown);
  process.once("SIGINT", onShutdown);
}

export default app;
