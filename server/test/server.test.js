import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import app from "../server.js";

// In-memory request dispatcher for Express without needing TCP socket permissions
function dispatchRequest(app, { method, url, body }) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { "content-type": "application/json" };
    req.socket = { remoteAddress: "127.0.0.1" };
    req.connection = req.socket;
    req.body = body || {};

    const resEvents = new EventEmitter();
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

test("GET /health returns pipeline status", async () => {
  const response = await dispatchRequest(app, { method: "GET", url: "/health" });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.ok(Array.isArray(response.body.pipelineSteps));
  assert.ok(response.body.pipelineSteps.length >= 8);
});

test("POST /api/analyze extracts question structure", async () => {
  const response = await dispatchRequest(app, {
    method: "POST",
    url: "/api/analyze",
    body: {
      question: "Which organelle carries out cellular respiration?\nA) Nucleus\nB) Mitochondria\nC) Ribosome\nD) Golgi body"
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.isMCQ, true);
  assert.equal(response.body.subject, "Biology");
  assert.equal(response.body.options.length, 4);
});

test("POST /api/answer runs full 11-step pipeline and returns structured answer", async () => {
  const response = await dispatchRequest(app, {
    method: "POST",
    url: "/api/answer",
    body: {
      question: "Explain the Heisenberg Uncertainty Principle in quantum mechanics."
    }
  });
  assert.equal(response.status, 200);
  const data = response.body;

  assert.ok(data.answer, "Should have answer text");
  assert.ok(data.directAnswer, "Should have direct answer");
  assert.ok(data.explanation, "Should have explanation");
  assert.ok(Array.isArray(data.keyPoints), "Should have key points");
  assert.ok(["HIGH", "MEDIUM", "LOW", "UNVERIFIED", "CONFLICTING"].includes(data.evidenceLevel));
  assert.ok(Array.isArray(data.sources), "Should have sources list");
  assert.ok(Array.isArray(data.pipelineLog), "Should have pipeline execution log");
});
