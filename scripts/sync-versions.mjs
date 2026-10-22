#!/usr/bin/env node
/**
 * ExamAssist AI - Monorepo Version Synchronization & Verification Script
 *
 * Usage:
 *   node scripts/sync-versions.mjs --check       # Verifies all package, lockfile, and manifest versions match
 *   node scripts/sync-versions.mjs [version]     # Syncs all packages/manifests/lockfiles to target version
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const FILES = {
  rootPackage: path.join(repoRoot, "package.json"),
  rootPackageLock: path.join(repoRoot, "package-lock.json"),
  serverPackage: path.join(repoRoot, "server", "package.json"),
  serverPackageLock: path.join(repoRoot, "server", "package-lock.json"),
  extensionPackage: path.join(repoRoot, "extension", "package.json"),
  extensionPackageLock: path.join(repoRoot, "extension", "package-lock.json"),
  extensionManifest: path.join(repoRoot, "extension", "manifest.json"),
  sharedPackage: path.join(repoRoot, "shared", "package.json"),
  serverSchemas: path.join(repoRoot, "server", "schemas.js"),
  extensionDistManifest: path.join(repoRoot, "extension", "dist", "manifest.json")
};

export function getVersionMap() {
  const versions = {};

  if (fs.existsSync(FILES.rootPackage)) {
    versions.root = JSON.parse(fs.readFileSync(FILES.rootPackage, "utf8")).version;
  }
  if (fs.existsSync(FILES.rootPackageLock)) {
    const lock = JSON.parse(fs.readFileSync(FILES.rootPackageLock, "utf8"));
    versions.rootLock = lock.version;
    if (lock.packages && lock.packages[""]) {
      versions.rootLockPackage = lock.packages[""].version;
    }
  }
  if (fs.existsSync(FILES.serverPackage)) {
    versions.server = JSON.parse(fs.readFileSync(FILES.serverPackage, "utf8")).version;
  }
  if (fs.existsSync(FILES.serverPackageLock)) {
    const lock = JSON.parse(fs.readFileSync(FILES.serverPackageLock, "utf8"));
    versions.serverLock = lock.version;
    if (lock.packages && lock.packages[""]) {
      versions.serverLockPackage = lock.packages[""].version;
    }
  }
  if (fs.existsSync(FILES.extensionPackage)) {
    versions.extension = JSON.parse(fs.readFileSync(FILES.extensionPackage, "utf8")).version;
  }
  if (fs.existsSync(FILES.extensionPackageLock)) {
    const lock = JSON.parse(fs.readFileSync(FILES.extensionPackageLock, "utf8"));
    versions.extensionLock = lock.version;
    if (lock.packages && lock.packages[""]) {
      versions.extensionLockPackage = lock.packages[""].version;
    }
  }
  if (fs.existsSync(FILES.extensionManifest)) {
    versions.manifest = JSON.parse(fs.readFileSync(FILES.extensionManifest, "utf8")).version;
  }
  if (fs.existsSync(FILES.sharedPackage)) {
    versions.shared = JSON.parse(fs.readFileSync(FILES.sharedPackage, "utf8")).version;
  }
  if (fs.existsSync(FILES.serverSchemas)) {
    const schemasContent = fs.readFileSync(FILES.serverSchemas, "utf8");
    const match = schemasContent.match(/export const APP_VERSION = ["']([^"']+)["']/);
    versions.schemasConstant = match ? match[1] : null;
  }
  if (fs.existsSync(FILES.extensionDistManifest)) {
    versions.distManifest = JSON.parse(fs.readFileSync(FILES.extensionDistManifest, "utf8")).version;
  }

  return versions;
}

export function checkVersionConsistency() {
  const versions = getVersionMap();
  const canonical = versions.root;
  const discrepancies = [];

  for (const [key, ver] of Object.entries(versions)) {
    if (ver !== canonical) {
      discrepancies.push(`${key}: ${ver} (expected ${canonical})`);
    }
  }

  return {
    valid: discrepancies.length === 0,
    canonical,
    versions,
    discrepancies
  };
}

export function syncVersions(targetVersion) {
  if (!targetVersion) {
    const rootPkg = JSON.parse(fs.readFileSync(FILES.rootPackage, "utf8"));
    targetVersion = rootPkg.version;
  }

  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(targetVersion)) {
    throw new Error(`Invalid semver version: ${targetVersion}`);
  }

  // 1. Root package.json
  const rootPkg = JSON.parse(fs.readFileSync(FILES.rootPackage, "utf8"));
  rootPkg.version = targetVersion;
  fs.writeFileSync(FILES.rootPackage, JSON.stringify(rootPkg, null, 2) + "\n", "utf8");

  // 2. Server package.json
  const serverPkg = JSON.parse(fs.readFileSync(FILES.serverPackage, "utf8"));
  serverPkg.version = targetVersion;
  fs.writeFileSync(FILES.serverPackage, JSON.stringify(serverPkg, null, 2) + "\n", "utf8");

  // 3. Extension package.json
  const extPkg = JSON.parse(fs.readFileSync(FILES.extensionPackage, "utf8"));
  extPkg.version = targetVersion;
  fs.writeFileSync(FILES.extensionPackage, JSON.stringify(extPkg, null, 2) + "\n", "utf8");

  // 4. Extension manifest.json
  const manifest = JSON.parse(fs.readFileSync(FILES.extensionManifest, "utf8"));
  manifest.version = targetVersion;
  fs.writeFileSync(FILES.extensionManifest, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  // 5. Shared package.json
  const sharedPkg = JSON.parse(fs.readFileSync(FILES.sharedPackage, "utf8"));
  sharedPkg.version = targetVersion;
  fs.writeFileSync(FILES.sharedPackage, JSON.stringify(sharedPkg, null, 2) + "\n", "utf8");

  // 6. Server schemas.js constant
  if (fs.existsSync(FILES.serverSchemas)) {
    const schemas = fs.readFileSync(FILES.serverSchemas, "utf8");
    const updated = schemas.replace(
      /export const APP_VERSION = ["'][^"']+["']/,
      `export const APP_VERSION = "${targetVersion}"`
    );
    fs.writeFileSync(FILES.serverSchemas, updated, "utf8");
  }

  // 7. Extension dist manifest if present
  if (fs.existsSync(FILES.extensionDistManifest)) {
    const distManifest = JSON.parse(fs.readFileSync(FILES.extensionDistManifest, "utf8"));
    distManifest.version = targetVersion;
    fs.writeFileSync(FILES.extensionDistManifest, JSON.stringify(distManifest, null, 2) + "\n", "utf8");
  }

  // 8. Update lockfiles using npm install --package-lock-only
  try {
    execFileSync("npm", ["install", "--package-lock-only"], { cwd: repoRoot, stdio: "ignore" });
    execFileSync("npm", ["install", "--package-lock-only"], { cwd: path.join(repoRoot, "server"), stdio: "ignore" });
    execFileSync("npm", ["install", "--package-lock-only"], { cwd: path.join(repoRoot, "extension"), stdio: "ignore" });
  } catch (err) {
    console.warn("[version:sync] Warning: Could not automatically update package-lock files:", err.message);
  }

  return targetVersion;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    const check = checkVersionConsistency();
    if (!check.valid) {
      console.error("[version:check] Version mismatch detected across monorepo:");
      for (const disc of check.discrepancies) {
        console.error(`  - ${disc}`);
      }
      process.exit(1);
    }
    console.log(`[version:check] All components verified consistent at v${check.canonical}.`);
  } else {
    const target = args[0] && !args[0].startsWith("-") ? args[0] : null;
    const synced = syncVersions(target);
    console.log(`[version:sync] Successfully synchronized all components to v${synced}.`);
  }
}
