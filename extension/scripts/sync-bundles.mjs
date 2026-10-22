import { build } from "vite";
import preact from "@preact/preset-vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const entries = [
  { name: "content", input: "src/content.ts", out: "content.js" },
  { name: "sidepanel", input: "src/sidepanel/main.tsx", out: "sidepanel.js" },
  { name: "service-worker", input: "src/service-worker.ts", out: "service-worker.js" },
  { name: "popup", input: "src/popup.ts", out: "popup.js" },
  { name: "options", input: "src/options.ts", out: "options.js" }
];

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

for (const entry of entries) {
  await build({
    root: rootDir,
    configFile: false,
    logLevel: "warn",
    plugins: [preact()],
    resolve: {
      alias: {
        "@examassist/shared": path.resolve(rootDir, "../shared/schemas.js")
      }
    },
    build: {
      outDir: path.join(distDir, entry.name),
      emptyOutDir: true,
      sourcemap: false,
      minify: false,
      lib: {
        entry: path.resolve(rootDir, entry.input),
        name: `ExamAssist_${entry.name.replace(/[^a-zA-Z0-9]/g, "_")}`,
        formats: ["iife"],
        fileName: () => entry.out
      }
    }
  });

  const builtFile = path.join(distDir, entry.name, entry.out);
  const targetDist = path.join(distDir, entry.out);
  const targetRoot = path.join(rootDir, entry.out);
  fs.copyFileSync(builtFile, targetDist);
  fs.copyFileSync(builtFile, targetRoot);
  fs.rmSync(path.join(distDir, entry.name), { recursive: true, force: true });
}

// Ensure manifest.json version is synced with extension package.json
const extPkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const manifestPath = path.join(rootDir, "manifest.json");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.version !== extPkg.version) {
    manifest.version = extPkg.version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`[build] Synced manifest.json version to ${extPkg.version}`);
  }
}

// Copy icons directory to dist
const iconsSrc = path.join(rootDir, "icons");
const iconsDist = path.join(distDir, "icons");
if (fs.existsSync(iconsSrc)) {
  fs.cpSync(iconsSrc, iconsDist, { recursive: true });
  console.log("[build] Copied icons to dist/icons");
}

for (const staticFile of ["manifest.json", "popup.html", "options.html", "sidepanel.html", "content.css"]) {
  const src = path.join(rootDir, staticFile);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, staticFile));
  }
}

// Ensure manifest in dist is formatted and valid
const distManifestPath = path.join(distDir, "manifest.json");
if (fs.existsSync(distManifestPath)) {
  const distManifest = JSON.parse(fs.readFileSync(distManifestPath, "utf8"));
  distManifest.version = extPkg.version;
  fs.writeFileSync(distManifestPath, JSON.stringify(distManifest, null, 2) + "\n", "utf8");
}

console.log("[build] Built self-contained MV3 bundles for content, sidepanel, service-worker, popup, and options.");
