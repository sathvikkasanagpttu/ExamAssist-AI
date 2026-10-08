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
const mode = args.includes("--live") ? "live" : "smoke";
const seed = getArg("--seed") || "examassist-phase1-baseline";
const baselinePath = path.join(here, "baseline.json");
if (!existsSync(baselinePath)) throw new Error("Missing eval/baseline.json. Commit a measured baseline before running the quality gate.");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const key = `${config}:${mode}:${seed}`;
const expected = baseline.runs?.[key];
if (!expected) throw new Error(`No stored baseline for ${key}. Gate cannot compare unlike runs.`);

const resultsDir = path.join(here, "results");
if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
const output = path.join(resultsDir, `.gate-${process.pid}.json`);
const runnerArgs = [path.join(here, "runner.mjs"), "--config", config, "--seed", seed, "--no-cache", "--output", output];
if (mode === "smoke") runnerArgs.push("--smoke");
const child = spawnSync(process.execPath, runnerArgs, { cwd: path.join(here, ".."), env: { ...process.env, EVAL_MAX_CALLS: process.env.EVAL_MAX_CALLS || "10000" }, encoding: "utf8" });
process.stdout.write(child.stdout || "");
process.stderr.write(child.stderr || "");
if (child.status !== 0) process.exit(child.status || 1);

try {
  const actual = JSON.parse(readFileSync(output, "utf8"));
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
}
