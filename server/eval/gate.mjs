#!/usr/bin/env node
/** Fail CI when a reproducible evaluation regresses beyond its stored tolerance. */
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const config = getArg("--config") || "a_single_pass";
const mode = args.includes("--smoke") ? "smoke" : "live";
const seed = getArg("--seed") || (mode === "smoke" ? "examassist-phase1-baseline" : "examassist-eval-v1");
const baselineFile = mode === "smoke" ? "smoke-baseline.json" : "baseline.json";
const baselinePath = path.join(here, baselineFile);
if (!existsSync(baselinePath)) throw new Error(`Missing eval/${baselineFile}. Commit a measured baseline before running the quality gate.`);
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
if (mode === "live" && baseline.smokeOnly) {
  throw new Error("eval:gate refuses to use a smoke baseline for real comparisons.");
}
const key = `${config}:${mode}:${seed}`;
const expected = baseline.runs?.[key];
if (!expected) throw new Error(`No stored baseline for ${key} in ${baselineFile}. Gate cannot compare unlike runs.`);
if (mode === "live" && (expected.smokeMode === true || key.includes(":smoke:"))) {
  throw new Error(`Baseline entry ${key} is a smoke run. eval:gate never uses smoke baselines for real comparisons.`);
}

const REQUIRED_METADATA_FIELDS = ["runId", "model", "date", "datasetHash"];
for (const field of REQUIRED_METADATA_FIELDS) {
  const val = expected[field] || (field === "date" ? expected.recordedAt : undefined);
  if (!val) {
    throw new Error(`Baseline entry ${key} rejected: missing required metadata field '${field}'. Stored baselines in ${baselineFile} must include runId, model, date, and datasetHash.`);
  }
}

const resultsDir = path.join(here, "results");
if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
const output = path.join(resultsDir, `.gate-${process.pid}.json`);
const runnerArgs = [path.join(here, "runner.mjs"), "--config", config, "--seed", seed, "--output", output];
if (args.includes("--no-cache") || mode === "smoke") runnerArgs.push("--no-cache");
if (mode === "smoke") runnerArgs.push("--smoke");
const child = spawnSync(process.execPath, runnerArgs, { cwd: path.join(here, ".."), env: { ...process.env, EVAL_MAX_CALLS: process.env.EVAL_MAX_CALLS || "10000" }, encoding: "utf8" });
process.stdout.write(child.stdout || "");
process.stderr.write(child.stderr || "");
if (child.status !== 0) process.exit(child.status || 1);

try {
  const actual = JSON.parse(readFileSync(output, "utf8"));
  for (const field of REQUIRED_METADATA_FIELDS) {
    const val = actual[field] || (field === "date" ? actual.timestamp : undefined);
    if (!val) {
      throw new Error(`Run result rejected: missing required metadata field '${field}'. Stored runs must include runId, model, date, and datasetHash.`);
    }
  }
  if (actual.datasetHash !== expected.datasetHash) throw new Error("Dataset changed from the stored baseline. Review the change and commit a new measured baseline before running the gate.");
  const tolerance = baseline.tolerance || {};
  const accuracyDrop = expected.metrics.accuracy - actual.metrics.accuracy;
  const unverifiedWrongIncrease = actual.metrics.unverifiedWrongAnswerRate - expected.metrics.unverifiedWrongAnswerRate;
  const calibrationRegression = ["HIGH", "MEDIUM", "LOW"].some((level) => {
    const previous = expected.metrics.calibration?.[level];
    const current = actual.metrics.calibration?.[level];
    return previous?.total > 0 && current?.total > 0 && previous.accuracy - current.accuracy > (tolerance.calibrationPctPoints ?? 5);
  });
  const failures = [];
  if (accuracyDrop > (tolerance.accuracyPctPoints ?? 2)) failures.push(`accuracy regressed ${accuracyDrop.toFixed(2)} percentage points`);
  if (unverifiedWrongIncrease > (tolerance.unverifiedWrongPctPoints ?? 2)) failures.push(`UNVERIFIED wrong-answer rate increased ${unverifiedWrongIncrease.toFixed(2)} percentage points`);
  if (calibrationRegression) failures.push("a populated confidence calibration bucket regressed beyond tolerance");
  if (failures.length) throw new Error(`Evaluation gate failed: ${failures.join("; ")}.`);
  console.log(`[eval:gate] Passed ${key}: accuracy ${actual.metrics.accuracy}%, UNVERIFIED wrong ${actual.metrics.unverifiedWrongAnswerRate}%.`);
} finally {
  if (existsSync(output)) unlinkSync(output);
  const mdOutput = output.replace(/\.json$/, ".md");
  if (existsSync(mdOutput)) unlinkSync(mdOutput);
}
