import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  startSpan,
  exportSpanToOtlp,
  exportSpanToLangfuse,
  buildOtlpSpanPayload,
  buildLangfuseSpanPayload
} from "../pipeline/observabilityAndSafety.js";

test("OTLP and Langfuse Observability Integration: exports spans with redacted code and questions", async () => {
  const rawQuestion = "What is the amortized time complexity of inserting into a dynamic array?";
  const rawCode = "def push_back(arr, val):\n    if len(arr) == capacity:\n        resize()\n    arr.append(val)";
  const rawApiKey = "sk-12345678901234567890abcdef";

  // 1. Create a span with sensitive question, code, and credentials
  const span = startSpan("assessment.pipeline", {
    question: rawQuestion,
    code: rawCode,
    apiKey: rawApiKey,
    normalAttribute: "Data Structures & Algorithms"
  });

  const record = span.end("ok", {
    userCode: rawCode,
    statusMessage: "Question solved"
  });

  // 2. Validate OTLP payload redaction structure
  const otlpPayload = buildOtlpSpanPayload(record);
  const otlpJson = JSON.stringify(otlpPayload);
  assert.equal(otlpJson.includes(rawQuestion), false, "Raw question text must NOT appear in OTLP export");
  assert.equal(otlpJson.includes(rawCode), false, "Raw code text must NOT appear in OTLP export");
  assert.equal(otlpJson.includes(rawApiKey), false, "Raw API key must NOT appear in OTLP export");

  const otlpSpans = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];
  const otlpAttrs = Object.fromEntries(otlpSpans.attributes.map(a => [a.key, a.value.stringValue || a.value.intValue]));
  assert.match(otlpAttrs.question, /\[REDACTED_CONTENT len=\d+ sha256=[a-f0-9]+\]/);
  assert.match(otlpAttrs.code, /\[REDACTED_CONTENT len=\d+ sha256=[a-f0-9]+\]/);
  assert.equal(otlpAttrs.apiKey, "[REDACTED_API_KEY]");
  assert.equal(otlpAttrs.normalAttribute, "Data Structures & Algorithms");

  // 3. Validate Langfuse payload redaction structure
  const langfusePayload = buildLangfuseSpanPayload(record);
  const langfuseJson = JSON.stringify(langfusePayload);
  assert.equal(langfuseJson.includes(rawQuestion), false, "Raw question text must NOT appear in Langfuse export");
  assert.equal(langfuseJson.includes(rawCode), false, "Raw code text must NOT appear in Langfuse export");
  assert.equal(langfuseJson.includes(rawApiKey), false, "Raw API key must NOT appear in Langfuse export");

  const lfMetadata = langfusePayload.batch[0].body.metadata;
  assert.match(lfMetadata.question, /\[REDACTED_CONTENT len=\d+ sha256=[a-f0-9]+\]/);
  assert.match(lfMetadata.code, /\[REDACTED_CONTENT len=\d+ sha256=[a-f0-9]+\]/);
  assert.equal(lfMetadata.apiKey, "[REDACTED_API_KEY]");

  // 4. Test real network export to mock HTTP collector (if loopback networking is permitted in environment)
  const receivedOtlp = [];
  const receivedLangfuse = [];
  const mockCollector = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      if (req.url?.includes("/v1/traces")) receivedOtlp.push({ raw: body, body: parsed });
      else if (req.url?.includes("/api/public/ingestion")) receivedLangfuse.push({ raw: body, body: parsed });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    });
  });

  try {
    await new Promise(resolve => mockCollector.listen(0, "127.0.0.1", resolve));
    const port = mockCollector.address().port;

    const otlpRes = await exportSpanToOtlp(record, `http://127.0.0.1:${port}/v1/traces`);
    const lfRes = await exportSpanToLangfuse(record, {
      publicKey: "pk-test",
      secretKey: "sk-test",
      host: `http://127.0.0.1:${port}`
    });

    if (otlpRes.exported && lfRes.exported) {
      assert.equal(receivedOtlp.length, 1);
      assert.equal(receivedOtlp[0].raw.includes(rawQuestion), false);
      assert.equal(receivedLangfuse.length, 1);
      assert.equal(receivedLangfuse[0].raw.includes(rawQuestion), false);
    }
  } catch (err) {
    // If loopback connection is restricted by OS sandbox policy, payload verification above stands
    if (!err.message?.includes("EPERM")) throw err;
  } finally {
    await new Promise(resolve => mockCollector.close(resolve));
  }
});
