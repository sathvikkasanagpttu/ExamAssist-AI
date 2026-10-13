import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { verifyIgnoreFiles, buildAndAuditCleanZip } from "../scripts/pack.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");

test("Phase 0.4: manifest.json has no <all_urls>, uses narrow allow-list, and popup.js requests runtime permissions", () => {
  const manifestPath = path.join(repoRoot, "extension", "manifest.json");
  const rawManifest = readFileSync(manifestPath, "utf8");
  assert.equal(rawManifest.includes("<all_urls>"), false, "manifest.json must not contain <all_urls>");

  const manifest = JSON.parse(rawManifest);
  const matches = manifest.content_scripts?.[0]?.matches || [];
  assert.ok(matches.length >= 2 && matches.length <= 15, "content_scripts should ship with a small default allow-list");
  assert.ok(!matches.includes("<all_urls>") && !matches.includes("*://*/*"));
  assert.ok(Array.isArray(manifest.optional_host_permissions) && manifest.optional_host_permissions.length > 0);

  const popupJs = readFileSync(path.join(repoRoot, "extension", "popup.js"), "utf8");
  assert.ok(popupJs.includes("chrome.permissions.request"), "popup.js must request per-site access via chrome.permissions.request");
  assert.ok(popupJs.includes("Enable on this site"), "popup.js must support 'Enable on this site'");
  assert.ok(popupJs.includes("apiBase"), "popup.js must support configurable apiBase");
});

test("Phase 0.5: docker-compose.yml does not publish sandbox port to host", () => {
  const compose = readFileSync(path.join(repoRoot, "docker-compose.yml"), "utf8");
  const sandboxSection = compose.split("\n  examassist-sandbox:")[1] || "";
  assert.ok(!sandboxSection.includes("8791:8790"), "examassist-sandbox must not publish port 8791:8790 to host");
  assert.ok(!/^\s*ports:/m.test(sandboxSection.split("networks:")[0] || ""), "examassist-sandbox must not have a host ports mapping");
  assert.ok(sandboxSection.includes("expose:"), "examassist-sandbox should expose port 8790 on internal network only");
});

test("Phase 0.5: .gitignore/.dockerignore checks and clean pack zip builder exclude secrets, logs, node_modules, and .DS_Store", () => {
  assert.equal(verifyIgnoreFiles(repoRoot), true);
  const tmpZip = path.join(repoRoot, "ExamAssist-AI-test-pack.zip");
  try {
    const result = buildAndAuditCleanZip(tmpZip, repoRoot);
    assert.ok(result.fileCount > 20, "Clean archive should contain project source files");
    assert.equal(
      result.entries.some((e) => /(^|\/)(\.env(\.(?!example$)[^/]+)?|node_modules|\.DS_Store|\.git)(\/|$)|\.log$|\.zip$/i.test(e)),
      false,
      "Archive must not contain .env, node_modules, .DS_Store, .git, .log, or nested .zip files"
    );
  } finally {
    if (existsSync(tmpZip)) rmSync(tmpZip, { force: true });
  }
});

test("Phase 0.2: smoke-baseline.json is separate from baseline.json and gate.mjs forbids smoke baselines in live mode", () => {
  const smokeBaselinePath = path.join(serverRoot, "eval", "smoke-baseline.json");
  assert.ok(existsSync(smokeBaselinePath), "eval/smoke-baseline.json must exist separately");
  const smokeBaseline = JSON.parse(readFileSync(smokeBaselinePath, "utf8"));
  assert.equal(smokeBaseline.smokeOnly, true);

  const gateCode = readFileSync(path.join(serverRoot, "eval", "gate.mjs"), "utf8");
  assert.ok(gateCode.includes("smoke-baseline.json"));
  assert.ok(gateCode.includes("never uses smoke baselines for real comparisons") || gateCode.includes("refuses to use a smoke baseline"));
});

test("Phase 0.6: Monorepo version numbers are consistent across root, server, extension, shared, and manifest", () => {
  const rootPkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const serverPkg = JSON.parse(readFileSync(path.join(repoRoot, "server", "package.json"), "utf8"));
  const extPkg = JSON.parse(readFileSync(path.join(repoRoot, "extension", "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, "extension", "manifest.json"), "utf8"));
  const sharedPkg = JSON.parse(readFileSync(path.join(repoRoot, "shared", "package.json"), "utf8"));

  assert.equal(rootPkg.version, "2.2.0");
  assert.equal(serverPkg.version, rootPkg.version);
  assert.equal(extPkg.version, rootPkg.version);
  assert.equal(manifest.version, rootPkg.version);
  assert.equal(sharedPkg.version, rootPkg.version);
});
