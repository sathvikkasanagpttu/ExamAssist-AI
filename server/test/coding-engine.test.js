import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import app from "../server.js";
import { setupStandardMocks, teardownStandardMocks } from "./test-helpers.js";
import {
  runStaticCodeAnalysis,
  computeMinimalCodeDiff,
  estimateComplexity,
  generateCodingHint
} from "../pipeline/codingEngine.js";
import {
  scrubSecretsAndPII,
  startSpan,
  getRecentSpans,
  computeProblemCacheKey,
  setVerifiedCachedResult,
  getVerifiedCachedResult
} from "../pipeline/observabilityAndSafety.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_DIR = path.resolve(__dirname, "../../extension");

// --- 1. Shared Schemas & Coding Dataset Validation ---
test("Coding Eval Dataset: code-dataset.jsonl has >= 150 multi-language problems with Java, C, >= 20 Advanced, hidden tests, and REVIEW.md tracking", () => {
  const datasetPath = path.resolve(__dirname, "../eval/code-dataset.jsonl");
  const reviewDocPath = path.resolve(__dirname, "../eval/REVIEW.md");
  assert.ok(fs.existsSync(datasetPath), "code-dataset.jsonl must exist");
  assert.ok(fs.existsSync(reviewDocPath), "REVIEW.md must exist");
  const reviewMarkdown = fs.readFileSync(reviewDocPath, "utf8");
  const lines = fs.readFileSync(datasetPath, "utf8").trim().split("\n");
  const rows = lines.map((line) => JSON.parse(line));
  const scoredRows = rows.filter((r) => !r.needsReview);
  const reviewRows = rows.filter((r) => r.needsReview);

  assert.ok(scoredRows.length >= 150, `Expected >= 150 scored problems, got ${scoredRows.length}`);

  const languages = new Set();
  const categories = new Set();
  const subTypes = new Set();
  let advancedCount = 0;

  for (const row of rows) {
    assert.ok(row.id, "Problem must have id");
    assert.ok(row.title, "Problem must have title");
    assert.ok(row.statement.length >= 10, "Problem must have statement");
    assert.ok(Array.isArray(row.sampleTests) && row.sampleTests.length >= 1, "Must have sampleTests");
    assert.ok(Array.isArray(row.hiddenTests) && row.hiddenTests.length >= 5, `Problem ${row.id} must have >= 5 hiddenTests`);
    if (row.needsReview) {
      assert.ok(reviewMarkdown.includes(row.id), `Problem ${row.id} with needsReview=true must be listed in REVIEW.md`);
    } else {
      languages.add(row.language);
      categories.add(row.category);
      subTypes.add(row.questionSubType);
      if (row.difficulty === "Advanced") advancedCount++;
    }
  }

  for (const requiredLang of ["python", "javascript", "cpp", "java", "c", "sql"]) {
    assert.ok(languages.has(requiredLang), `Expected language ${requiredLang} in scored dataset`);
  }
  assert.ok(advancedCount >= 20, `Expected >= 20 Advanced problems, got ${advancedCount}`);
  assert.ok(categories.has("arrays") && categories.has("strings") && categories.has("dp") && categories.has("graphs") && categories.has("sql"));
  assert.ok(subTypes.has("predict_the_output") && subTypes.has("debug_my_code"));
  assert.ok(reviewRows.length >= 1, "Uncertain items should be marked needsReview and listed in REVIEW.md");
});

// --- 2. Phase 1: EditorAdapters & ProblemAdapters Unit Tests ---
test("EditorAdapters & ProblemAdapters: extracts Monaco, CodeMirror 6, HackerRank, LeetCode, and GeeksforGeeks", () => {
  const sandbox = {
    window: {},
    document: {
      querySelector: (sel) => {
        if (sel.includes(".monaco-editor")) {
          return {
            getAttribute: (k) => (k === "data-mode-id" ? "python" : ""),
            closest: () => null,
            querySelectorAll: () => [{ innerText: "def solve(x):", textContent: "def solve(x):" }, { innerText: "    return x * 2", textContent: "    return x * 2" }],
            querySelector: () => ({ textContent: "2" })
          };
        }
        if (sel.includes(".challenge-view h1")) return { textContent: "Array Manipulation" };
        if (sel.includes(".challenge-body-html")) {
          return {
            innerText: "Given an array of N integers.\nConstraints:\n1 <= N <= 10^5\nSample Input:\n3\n1 2 3\nSample Output:\n6"
          };
        }
        return null;
      },
      querySelectorAll: () => []
    }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);

  const editorSrc = fs.readFileSync(path.join(EXTENSION_DIR, "extractors/EditorAdapters.js"), "utf8");
  const problemSrc = fs.readFileSync(path.join(EXTENSION_DIR, "extractors/ProblemAdapters.js"), "utf8");
  vm.runInContext(editorSrc, ctx);
  vm.runInContext(problemSrc, ctx);

  const editorState = sandbox.ExamAssist.EditorAdapters.extractEditorState(sandbox.document);
  assert.equal(editorState.adapter, "MonacoAdapter");
  assert.equal(editorState.language, "python");
  assert.ok(editorState.code.includes("def solve(x):"));
  assert.equal(editorState.cursorLine, 2);

  const problem = sandbox.ExamAssist.ProblemAdapters.extractCodingProblem(sandbox.document);
  assert.equal(problem.platform, "HackerRank");
  assert.equal(problem.title, "Array Manipulation");
  assert.ok(problem.constraints.includes("1 <= N <= 10^5"));
  assert.equal(problem.sampleTests.length, 1);
  assert.equal(problem.sampleTests[0].expectedOutput, "6");
});

// --- 3. Phase 2: Static Code Analysis, Complexity & Diff Engine ---
test("Coding Engine: static analysis detects nested loops, recursion, and estimates complexity", async () => {
  const nestedPy = `def pairs(arr):\n    ans = 0\n    for x in arr:\n        for y in arr:\n            ans += x * y\n    return ans`;
  const analysis = runStaticCodeAnalysis(nestedPy, "python");
  assert.equal(analysis.maxLoopDepth, 2);
  assert.equal(analysis.staticTimeComplexity, "O(n^2)");
  assert.equal(analysis.hasRecursion, false);

  const recPy = `def fib(n):\n    if n <= 1: return n\n    return fib(n-1) + fib(n-2)`;
  const recAnalysis = runStaticCodeAnalysis(recPy, "python");
  assert.equal(recAnalysis.hasRecursion, true);

  const comp = await estimateComplexity({ code: nestedPy, language: "python", measureEmpirical: false });
  assert.equal(comp.staticEstimate.timeComplexity, "O(n^2)");
  assert.equal(comp.empiricalEstimate.executed, false);

  const diff = computeMinimalCodeDiff("for i in range(n - 1):\n    s += a[i]", "for i in range(n):\n    s += a[i]");
  assert.ok(diff.includes("- for i in range(n - 1):"));
  assert.ok(diff.includes("+ for i in range(n):"));
});

// --- 4. Phase 4: PII/Secret Scrubber, Trace Spans & Opt-in Semantic Cache ---
test("Observability & Safety: scrubs API keys and emails, records spans, and keeps semantic cache off by default", () => {
  const dirty = "My key is sk-proj1234567890abcdefghij and email is student@university.edu and OPENAI_API_KEY=AQ.Ab8RN6IbrI_NRlXSYHzFq5ks5P7_PlnyfL7mZ0x3yFpKc";
  const scrubbed = scrubSecretsAndPII(dirty);
  assert.ok(!scrubbed.text.includes("sk-proj1234567890abcdefghij"));
  assert.ok(!scrubbed.text.includes("student@university.edu"));
  assert.ok(scrubbed.redactions.includes("OPENAI_KEY"));
  assert.ok(scrubbed.redactions.includes("EMAIL"));

  const span = startSpan("test.stage", { lang: "python" });
  const record = span.end("ok", { passed: true });
  assert.equal(record.stage, "test.stage");
  assert.ok(getRecentSpans(5).some((s) => s.spanId === record.spanId));

  const key = computeProblemCacheKey({ userId: "u1", question: "Sum two numbers", language: "python" });
  assert.equal(setVerifiedCachedResult(key, { confidence: "HIGH", status: "SUPPORTED" }), false, "Semantic cache must be OFF by default");
  assert.equal(getVerifiedCachedResult(key), null);
});

// --- 5. Phase 2 & 3 API Endpoints (/api/code/hint, /api/code/complexity, /api/traces) ---
test("API: /api/code/complexity and /api/traces return structured responses", async () => {
  setupStandardMocks();
  try {
    const { EventEmitter } = await import("node:events");
    const dispatch = (method, url, body = {}) =>
      new Promise((resolve) => {
        const req = new EventEmitter();
        req.method = method;
        req.url = url;
        req.headers = { "content-type": "application/json" };
        req.socket = { remoteAddress: "127.0.0.1" };
        req.connection = req.socket;
        req.body = body;
        const res = {
          statusCode: 200,
          status(c) { this.statusCode = c; return this; },
          setHeader() {},
          getHeader() { return ""; },
          json(d) { resolve({ status: this.statusCode, body: d }); },
          end() { resolve({ status: this.statusCode, body: null }); }
        };
        app.handle(req, res, () => resolve({ status: 404 }));
      });

    const compRes = await dispatch("POST", "/api/code/complexity", {
      code: "for i in range(n):\n    for j in range(n):\n        print(i, j)",
      language: "python",
      measureEmpirical: false
    });
    assert.equal(compRes.status, 200);
    assert.equal(compRes.body.staticEstimate.timeComplexity, "O(n^2)");

    const traceRes = await dispatch("GET", "/api/traces");
    assert.equal(traceRes.status, 200);
    assert.equal(traceRes.body.semanticCacheEnabled, false);
    assert.ok(Array.isArray(traceRes.body.spans));
  } finally {
    teardownStandardMocks();
  }
});

test("Coding Engine: generateCodingHint generates requested level lazily, retries once on invalid output, and throws typed AIError instead of canned hint", async () => {
  // 1. Lazy single-level response (Level 2 does not leak Level 4)
  const level2Res = await generateCodingHint({
    question: "Find two numbers that add up to target.",
    language: "python",
    level: 2,
    aiClient: {
      generateJson: async () => ({
        hint: "Use a hash map to store complement indices in a single pass.",
        conceptTags: ["hash-map", "arrays"]
      })
    }
  });
  assert.equal(level2Res.requestedLevel, 2);
  assert.equal(level2Res.activeHint, "Use a hash map to store complement indices in a single pass.");
  assert.deepEqual(Object.keys(level2Res.hints), ["level2"]);
  assert.equal(level2Res.hints.level4, undefined, "Must not include level 4 solution when level 2 is requested");

  // 2. Retries once on invalid model response and succeeds on retry
  let calls = 0;
  const retryRes = await generateCodingHint({
    question: "Find maximum subarray sum.",
    language: "python",
    level: 1,
    aiClient: {
      generateJson: async () => {
        calls++;
        if (calls === 1) return { invalid: true };
        return { hint: "Track the best sum ending at the current index.", conceptTags: ["dp"] };
      }
    }
  });
  assert.equal(calls, 2);
  assert.equal(retryRes.activeHint, "Track the best sum ending at the current index.");

  // 3. Throws typed AIError if still invalid after retry (never returns a canned hint)
  let failCalls = 0;
  await assert.rejects(
    () =>
      generateCodingHint({
        question: "Find shortest path.",
        language: "python",
        level: 3,
        aiClient: {
          generateJson: async () => {
            failCalls++;
            return { hint: "   " };
          }
        }
      }),
    (err) => {
      assert.equal(err.code, "AI_INVALID_HINT_RESPONSE");
      assert.equal(err.status, 502);
      return true;
    }
  );
  assert.equal(failCalls, 2);
});

