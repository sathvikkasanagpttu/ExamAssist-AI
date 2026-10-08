#!/usr/bin/env node
/**
 * ExamAssist AI - Evaluation Harness Runner
 * Usage:
 *   node eval/runner.mjs --config a_single_pass --limit 20
 *   node eval/runner.mjs --smoke --limit 10
 *   node eval/runner.mjs --config c_solve_tiebreak
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};
const hasFlag = (flag) => args.includes(flag);

const configName = getArg("--config") || "a_single_pass";
const limitArg = getArg("--limit");
const limit = limitArg ? parseInt(limitArg, 10) : Infinity;
const smokeMode = hasFlag("--smoke");
const maxCalls = Number.parseInt(process.env.EVAL_MAX_CALLS || "200", 10);
const concurrency = Math.max(1, Number.parseInt(process.env.EVAL_CONCURRENCY || "3", 10));

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const datasetPath = path.join(__dirname, "dataset.jsonl");
const configsDir = path.join(__dirname, "configs");
const resultsDir = path.join(__dirname, "results");
const cacheDir = path.join(__dirname, "cache");

for (const d of [resultsDir, cacheDir]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ---------------------------------------------------------------------------
// Load config
// ---------------------------------------------------------------------------
const cfgPath = path.join(configsDir, `${configName}.json`);
if (!existsSync(cfgPath)) throw new Error(`Unknown evaluation config: ${configName}`);
const config = JSON.parse(readFileSync(cfgPath, "utf8"));

// ---------------------------------------------------------------------------
// Load dataset
// ---------------------------------------------------------------------------
const dataset = readFileSync(datasetPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      console.warn(`[eval] Skipping malformed JSONL line ${i + 1}`);
      return null;
    }
  })
  .filter(Boolean);

const questions = dataset.slice(0, Number.isFinite(limit) ? limit : dataset.length);
const requiredFields = ["id", "subject", "type", "question", "options", "answer", "difficulty", "source", "notes"];
for (const [index, question] of dataset.entries()) {
  const missing = requiredFields.filter((field) => !(field in question));
  if (missing.length) throw new Error(`Dataset line ${index + 1} missing: ${missing.join(", ")}`);
}
console.log(`[eval] Loaded ${questions.length} questions from dataset (total ${dataset.length})`);

// ---------------------------------------------------------------------------
// Setup pipeline imports
// ---------------------------------------------------------------------------

// Load env only when not in smoke mode (smoke uses mock)
if (!smokeMode) {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(serverRoot, ".env") });
}

const { processAssessmentQuestion } = await import(
  path.join(serverRoot, "pipeline", "assessmentOrchestrator.js")
);
const { defaultAIClient } = await import(path.join(serverRoot, "aiClient.js"));

// In smoke mode, inject mock AI client + mock search
let aiClientOverride = undefined;
if (smokeMode) {
  const { setMockSearchHandler } = await import(path.join(serverRoot, "pipeline", "search.js"));

  // Deterministic mock: always returns the first option
  defaultAIClient.mockHandler = async ({ systemPrompt, userPrompt }) => {
    const sp = String(systemPrompt || "");
    const up = String(userPrompt || "");

    if (sp.includes("contradiction-detection") || up.includes("CONTRADICTION")) {
      return JSON.stringify({ status: "AGREEMENT", agreement: [], conflicts: [], explanation: "Mock: no contradiction." });
    }
    if (sp.includes("evidence verification") || up.includes("EVIDENCE_VERIFICATION")) {
      return JSON.stringify({
        overall_evidence_level: "HIGH", status: "SUPPORTED",
        claims: [{ claim: "mock", status: "SUPPORTED", supporting_sources: [1], reason: "mock" }],
        supported: ["mock"], conflicts: [], unsupported: []
      });
    }
    if (sp.includes("search-query") || sp.includes("Search Query") || up.includes("SEARCH_QUERY")) {
      return JSON.stringify({ queries: [{ type: "exact", query: "mock query" }] });
    }
    // Smoke mode exercises plumbing only; its accuracy is not representative.
    return JSON.stringify({
      directAnswer: { option: "A", text: "Mock answer A" },
      explanation: "Mock explanation for smoke test.",
      confidence: "HIGH",
      confidenceReason: "Mock confidence.",
      optionAnalysis: [],
      questionRestated: "Mock restate.",
      ownSolution: "Mock solution.",
      reasoningSteps: ["Step 1 mock"],
      evidenceUsed: []
    });
  };

  setMockSearchHandler(async () => [
    {
      title: "Mock Reference",
      url: "https://example.edu/mock",
      snippet: "Mock snippet for smoke test.",
      domain: "example.edu",
      provider: "mock",
      authority: 90,
      relevance: 90
    }
  ]);

  aiClientOverride = defaultAIClient;
  console.log("[eval] Smoke mode: using mock AI client and mock search.");
}
const usageMetrics = {
  calls: 0,
  maxCalls: Number.isFinite(maxCalls) ? maxCalls : Infinity,
  providerTokens: 0,
  estimatedPromptTokens: 0,
  estimatedCompletionTokens: 0
};
defaultAIClient.usageMetrics = usageMetrics;

// ---------------------------------------------------------------------------
// Normalize answer for comparison
// ---------------------------------------------------------------------------
function normalizeAnswer(raw) {
  if (!raw) return "";
  const s = String(raw).trim().toUpperCase();
  // If it's a single letter (A-E) return it
  if (/^[A-E]$/.test(s)) return s;
  // If multi-select like "AC" return sorted letters
  if (/^[A-E]{2,4}$/.test(s)) return s.split("").sort().join("");
  // Otherwise normalize whitespace
  return String(raw).trim().replace(/\s+/g, " ");
}

function extractPipelineAnswer(result, questionType) {
  const da = result.directAnswer;
  if (da && typeof da === "object") {
    if (da.option) return normalizeAnswer(da.option);
    if (da.text) return normalizeAnswer(da.text);
  }
  if (typeof da === "string") return normalizeAnswer(da);
  return normalizeAnswer(result.directAnswerText || "");
}

function answersMatch(pipelineAnswer, datasetAnswer, questionType, tolerance = 0.01) {
  const pa = normalizeAnswer(pipelineAnswer);
  const da = normalizeAnswer(datasetAnswer);

  if (pa === da) return true;

  // NUMERICAL: try numeric comparison with tolerance
  if (questionType === "NUMERICAL") {
    const parseNumeric = (value) => {
      const cleaned = String(value).replace(/,/g, "").replace(/\s+/g, "");
      const fraction = cleaned.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
      if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
      const match = cleaned.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
      return match ? Number(match[0]) : Number.NaN;
    };
    const pNum = parseNumeric(pa);
    const dNum = parseNumeric(da);
    if (!isNaN(pNum) && !isNaN(dNum)) {
      if (dNum === 0) return pNum === 0;
      return Math.abs((pNum - dNum) / dNum) <= tolerance;
    }
  }

  // Multi-select: sort letters and compare
  if (questionType === "MULTI_SELECT") {
    const sortedPa = pa.replace(/[^A-E]/g, "").split("").sort().join("");
    const sortedDa = da.replace(/[^A-E]/g, "").split("").sort().join("");
    return sortedPa === sortedDa;
  }

  // Coding/SQL: compare the full normalized answer to avoid prefix false positives.
  if (questionType === "CODING" || questionType === "SQL") {
    return pa.replace(/\s+/g, " ").trim() === da.replace(/\s+/g, " ").trim();
  }

  return false;
}

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------
function getCacheKey(q, cfg) {
  const payload = JSON.stringify({
    id: q.id,
    question: q.question,
    options: q.options,
    type: q.type,
    config: cfg
  });
  return createHash("sha256").update(payload).digest("hex");
}

function readCache(key) {
  const p = path.join(cacheDir, `${key}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  writeFileSync(path.join(cacheDir, `${key}.json`), JSON.stringify(data), "utf8");
}

// ---------------------------------------------------------------------------
// Concurrency limiter (manual semaphore, no external deps)
// ---------------------------------------------------------------------------
function createConcurrencyLimiter(concurrency) {
  let active = 0;
  const queue = [];
  return function limit(fn) {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++;
        Promise.resolve(fn())
          .then(resolve, reject)
          .finally(() => {
            active--;
            if (queue.length > 0) queue.shift()();
          });
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
  };
}

// ---------------------------------------------------------------------------
// Run evaluation
// ---------------------------------------------------------------------------
const limitFn = createConcurrencyLimiter(smokeMode ? 1 : concurrency);
let callCount = 0;
const results = [];
const startTime = Date.now();

console.log(`[eval] Config: ${config.name} | Questions: ${questions.length} | MaxCalls: ${maxCalls} | Smoke: ${smokeMode}`);

await Promise.all(
  questions.map((q) =>
    limitFn(async () => {
      // Cost cap
      if (callCount >= maxCalls) {
        results.push({ id: q.id, status: "SKIPPED_COST_CAP", question: q.question });
        return;
      }

      // Check cache (skip cache in smoke mode for simplicity)
      const cacheKey = getCacheKey(q, config);
      if (!smokeMode) {
        const cached = readCache(cacheKey);
        if (cached) {
          results.push({ ...cached, cached: true });
          return;
        }
      }

      callCount++;
      const qStart = Date.now();
      let status = "ERROR";
      let pipelineAnswer = "";
      let correct = false;
      let confidence = "UNVERIFIED";
      let errorMessage = null;
      let pipelineResult = null;

      try {
        const callArgs = {
          question: q.question,
          options: q.options || [],
          type: q.type,
          subject: q.subject,
          userId: process.env.EVAL_LOCAL_USER_ID || null,
          mode: "Practice Mode",
          evaluationConfig: config,
          aiClient: aiClientOverride
        };

        pipelineResult = await processAssessmentQuestion(callArgs);
        pipelineAnswer = extractPipelineAnswer(pipelineResult, q.type);
        confidence = pipelineResult.confidence || "UNVERIFIED";

        correct = answersMatch(pipelineAnswer, q.answer, q.type);
        status = correct ? "CORRECT" : "INCORRECT";
      } catch (err) {
        status = err.code === "EVAL_MAX_CALLS_REACHED" ? "SKIPPED_COST_CAP" : "ERROR";
        errorMessage = err.message || String(err);
      }

      const latencyMs = Date.now() - qStart;
      const record = {
        id: q.id,
        subject: q.subject,
        type: q.type,
        difficulty: q.difficulty,
        question: q.question.slice(0, 120),
        expectedAnswer: q.answer,
        pipelineAnswer,
        correct,
        confidence,
        needsReview: Boolean(q.needsReview),
        status,
        latencyMs,
      ...(errorMessage ? { error: errorMessage } : {}),
        ...(pipelineResult ? { verificationStatus: pipelineResult.verification?.status } : {})
      };

      if (!smokeMode) writeCache(cacheKey, record);
      results.push(record);

      const icon = status === "CORRECT" ? "✓" : status === "ERROR" ? "✗" : "✗";
      process.stdout.write(`${icon}(${q.id}) `);
    })
  )
);

console.log("\n[eval] All questions processed.");

// ---------------------------------------------------------------------------
// Compute metrics
// ---------------------------------------------------------------------------
function computeMetrics(records) {
  const total = records.length;
  const answered = records.filter((r) => r.status !== "SKIPPED_COST_CAP" && r.status !== "ERROR");
  const errors = records.filter((r) => r.status === "ERROR");
  const skipped = records.filter((r) => r.status === "SKIPPED_COST_CAP");
  const correct = answered.filter((r) => r.correct);

  const accuracy = answered.length > 0 ? correct.length / answered.length : 0;
  const unverifiedRate = answered.length > 0
    ? answered.filter((r) => r.confidence === "UNVERIFIED").length / answered.length
    : 0;

  // By type
  const byType = {};
  for (const r of answered) {
    if (!byType[r.type]) byType[r.type] = { correct: 0, total: 0 };
    byType[r.type].total++;
    if (r.correct) byType[r.type].correct++;
  }

  // By subject
  const bySubject = {};
  for (const r of answered) {
    if (!bySubject[r.subject]) bySubject[r.subject] = { correct: 0, total: 0 };
    bySubject[r.subject].total++;
    if (r.correct) bySubject[r.subject].correct++;
  }

  // By difficulty
  const byDifficulty = {};
  for (const r of answered) {
    const d = r.difficulty || "Unknown";
    if (!byDifficulty[d]) byDifficulty[d] = { correct: 0, total: 0 };
    byDifficulty[d].total++;
    if (r.correct) byDifficulty[d].correct++;
  }

  // Calibration: accuracy at each confidence level
  const calibration = {};
  for (const conf of ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"]) {
    const atConf = answered.filter((r) => r.confidence === conf);
    calibration[conf] = {
      total: atConf.length,
      correct: atConf.filter((r) => r.correct).length,
      accuracy: atConf.length > 0 ? atConf.filter((r) => r.correct).length / atConf.length : null
    };
  }

  // Latency
  const latencies = answered.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;

  return {
    total,
    answered: answered.length,
    correct: correct.length,
    errors: errors.length,
    skipped: skipped.length,
    accuracy: Math.round(accuracy * 10000) / 100, // percentage with 2dp
    unverifiedRate: Math.round(unverifiedRate * 10000) / 100,
    latencyP50Ms: p50,
    latencyP95Ms: p95,
    modelCalls: usageMetrics.calls,
    providerTokens: usageMetrics.providerTokens,
    estimatedTokens: usageMetrics.estimatedPromptTokens + usageMetrics.estimatedCompletionTokens,
    estimatedPromptTokens: usageMetrics.estimatedPromptTokens,
    estimatedCompletionTokens: usageMetrics.estimatedCompletionTokens,
    costUsd: process.env.EVAL_COST_PER_1K_TOKENS_USD
      ? Math.round(((usageMetrics.providerTokens || usageMetrics.estimatedPromptTokens + usageMetrics.estimatedCompletionTokens) / 1000) * Number(process.env.EVAL_COST_PER_1K_TOKENS_USD) * 1e6) / 1e6
      : null,
    byType: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [k, {
        correct: v.correct,
        total: v.total,
        accuracy: Math.round(v.correct / v.total * 10000) / 100
      }])
    ),
    bySubject: Object.fromEntries(
      Object.entries(bySubject).map(([k, v]) => [k, {
        correct: v.correct,
        total: v.total,
        accuracy: Math.round(v.correct / v.total * 10000) / 100
      }])
    ),
    byDifficulty: Object.fromEntries(
      Object.entries(byDifficulty).map(([k, v]) => [k, {
        correct: v.correct,
        total: v.total,
        accuracy: Math.round(v.correct / v.total * 10000) / 100
      }])
    ),
    calibration
  };
}

const metrics = computeMetrics(results);
const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

// ---------------------------------------------------------------------------
// Write results JSON
// ---------------------------------------------------------------------------
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const jsonPath = path.join(resultsDir, `${timestamp}_${config.name}.json`);
const mdPath = path.join(resultsDir, `${timestamp}_${config.name}.md`);

const output = {
  config: config.name,
  timestamp: new Date().toISOString(),
  smokeMode,
  totalDurationSec: parseFloat(totalDuration),
  metrics,
  results
};

writeFileSync(jsonPath, JSON.stringify(output, null, 2), "utf8");
console.log(`[eval] Results JSON → ${jsonPath}`);

// ---------------------------------------------------------------------------
// Write Markdown report
// ---------------------------------------------------------------------------
function pct(n) {
  return n === null ? "N/A" : `${n}%`;
}

function tableRows(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `| ${k} | ${v.correct} / ${v.total} | ${pct(v.accuracy)} |`)
    .join("\n");
}

const md = `# ExamAssist AI Evaluation Report

**Config**: \`${config.name}\`

**Date**: ${new Date().toISOString()}

**Mode**: ${smokeMode ? "Smoke (mock AI; accuracy is not representative)" : "Live"}

**Duration**: ${totalDuration}s

---

## Summary

| Metric | Value |
|--------|-------|
| Total questions | ${metrics.total} |
| Answered | ${metrics.answered} |
| Correct | ${metrics.correct} |
| **Overall Accuracy** | **${pct(metrics.accuracy)}** |
| UNVERIFIED rate | ${pct(metrics.unverifiedRate)} |
| Errors | ${metrics.errors} |
| Skipped (cost cap) | ${metrics.skipped} |
| Latency p50 | ${metrics.latencyP50Ms} ms |
| Latency p95 | ${metrics.latencyP95Ms} ms |
| AI calls | ${metrics.modelCalls} |
| Provider tokens | ${metrics.providerTokens} |
| Estimated tokens (when provider usage is absent) | ${metrics.estimatedTokens} |
| Cost | ${metrics.costUsd === null ? "Not priced (set EVAL_COST_PER_1K_TOKENS_USD)" : `$${metrics.costUsd}`} |

---

## Accuracy by Subject

| Subject | Correct / Total | Accuracy |
|---------|----------------|----------|
${tableRows(metrics.bySubject)}

---

## Accuracy by Question Type

| Type | Correct / Total | Accuracy |
|------|----------------|----------|
${tableRows(metrics.byType)}

---

## Accuracy by Difficulty

| Difficulty | Correct / Total | Accuracy |
|-----------|----------------|----------|
${tableRows(metrics.byDifficulty)}

---

## Calibration (Accuracy at Each Confidence Level)

A well-calibrated system has HIGH accuracy when it says HIGH confidence.

| Confidence | Correct / Total | Accuracy |
|-----------|----------------|----------|
${Object.entries(metrics.calibration).map(([k, v]) => `| ${k} | ${v.correct} / ${v.total} | ${pct(v.accuracy)} |`).join("\n")}

---

## Errors (${metrics.errors})

${results.filter(r => r.status === "ERROR").map(r => `- **${r.id}**: ${r.error}`).join("\n") || "None"}

---

## Incorrect Answers (first 20)

| ID | Subject | Type | Expected | Got | Confidence |
|----|---------|------|----------|-----|-----------|
${results.filter(r => r.status === "INCORRECT").slice(0, 20).map(r =>
  `| ${r.id} | ${r.subject} | ${r.type} | ${r.expectedAnswer} | ${r.pipelineAnswer || "—"} | ${r.confidence} |`
).join("\n") || "None"}

---

*Results JSON: \`${path.basename(jsonPath)}\`*
`;

writeFileSync(mdPath, md, "utf8");
console.log(`[eval] Markdown report → ${mdPath}`);

// Keep a latest-run comparison across ablations as configurations are evaluated.
const latestByConfig = new Map();
for (const filename of readdirSync(resultsDir).filter((name) => name.endsWith(".json"))) {
  try {
    const candidate = JSON.parse(readFileSync(path.join(resultsDir, filename), "utf8"));
    const current = latestByConfig.get(candidate.config);
    if (!current || new Date(candidate.timestamp) > new Date(current.timestamp)) latestByConfig.set(candidate.config, candidate);
  } catch {}
}
const orderedConfigs = ["a_single_pass", "b_solve_evidence", "c_solve_tiebreak", "d_rag", "e_specialized"];
const comparisonRows = orderedConfigs.map((name) => {
  const run = latestByConfig.get(name);
  if (!run) return `| ${name} | — | — | — | — | — |`;
  const m = run.metrics;
  return `| ${name} | ${run.smokeMode ? "smoke" : "live"} | ${m.answered} | ${pct(m.accuracy)} | ${pct(m.unverifiedRate)} | ${m.latencyP50Ms}/${m.latencyP95Ms} ms |`;
});
const comparison = `# Ablation comparison\n\nLatest available run per configuration. Smoke runs use mocked AI and do not measure model accuracy. Run each config against the same dataset/configuration for a valid comparison.\n\n| Configuration | Mode | Answered | Accuracy | UNVERIFIED | Latency p50/p95 |\n|---|---:|---:|---:|---:|---:|\n${comparisonRows.join("\n")}\n`;
writeFileSync(path.join(resultsDir, "ablation-comparison.md"), comparison, "utf8");

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(60)}`);
console.log(`Config: ${config.name} | Mode: ${smokeMode ? "smoke" : "live"}`);
console.log(`Accuracy: ${pct(metrics.accuracy)} (${metrics.correct}/${metrics.answered})`);
console.log(`UNVERIFIED: ${pct(metrics.unverifiedRate)} | Errors: ${metrics.errors}`);
console.log(`Latency p50: ${metrics.latencyP50Ms}ms | p95: ${metrics.latencyP95Ms}ms`);
console.log(`${"=".repeat(60)}\n`);
