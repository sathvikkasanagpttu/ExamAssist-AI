import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "sandbox") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(fullPath);
    else if (/\.(m?js)$/.test(entry.name)) files.push(fullPath);
  }
}

await collect(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`${path.relative(root, file)}\n${result.stderr || result.stdout}`);
  }
}
if (failed) process.exitCode = 1;
else process.stdout.write(`Syntax check passed for ${files.length} JavaScript files.\n`);
