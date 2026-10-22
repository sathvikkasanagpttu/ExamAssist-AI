#!/usr/bin/env node
/**
 * ExamAssist AI - Documentation and Evaluation Verification (`npm run docs:verify`)
 *
 * Verifies that:
 * 1. Every evaluation artifact referenced in docs/EVAL_REPORT.md exists in server/eval/results/
 * 2. Every baseline artifact referenced in server/eval/baseline.json exists in server/eval/results/
 * 3. Fails immediately on unverified records or missing artifact references.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const evalReportPath = path.join(repoRoot, "docs", "EVAL_REPORT.md");
const baselineJsonPath = path.join(repoRoot, "server", "eval", "baseline.json");
const resultsDir = path.join(repoRoot, "server", "eval", "results");

export function verifyDocsAndEvalProvenance() {
  const missing = [];
  const verified = [];

  // 1. Verify baseline.json artifact references
  if (fs.existsSync(baselineJsonPath)) {
    const baseline = JSON.parse(fs.readFileSync(baselineJsonPath, "utf8"));
    const runs = baseline.runs || {};

    for (const [runKey, runData] of Object.entries(runs)) {
      if (runData.artifact) {
        const fullPath = path.join(resultsDir, runData.artifact);
        if (!fs.existsSync(fullPath)) {
          missing.push({ source: "baseline.json", ref: runData.artifact, runKey });
        } else {
          verified.push({ source: "baseline.json", ref: runData.artifact });
        }
      }
    }
  } else {
    missing.push({ source: "filesystem", ref: "server/eval/baseline.json" });
  }

  // 2. Verify docs/EVAL_REPORT.md artifact references
  if (fs.existsSync(evalReportPath)) {
    const reportContent = fs.readFileSync(evalReportPath, "utf8");

    // Match any JSON result artifact references in markdown links or code snippets
    // e.g. results/2026-10-12T19-32-40_a_single_pass.json or 2026-10-12T...json
    const regex = /(?:results\/|\/results\/|`)([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9_\-a-zA-Z]+\.json)(?:`|\))/g;
    let match;
    const seen = new Set();
    while ((match = regex.exec(reportContent)) !== null) {
      const artifactName = match[1];
      if (seen.has(artifactName)) continue;
      seen.add(artifactName);

      const fullPath = path.join(resultsDir, artifactName);
      if (!fs.existsSync(fullPath)) {
        missing.push({ source: "docs/EVAL_REPORT.md", ref: artifactName });
      } else {
        verified.push({ source: "docs/EVAL_REPORT.md", ref: artifactName });
      }
    }

    // Check for stale or unverifiable records (e.g. .gate-*.json)
    if (reportContent.includes(".gate-")) {
      missing.push({ source: "docs/EVAL_REPORT.md", ref: "Unverifiable .gate-* artifact reference detected" });
    }
  } else {
    missing.push({ source: "filesystem", ref: "docs/EVAL_REPORT.md" });
  }

  if (missing.length > 0) {
    const errorMsg = `[docs:verify] FAILED: Missing or unverifiable results artifacts:\n${missing.map(m => `  - [${m.source}] ${m.ref}`).join("\n")}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log(`[docs:verify] PASSED: All ${verified.length} results artifacts referenced in EVAL_REPORT.md and baseline.json exist in server/eval/results/.`);
  return { verified, missing };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    verifyDocsAndEvalProvenance();
  } catch (err) {
    process.exit(1);
  }
}
