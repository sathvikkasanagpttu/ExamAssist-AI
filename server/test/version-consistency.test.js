import { test } from "node:test";
import assert from "node:assert/strict";
import { checkVersionConsistency, getVersionMap } from "../../scripts/sync-versions.mjs";

test("Version Check: all package.json, lockfile, manifest, and shared package versions match current version", () => {
  const result = checkVersionConsistency();
  assert.equal(result.valid, true, `Version discrepancies found: ${result.discrepancies.join(", ")}`);
  assert.ok(result.canonical, "Expected canonical version to be defined");

  const map = getVersionMap();
  assert.equal(map.root, result.canonical);
  assert.equal(map.rootLock, result.canonical);
  assert.equal(map.server, result.canonical);
  assert.equal(map.serverLock, result.canonical);
  assert.equal(map.extension, result.canonical);
  assert.equal(map.extensionLock, result.canonical);
  assert.equal(map.manifest, result.canonical);
  assert.equal(map.shared, result.canonical);
  assert.equal(map.schemasConstant, result.canonical);
});

test("Version Check: detects discrepancy if any component drifts", () => {
  const versions = {
    root: "2.3.0",
    rootLock: "2.3.0",
    server: "2.2.0", // drifted!
    manifest: "2.3.0"
  };

  const canonical = versions.root;
  const discrepancies = [];
  for (const [k, v] of Object.entries(versions)) {
    if (v !== canonical) {
      discrepancies.push(`${k}: ${v} (expected ${canonical})`);
    }
  }

  assert.equal(discrepancies.length, 1);
  assert.match(discrepancies[0], /server: 2.2.0/);
});
