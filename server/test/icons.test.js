import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { verifyPng, createPng } from "../generate-icons.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, "../../extension/icons");

function decodePng(buffer) {
  return new Promise((resolve, reject) => {
    new PNG().parse(buffer, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

test("Icons: generated icons have valid PNG signature [137,80,78,71,13,10,26,10]", () => {
  const expectedSig = [137, 80, 78, 71, 13, 10, 26, 10];
  const sizes = [16, 48, 128];

  for (const size of sizes) {
    const file = path.join(iconsDir, `icon-${size}.png`);
    assert.ok(fs.existsSync(file), `icon-${size}.png must exist`);
    const buf = fs.readFileSync(file);
    const sig = Array.from(buf.subarray(0, 8));
    assert.deepEqual(sig, expectedSig, `icon-${size}.png must have valid PNG signature`);
    assert.doesNotThrow(() => verifyPng(buf), `icon-${size}.png must have valid chunk CRCs`);
  }
});

test("Icons: real pngjs decoder parses icon-16, icon-48, icon-128 and verifies dimensions", async () => {
  const sizes = [16, 48, 128];
  for (const size of sizes) {
    const file = path.join(iconsDir, `icon-${size}.png`);
    const buf = fs.readFileSync(file);
    const parsed = await decodePng(buf);
    assert.equal(parsed.width, size, `icon-${size}.png width must be ${size}`);
    assert.equal(parsed.height, size, `icon-${size}.png height must be ${size}`);
  }
});

test("Icons: invalid signature (e.g. byte 72 instead of 71) fails decoder and verifier", async () => {
  const buf = createPng(16, 16);
  // Corrupt the 4th byte to 72
  const corrupted = Buffer.from(buf);
  corrupted[3] = 72;

  assert.throws(() => verifyPng(corrupted), /Invalid PNG signature/);
  await assert.rejects(decodePng(corrupted));
});
