import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  AssessmentAnalyzeRequestSchema,
  QuestionClassifyRequestSchema,
  SearchRequestSchema,
  EvidenceVerifyRequestSchema,
  AnswerGenerateRequestSchema
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
import { sandboxHealth } from "./pipeline/sandboxClient.js";
import multer from "multer";
import {
  deleteDocument,
  ingestDocument,
  initializeKnowledgeBase,
  isValidLocalUserId,
  KnowledgeBaseError,
  listDocuments,
  ragEnabled,
  searchKnowledgeBase
} from "./kb/knowledgeBase.js";

const app = express();

// 1. CORS Configuration
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map(s => s.trim())
  : ["*"];

app.use(cors({
  origin: (origin, callback) => {
    const matchesAllowedOrigin = allowedOrigins.includes(origin) || allowedOrigins.some((rule) =>
      rule.endsWith("://*") && origin?.startsWith(rule.slice(0, -1))
    );
    if (!origin || allowedOrigins.includes("*") || matchesAllowedOrigin) {
      callback(null, true);
    } else {
      callback(new Error("CORS origin not allowed by policy"));
    }
  }
}));

// 2. Request body parser with strict size limits
app.use(express.json({ limit: "64kb" }));

// 3. Rate limiting middleware
app.use(createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120
}));

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const kbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Number(process.env.KB_MAX_UPLOAD_BYTES || 10 * 1024 * 1024), files: 1 } });
void initializeKnowledgeBase();

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
  res.json({
    status: "ok",
    service: "ExamAssist AI Assessment Copilot",
    version: "2.1.0",
    uptimeSeconds: Math.floor(process.uptime()),
    aiConfigured: defaultAIClient.isConfigured,
    ragEnabled: ragEnabled(),
    sandboxEnabled: await sandboxHealth(),
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
      cacheEnabled: true
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

/**
 * GET /api/config - Public configuration for extensions
 */
app.get("/api/config", (_req, res) => {
  res.json({
    version: "2.1.0",
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

// Start Server
if (process.env.NODE_ENV !== "test") {
  app.listen(port, host, () => {
    logger.info(`ExamAssist AI Server running on port ${port}`, { port });
    console.log(`ExamAssist AI Server active on http://localhost:${port}`);
  });
}

export default app;
