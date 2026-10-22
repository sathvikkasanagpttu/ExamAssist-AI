#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDistDir = path.resolve(__dirname, "../extension/dist");

export function verifyDist(distDir = defaultDistDir) {
  const manifestPath = path.join(distDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`dist/manifest.json not found at ${manifestPath}. Run build first.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const referencedFiles = new Set();

  // Icons
  if (manifest.icons) {
    Object.values(manifest.icons).forEach(iconPath => referencedFiles.add(iconPath));
  }

  // Background service worker
  if (manifest.background?.service_worker) {
    referencedFiles.add(manifest.background.service_worker);
  }

  // Side panel
  if (manifest.side_panel?.default_path) {
    referencedFiles.add(manifest.side_panel.default_path);
  }

  // Action popup & icons
  if (manifest.action) {
    if (manifest.action.default_popup) {
      referencedFiles.add(manifest.action.default_popup);
    }
    if (manifest.action.default_icon) {
      if (typeof manifest.action.default_icon === "string") {
        referencedFiles.add(manifest.action.default_icon);
      } else if (typeof manifest.action.default_icon === "object") {
        Object.values(manifest.action.default_icon).forEach(iconPath => referencedFiles.add(iconPath));
      }
    }
  }

  // Options page
  if (manifest.options_page) {
    referencedFiles.add(manifest.options_page);
  }

  // Content scripts
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.js)) {
        cs.js.forEach(jsFile => referencedFiles.add(jsFile));
      }
      if (Array.isArray(cs.css)) {
        cs.css.forEach(cssFile => referencedFiles.add(cssFile));
      }
    }
  }

  // Web accessible resources
  if (Array.isArray(manifest.web_accessible_resources)) {
    for (const war of manifest.web_accessible_resources) {
      if (Array.isArray(war.resources)) {
        war.resources.forEach(r => referencedFiles.add(r));
      }
    }
  }

  const missing = [];
  for (const ref of referencedFiles) {
    const fullPath = path.join(distDir, ref);
    if (!fs.existsSync(fullPath)) {
      missing.push(ref);
    }
  }

  if (missing.length > 0) {
    const errorMsg = `[verify-dist] FAILED: Missing ${missing.length} referenced files in ${distDir}:\n${missing.map(f => `  - ${f}`).join("\n")}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log(`[verify-dist] PASSED: All ${referencedFiles.size} referenced files verified in dist.`);
  return {
    verifiedFiles: Array.from(referencedFiles),
    manifest
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    verifyDist();
  } catch (err) {
    process.exit(1);
  }
}
