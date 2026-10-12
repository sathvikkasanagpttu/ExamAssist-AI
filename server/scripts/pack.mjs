#!/usr/bin/env node
/**
 * ExamAssist AI - Clean Release Packager (`npm run pack`)
 * 1. Verifies .gitignore and .dockerignore hygiene rules.
 * 2. Builds a clean zip archive excluding secrets (.env), logs, node_modules, .DS_Store, .git, and caches.
 * 3. Audits the resulting zip entries to guarantee zero forbidden files or secrets are included.
 */

import { execFileSync } from "child_process";
import { existsSync, readFileSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const args = process.argv.slice(2);
const dryCheckOnly = args.includes("--verify-only");
const outputArgIdx = args.indexOf("--output");
const zipPath = outputArgIdx >= 0
  ? path.resolve(process.cwd(), args[outputArgIdx + 1])
  : path.join(repoRoot, "ExamAssist-AI-clean.zip");

const REQUIRED_IGNORE_PATTERNS = [".env", "node_modules", ".log", ".DS_Store", ".zip"];

export function verifyIgnoreFiles(rootDir = repoRoot) {
  const ignoreFiles = [
    path.join(rootDir, ".gitignore"),
    path.join(rootDir, ".dockerignore"),
    path.join(rootDir, "server", ".dockerignore")
  ];

  for (const file of ignoreFiles) {
    if (!existsSync(file)) {
      throw new Error(`Missing required ignore file: ${path.relative(rootDir, file)}`);
    }
    const content = readFileSync(file, "utf8");
    for (const pattern of REQUIRED_IGNORE_PATTERNS) {
      if (!content.includes(pattern)) {
        throw new Error(`Ignore file ${path.relative(rootDir, file)} is missing required pattern: ${pattern}`);
      }
    }
  }
  return true;
}

export function buildAndAuditCleanZip(targetZip = zipPath, rootDir = repoRoot) {
  verifyIgnoreFiles(rootDir);

  if (existsSync(targetZip)) {
    rmSync(targetZip, { force: true });
  }

  const exclusions = [
    ".git/*",
    "*.git/*",
    "node_modules/*",
    "*/node_modules/*",
    "*/*/node_modules/*",
    ".env",
    "*/.env",
    ".env.local",
    "*/.env.local",
    ".env.production",
    "*/.env.production",
    "*.log",
    "*/*.log",
    ".DS_Store",
    "*/.DS_Store",
    "*/*/.DS_Store",
    "*.zip",
    "*/*.zip",
    "server/eval/cache/*",
    "server/eval/results/*",
    "extension/test-results/*",
    "extension/playwright-report/*"
  ];

  execFileSync(
    "zip",
    ["-r", "-q", targetZip, ".", "-x", ...exclusions],
    { cwd: rootDir, stdio: "inherit" }
  );

  const listOutput = execFileSync("unzip", ["-Z1", targetZip], { cwd: rootDir, encoding: "utf8" });
  const entries = listOutput.split(/\r?\n/).filter(Boolean);

  const forbiddenRegex = /(^|\/)(\.env(\.(?!example$)[^/]+)?|node_modules|\.DS_Store|\.git)(\/|$)|\.log$|\.zip$/i;
  const violations = entries.filter((entry) => forbiddenRegex.test(entry));
  if (violations.length > 0) {
    rmSync(targetZip, { force: true });
    throw new Error(`Pack audit failed! Forbidden files found in archive:\n${violations.join("\n")}`);
  }

  return { zipPath: targetZip, fileCount: entries.length, entries };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (dryCheckOnly) {
    verifyIgnoreFiles(repoRoot);
    console.log("[pack] .gitignore and .dockerignore checks passed.");
  } else {
    const result = buildAndAuditCleanZip(zipPath, repoRoot);
    console.log(`[pack] Built clean archive: ${result.zipPath} (${result.fileCount} files verified clean).`);
  }
}
