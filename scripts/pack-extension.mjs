#!/usr/bin/env node
/**
 * ExamAssist AI - Extension Package Script (`npm run pack:extension`)
 * Packages extension/dist into a standalone zip ready for Chrome Web Store / sideloading.
 * Guarantees zero source files (.ts), no node_modules, no tests.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyDist } from "./verify-dist.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const extensionDir = path.join(repoRoot, "extension");
const distDir = path.join(extensionDir, "dist");
const outputZip = path.join(extensionDir, "examassist-extension.zip");

export function packExtension(targetZip = outputZip) {
  // Step 1: Verify dist integrity first
  verifyDist(distDir);

  if (fs.existsSync(targetZip)) {
    fs.rmSync(targetZip, { force: true });
  }

  // Step 2: Zip dist only (from within dist directory so root of zip is manifest.json)
  execFileSync(
    "zip",
    ["-r", "-q", targetZip, "."],
    { cwd: distDir, stdio: "inherit" }
  );

  // Step 3: Audit zip contents
  const listOutput = execFileSync("unzip", ["-Z1", targetZip], { encoding: "utf8" });
  const entries = listOutput.split(/\r?\n/).filter(Boolean);

  const forbiddenRegex = /(node_modules|\.ts$|\.map$|src\/|test\/|\.env|\.git|\.DS_Store)/i;
  const violations = entries.filter(e => forbiddenRegex.test(e));
  if (violations.length > 0) {
    fs.rmSync(targetZip, { force: true });
    throw new Error(`Extension pack failed: forbidden files in zip:\n${violations.join("\n")}`);
  }

  // Must contain manifest.json at root
  if (!entries.includes("manifest.json")) {
    fs.rmSync(targetZip, { force: true });
    throw new Error("Extension pack failed: manifest.json missing from root of zip");
  }

  console.log(`[pack:extension] Created clean extension package: ${targetZip} (${entries.length} files)`);
  return { zipPath: targetZip, entries };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  packExtension();
}
