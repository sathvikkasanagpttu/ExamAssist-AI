import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import app from "../server.js";
import { AssessmentResponseSchema } from "../schemas.js";
import { setupStandardMocks, teardownStandardMocks } from "./test-helpers.js";

beforeEach(() => {
  setupStandardMocks();
});

afterEach(() => {
  teardownStandardMocks();
});

function dispatchRequest(app, { method, url, body }) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { "content-type": "application/json" };
    req.socket = { remoteAddress: "127.0.0.1" };
    req.connection = req.socket;
    req.body = body || {};

    let statusCode = 200;
    let resBody = null;
    const headers = {};

    const res = Object.assign(new EventEmitter(), {
      writableEnded: false,
      status(code) {
        statusCode = code;
        return this;
      },
      setHeader(k, v) {
        headers[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return headers[k.toLowerCase()] || "";
      },
      json(data) {
        resBody = data;
        resolve({ status: statusCode, body: resBody });
      },
      send(data) {
        resBody = data;
        resolve({ status: statusCode, body: resBody });
      },
      write(data) {
        resBody = `${resBody || ""}${data}`;
      },
      end() {
        this.writableEnded = true;
        resolve({ status: statusCode, body: resBody });
      }
    });

    app.handle(req, res, (err) => {
      if (err) resolve({ status: 500, error: err.message });
      else resolve({ status: 404 });
    });
  });
}

test("API: GET /api/health returns 200 and system status", async () => {
  const res = await dispatchRequest(app, { method: "GET", url: "/api/health" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.version, "2.2.0");
  assert.ok(res.body.service.includes("ExamAssist"));
});

test("API: GET /api/config and /api/health report synchronized version 2.2.0", async () => {
  const healthRes = await dispatchRequest(app, { method: "GET", url: "/api/health" });
  const configRes = await dispatchRequest(app, { method: "GET", url: "/api/config" });
  assert.equal(healthRes.status, 200);
  assert.equal(configRes.status, 200);
  assert.equal(healthRes.body.version, "2.2.0");
  assert.equal(configRes.body.version, "2.2.0");
  assert.equal(healthRes.body.version, configRes.body.version);
});

test("API: streaming analysis emits ordered progress and a terminal done event", async () => {
  const res = await dispatchRequest(app, {
    method: "POST",
    url: "/api/assessment/analyze/stream",
    body: {
      question: "Which organelle produces ATP?",
      options: ["A) Ribosome", "B) Mitochondria", "C) Golgi"]
    }
  });
  assert.equal(res.status, 200);
  const events = [...String(res.body).matchAll(/^event: (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(events, ["classified", "searching", "retrieved", "solving", "verifying", "done"]);
  assert.match(res.body, /"response"/);
});

test("API: GET /api/config returns supported question types and modes", async () => {
  const res = await dispatchRequest(app, { method: "GET", url: "/api/config" });
  assert.equal(res.status, 200);
  assert.equal(res.body.version, "2.2.0");
  assert.ok(Array.isArray(res.body.supportedQuestionTypes));
  assert.ok(res.body.supportedQuestionTypes.includes("MCQ"));
  assert.ok(res.body.supportedQuestionTypes.includes("SQL"));
  assert.ok(res.body.modes.includes("Practice Mode"));
  assert.ok(res.body.modes.includes("Authorized Assessment Mode"));
});

test("API: POST /api/question/classify validates input and returns classification", async () => {
  // Valid request
  const validRes = await dispatchRequest(app, {
    method: "POST",
    url: "/api/question/classify",
    body: {
      question: "Which organelle produces ATP?\nA) Ribosome\nB) Mitochondria\nC) Lysosome\nD) Golgi",
      options: ["A) Ribosome", "B) Mitochondria", "C) Lysosome", "D) Golgi"]
    }
  });
  assert.equal(validRes.status, 200);
  assert.equal(validRes.body.questionType, "MCQ");
  assert.equal(validRes.body.subject, "Biology");

  // Invalid request (question too short)
  const invalidRes = await dispatchRequest(app, {
    method: "POST",
    url: "/api/question/classify",
    body: { question: "hi" }
  });
  assert.equal(invalidRes.status, 400);
  assert.ok(invalidRes.body.error);
});

test("API: POST /api/search returns ranked sources", async () => {
  const res = await dispatchRequest(app, {
    method: "POST",
    url: "/api/search",
    body: {
      queries: ["mitochondria cellular respiration ATP synthase", "mitochondria structure function"]
    }
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.sources));
  assert.ok(res.body.sources.length > 0);
  assert.ok(res.body.sources[0].url);
  assert.ok(["HIGH", "MEDIUM", "LOW", "UNASSESSED"].includes(res.body.sources[0].authorityTier));
});

test("API: POST /api/evidence/verify returns claim verification", async () => {
  const res = await dispatchRequest(app, {
    method: "POST",
    url: "/api/evidence/verify",
    body: {
      question: "What produces ATP in eukaryotes?",
      draftAnswer: "Mitochondria produce ATP through oxidative phosphorylation.",
      sources: [
        { title: "NCBI Cellular Respiration", url: "https://ncbi.nlm.nih.gov/respiration", snippet: "ATP is produced in mitochondria via oxidative phosphorylation." }
      ]
    }
  });
  assert.equal(res.status, 200);
  assert.ok(["SUPPORTED", "PARTIALLY_SUPPORTED", "UNVERIFIED"].includes(res.body.status));
  assert.ok(Array.isArray(res.body.supported));
});

test("API: POST /api/answer/generate returns reasoned answer and reasoning steps", async () => {
  const res = await dispatchRequest(app, {
    method: "POST",
    url: "/api/answer/generate",
    body: {
      question: "Calculate the integral of 2x dx from 0 to 3.",
      questionType: "NUMERICAL",
      subject: "Mathematics",
      sources: []
    }
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.directAnswer);
  assert.ok(Array.isArray(res.body.reasoningSteps));
});

test("API: POST /api/assessment/analyze returns response strictly conforming to schema", async () => {
  const res = await dispatchRequest(app, {
    method: "POST",
    url: "/api/assessment/analyze",
    body: {
      question: "Which of the following describes the function of mitochondria?\nA) Protein packaging\nB) ATP production through cellular respiration\nC) Lipid digestion\nD) Cell division control",
      options: [
        "A) Protein packaging",
        "B) ATP production through cellular respiration",
        "C) Lipid digestion",
        "D) Cell division control"
      ],
      mode: "Practice Mode"
    }
  });

  assert.equal(res.status, 200);
  const data = res.body;

  // Validate strictly with Zod schema
  const parsed = AssessmentResponseSchema.safeParse(data);
  assert.equal(parsed.success, true, `Response should strictly match AssessmentResponseSchema: ${JSON.stringify(parsed.error?.errors)}`);

  assert.equal(data.questionType, "MCQ");
  assert.equal(data.subject, "Biology");
  assert.ok(data.directAnswer);
  assert.ok(["HIGH", "MEDIUM", "LOW", "UNVERIFIED"].includes(data.confidence));
  assert.ok(data.confidenceReason);
  assert.ok(Array.isArray(data.optionAnalysis));
  assert.ok(Array.isArray(data.reasoningSteps));
  assert.ok(Array.isArray(data.sources));
  assert.ok(data.retrievalTimestamp);
});

test("API: POST /api/graph/traverse extracts concepts and prerequisite DAG", async () => {
  const res = await dispatchRequest(app, {
    method: "POST",
    url: "/api/graph/traverse",
    body: {
      question: "Explain how Dijkstra's algorithm finds shortest paths in a weighted graph"
    }
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.ok(Array.isArray(res.body.matchedConcepts));
  assert.ok(res.body.matchedConcepts.some((c) => c.name.includes("Dijkstra")));
  assert.ok(Array.isArray(res.body.prerequisites));
  assert.ok(Array.isArray(res.body.pitfalls));
  assert.ok(typeof res.body.explanationContext === "string");
});

test("API: GET /api/graph/compare computes comparative delta metrics", async () => {
  const res = await dispatchRequest(app, {
    method: "GET",
    url: "/api/graph/compare?question=Explain+Bayes+Theorem"
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.ok(res.body.plainRag);
  assert.ok(res.body.graphRag);
  assert.ok(res.body.deltaBenefit);
  assert.ok(res.body.deltaBenefit.formulaVariablesGrounded > 0);
});

test("API: GET /api/demo/benchmarks returns 5 showcase benchmark cases", async () => {
  const res = await dispatchRequest(app, {
    method: "GET",
    url: "/api/demo/benchmarks"
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.ok(Array.isArray(res.body.benchmarks));
  assert.equal(res.body.benchmarks.length, 5);
  const ids = res.body.benchmarks.map((b) => b.id);
  assert.ok(ids.includes("bm_multimodal_vision"));
  assert.ok(ids.includes("bm_code_sandbox"));
  assert.ok(ids.includes("bm_math_deterministic"));
  assert.ok(ids.includes("bm_contradiction_detection"));
  assert.ok(ids.includes("bm_graph_rag"));
});
