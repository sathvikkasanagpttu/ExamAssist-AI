/**
 * Phase 5 Unit & Integration Tests: OpenTelemetry Observability, CI Workflow & Coding Eval
 * Tests:
 * 1. OpenTelemetry spans for stages and tool calls, default code/question redaction, OTLP & Langfuse exporters
 * 2. Localhost-only trace viewer (GET /api/traces allows 127.0.0.1, rejects remote IPs with 403)
 * 3. GitHub Actions workflow (.github/workflows/ci.yml) includes lint, typecheck, unit, adapter, eval:smoke, Playwright e2e, and pack
 * 4. Coding Eval metrics, 6 ablations, LLM judge labeling, and Red-Team containment suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

import {
  startSpan,
  startToolSpan,
  redactSpanAttributes,
  buildOtlpSpanPayload,
  buildLangfuseSpanPayload,
  isLocalhostRequest
} from "../pipeline/observabilityAndSafety.js";
import {
  CODING_ABLATION_CONFIGS,
  loadCodingDataset,
  runCodingAblation,
  evaluateHintUsefulnessAsJudge,
  runCodingRedTeamSuite
} from "../eval/code-runner.mjs";
import app from "../server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function dispatchRequest(expressApp, { method, url, remoteAddress = "127.0.0.1", headers: requestHeaders = {} }) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { host: remoteAddress === "127.0.0.1" ? "localhost:8787" : "example.com", ...requestHeaders };
    req.socket = { remoteAddress };
    req.connection = req.socket;
    req.body = {};
    req._body = true;

    let statusCode = 200;
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
        resolve({ status: statusCode, body: data });
      }
    };

    expressApp.handle(req, res, (err) => {
      if (err) resolve({ status: 500, error: err.message });
      else resolve({ status: 404 });
    });
  });
}

test("Phase 5.1: OpenTelemetry stage & tool spans redact code and question text by default and build OTLP + Langfuse payloads", () => {
  const stageSpan = startSpan("code.analyze", {
    language: "python",
    question: "Write a function to compute shortest path in a weighted DAG.",
    userCode: "def solve(n, edges):\n    return 0",
    apiKeyNote: "sk-1234567890abcdefghijklmnop"
  });
  const toolSpan = startToolSpan(
    "run_code",
    {
      language: "python",
      code: "print('secret code')",
      stdin: "5\n1 2 3 4 5"
    },
    stageSpan
  );

  const toolRecord = toolSpan.end("ok", { executed: true });
  const stageRecord = stageSpan.end("ok", { passedTests: 3 });

  // Verify W3C traceId (32 hex) and spanId (16 hex) and parent linkage
  assert.equal(stageRecord.traceId.length, 32);
  assert.equal(stageRecord.spanId.length, 16);
  assert.equal(toolRecord.traceId, stageRecord.traceId);
  assert.equal(toolRecord.parentSpanId, stageRecord.spanId);
  assert.equal(toolRecord.kind, "TOOL");

  // Verify default redaction of code, question, and stdin
  assert.equal(stageRecord.redactedByDefault, true);
  assert.match(stageRecord.attributes.question, /^\[REDACTED_CONTENT len=\d+ sha256=[0-9a-f]{8}\]$/);
  assert.match(stageRecord.attributes.userCode, /^\[REDACTED_CONTENT len=\d+ sha256=[0-9a-f]{8}\]$/);
  assert.match(stageRecord.attributes.apiKeyNote, /\[REDACTED_API_KEY\]/);
  assert.match(toolRecord.attributes.code, /^\[REDACTED_CONTENT len=\d+ sha256=[0-9a-f]{8}\]$/);
  assert.match(toolRecord.attributes.stdin, /^\[REDACTED_CONTENT len=\d+ sha256=[0-9a-f]{8}\]$/);
  assert.equal(stageRecord.attributes.language, "python");

  // Verify OTLP and Langfuse exporter structures
  const otlp = buildOtlpSpanPayload(stageRecord);
  assert.equal(otlp.resourceSpans[0].scopeSpans[0].spans[0].traceId, stageRecord.traceId);
  assert.equal(otlp.resourceSpans[0].scopeSpans[0].spans[0].name, "code.analyze");

  const lf = buildLangfuseSpanPayload(toolRecord);
  assert.equal(lf.batch[0].type, "span-create");
  assert.equal(lf.batch[0].body.traceId, stageRecord.traceId);
  assert.equal(lf.batch[0].body.parentObservationId, stageRecord.spanId);

  // Verify redactSpanAttributes can also be called directly
  const redacted = redactSpanAttributes({ code: "int main() {}", safeMetric: 42 }, true);
  assert.match(redacted.code, /^\[REDACTED_CONTENT/);
  assert.equal(redacted.safeMetric, 42);
});

test("Phase 5.2: Localhost-only trace viewer allows 127.0.0.1 and rejects non-localhost requests with 403", async () => {
  assert.equal(isLocalhostRequest({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(isLocalhostRequest({ socket: { remoteAddress: "::1" } }), true);
  assert.equal(isLocalhostRequest({ socket: { remoteAddress: "203.0.113.42" }, headers: { host: "example.com" } }), false);

  const localRes = await dispatchRequest(app, {
    method: "GET",
    url: "/api/traces",
    remoteAddress: "127.0.0.1"
  });
  assert.equal(localRes.status, 200);
  assert.equal(localRes.body.redactedByDefault, true);
  assert.ok(Array.isArray(localRes.body.spans));

  const remoteRes = await dispatchRequest(app, {
    method: "GET",
    url: "/api/traces",
    remoteAddress: "198.51.100.77"
  });
  assert.equal(remoteRes.status, 403);
  assert.equal(remoteRes.body.code, "TRACE_VIEWER_LOCALHOST_ONLY");
});

test("Phase 5.3: GitHub Actions workflow (.github/workflows/ci.yml) enforces full quality gate", () => {
  const ciPath = path.resolve(__dirname, "../../.github/workflows/ci.yml");
  assert.equal(fs.existsSync(ciPath), true, ".github/workflows/ci.yml must exist");
  const ciYaml = fs.readFileSync(ciPath, "utf8");
  assert.match(ciYaml, /npm run lint/);
  assert.match(ciYaml, /npm run typecheck/);
  assert.match(ciYaml, /npm test/);
  assert.match(ciYaml, /npm run eval:smoke/);
  assert.match(ciYaml, /npm run test:e2e/);
  assert.match(ciYaml, /npm run pack/);
});

test("Phase 5.4: Coding Eval computes all required metrics, 6 ablations, judge label, and Red-Team containment", async () => {
  const { scoredRows } = loadCodingDataset({ limit: 6 });
  assert.equal(scoredRows.length, 6);

  // Verify all 6 ablation configs exist
  assert.deepEqual(Object.keys(CODING_ABLATION_CONFIGS), [
    "1_single_call",
    "2_plus_tests",
    "3_plus_repair",
    "4_plus_diff_property",
    "5_plus_agent",
    "6_plus_docs_rag"
  ]);

  const singleRes = await runCodingAblation("1_single_call", scoredRows);
  const fullRes = await runCodingAblation("6_plus_docs_rag", scoredRows);

  // Verify repair improves or matches pass rate over single_call
  assert.ok(fullRes.passWithRepair >= singleRes.passAt1);
  assert.equal(typeof fullRes.passAt1, "number");
  assert.equal(typeof fullRes.passWithRepair, "number");
  assert.equal(typeof fullRes.hiddenTestPassRate, "number");
  assert.equal(typeof fullRes.falsePassRate, "number");
  assert.equal(typeof fullRes.compileErrorRate, "number");
  assert.equal(typeof fullRes.timeoutRate, "number");
  assert.equal(typeof fullRes.testStrengthMutationScore, "number");
  assert.equal(typeof fullRes.complexityAgreementRate, "number");
  assert.equal(fullRes.hintUsefulnessJudge.labeledAsJudge, true);
  assert.match(fullRes.hintUsefulnessJudge.judgeLabel, /Judge/);
  assert.ok(fullRes.latencyP50Ms >= 0);
  assert.ok(fullRes.latencyP95Ms >= fullRes.latencyP50Ms);
  assert.ok(fullRes.estimatedCostUsd > 0);

  // Verify evaluateHintUsefulnessAsJudge penalizes code leaks and labels itself as a judge
  const goodJudge = evaluateHintUsefulnessAsJudge(
    "Use a monotonic deque to maintain the sliding window maximum in O(n) time complexity."
  );
  const leakJudge = evaluateHintUsefulnessAsJudge("```python\ndef solve(): pass\n```");
  assert.equal(goodJudge.labeledAsJudge, true);
  assert.ok(goodJudge.score > leakJudge.score);

  // Verify Red-Team suite passes all ambiguous, prompt-injection, and malicious code containment checks
  const redTeam = await runCodingRedTeamSuite();
  assert.equal(redTeam.allPassed, true);
  assert.ok(redTeam.totalCases >= 7);
});
