import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import app from "../server.js";
import { buildUserMessage } from "../pipeline/buildUserMessage.js";
import { AssessmentResponseSchema } from "../schemas.js";

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

    const res = {
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
      end() {
        resolve({ status: statusCode, body: resBody });
      }
    };

    app.handle(req, res, (err) => {
      if (err) resolve({ status: 500, error: err.message });
      else resolve({ status: 404 });
    });
  });
}

test("buildUserMessage: formats question, options, type, subject, and evidence", () => {
  const msg = buildUserMessage({
    question: "What is the time complexity of binary search?",
    options: ["O(n)", "O(log n)", "O(n^2)", "O(1)"],
    type: "MCQ",
    subject: "Data Structures",
    sources: [
      { title: "Binary Search Analysis", url: "https://example.edu/algo", snippet: "Binary search runs in O(log n)." }
    ]
  });

  assert.ok(msg.includes("QUESTION:\nWhat is the time complexity of binary search?"));
  assert.ok(msg.includes("A. O(n)"));
  assert.ok(msg.includes("B. O(log n)"));
  assert.ok(msg.includes("TYPE: MCQ   SUBJECT: Data Structures"));
  assert.ok(msg.includes("EVIDENCE:\n[1] Binary Search Analysis - https://example.edu/algo\nBinary search runs in O(log n)."));
});

test("buildUserMessage: handles object options and prevents [object Object]", () => {
  const msg = buildUserMessage({
    question: "Which keyword defines a class?",
    options: [{ text: "class" }, { text: "def" }],
    type: "CODING",
    subject: "Python"
  });

  assert.ok(!msg.includes("[object Object]"));
  assert.ok(msg.includes("A. class"));
  assert.ok(msg.includes("B. def"));
});

test("buildUserMessage: throws EMPTY_QUESTION if question is under 5 characters", () => {
  assert.throws(() => {
    buildUserMessage({ question: "Hi" });
  }, /EMPTY_QUESTION/);
});

test("Academic Solver: POST /api/assessment/analyze returns 400 for empty question", async () => {
  const res = await dispatchRequest(app, {
    method: "POST",
    url: "/api/assessment/analyze",
    body: { question: "   " }
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, "No question detected");
});

import { setupStandardMocks, teardownStandardMocks } from "./test-helpers.js";

test("Academic Solver: Binary Search test case returns Option B. O(log n) with full schema", async () => {
  setupStandardMocks({
    option: "B",
    text: "O(log n)",
    directAnswer: { option: "B", text: "O(log n)" },
    ownSolution: "O(log n)",
    optionAnalysis: [
      { option: "A", text: "O(n)", correct: false, isCorrect: false, reason: "Linear search complexity" },
      { option: "B", text: "O(log n)", correct: true, isCorrect: true, reason: "Binary search repeatedly halves interval" },
      { option: "C", text: "O(n^2)", correct: false, isCorrect: false, reason: "Quadratic complexity" },
      { option: "D", text: "O(1)", correct: false, isCorrect: false, reason: "Constant complexity only for single lookup" }
    ]
  });

  try {
    const res = await dispatchRequest(app, {
      method: "POST",
      url: "/api/assessment/analyze",
      body: {
        question: "What is the time complexity of binary search?",
        options: ["O(n)", "O(log n)", "O(n^2)", "O(1)"],
        type: "MCQ",
        subject: "Data Structures"
      }
    });

    assert.equal(res.status, 200);
  const data = res.body;

  // Verify direct answer identifies Option B: O(log n)
  if (typeof data.directAnswer === "object") {
    assert.equal(data.directAnswer.option, "B");
    assert.equal(data.directAnswer.text, "O(log n)");
  } else {
    assert.ok(data.directAnswer.includes("O(log n)"));
  }

  // Verify Academic Problem Solver fields
  assert.ok(data.questionRestated, "Must include questionRestated");
  assert.ok(data.ownSolution, "Must include ownSolution derived before reading evidence");
  assert.equal(data.ownSolution, "O(log n)");
  assert.ok(Array.isArray(data.optionAnalysis), "Must include optionAnalysis");
  assert.equal(data.optionAnalysis.length, 4);

  // Check Option B is marked correct and others are marked false
  const optB = data.optionAnalysis.find(o => o.option === "B");
  assert.ok(optB);
  assert.equal(optB.correct || optB.isCorrect, true);

  const optA = data.optionAnalysis.find(o => o.option === "A");
  assert.ok(optA);
  assert.equal(optA.correct || optA.isCorrect, false);

  assert.equal(data.confidence, "HIGH");
  assert.ok(data.confidenceReason);

  // Verify conformance to AssessmentResponseSchema
  const parseResult = AssessmentResponseSchema.safeParse(data);
  assert.equal(parseResult.success, true);
  } finally {
    teardownStandardMocks();
  }
});
