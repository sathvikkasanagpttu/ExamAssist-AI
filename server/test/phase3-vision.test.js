/**
 * Phase 3 Unit & Integration Tests: Vision + OCR (User-Triggered)
 * Tests:
 * 1. Size, MIME-type, and binary magic-byte validation (PNG, JPEG, WEBP, SVG rejection, >4MB rejection, spoofed header rejection)
 * 2. In-memory OCR + multimodal vision extraction for diagrams, tables, equations, and code screenshots
 * 3. Low OCR confidence (< 0.75) triggers requiresUserConfirmation = true
 * 4. Zero image storage or logging (imagePersisted === false, redacted in mock/trace)
 * 5. HTTP POST /api/vision/extract endpoint & Extension Capture Region + Preview Send/Cancel verification
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateAndDecodeVisionImage,
  extractFromVisionRegion,
  VisionValidationError,
  MAX_VISION_IMAGE_BYTES
} from "../pipeline/visionExtractor.js";
import { AIClient } from "../aiClient.js";
import { VisionExtractRequestSchema, RuntimeMessageEnvelopeSchema } from "../../shared/schemas.js";
import app from "../server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal valid 1x1 PNG binary
const VALID_PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);
const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG_BYTES.toString("base64")}`;

// Minimal valid JPEG header + EOI (>= 12 bytes)
const VALID_JPEG_BYTES = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");
const VALID_JPEG_DATA_URL = `data:image/jpeg;base64,${VALID_JPEG_BYTES.toString("base64")}`;

// Minimal valid WEBP header (RIFF....WEBP)
const VALID_WEBP_BYTES = Buffer.from("524946461400000057454250565038200800000000000000", "hex");
const VALID_WEBP_DATA_URL = `data:image/webp;base64,${VALID_WEBP_BYTES.toString("base64")}`;

test("Phase 3.1: validateAndDecodeVisionImage enforces MIME type, magic bytes, and 4MB size limit", () => {
  // Valid PNG, JPEG, WEBP pass
  const png = validateAndDecodeVisionImage(VALID_PNG_DATA_URL);
  assert.equal(png.mimeType, "image/png");
  assert.equal(png.byteLength, VALID_PNG_BYTES.byteLength);

  const jpg = validateAndDecodeVisionImage(VALID_JPEG_DATA_URL);
  assert.equal(jpg.mimeType, "image/jpeg");

  const webp = validateAndDecodeVisionImage(VALID_WEBP_DATA_URL);
  assert.equal(webp.mimeType, "image/webp");

  // Unsupported MIME type (e.g., SVG / HTML) is rejected with 415 VISION_UNSUPPORTED_TYPE
  assert.throws(
    () => validateAndDecodeVisionImage("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="),
    (err) => err instanceof VisionValidationError && err.code === "VISION_UNSUPPORTED_TYPE" && err.status === 415
  );

  // Mismatched declared MIME vs data URL MIME is rejected with 400 VISION_MIME_MISMATCH
  assert.throws(
    () => validateAndDecodeVisionImage(VALID_PNG_DATA_URL, "image/jpeg"),
    (err) => err instanceof VisionValidationError && err.code === "VISION_MIME_MISMATCH" && err.status === 400
  );

  // Spoofed magic bytes (text disguised as image/png) is rejected with 400 VISION_INVALID_IMAGE
  const spoofedPng = `data:image/png;base64,${Buffer.from("not-a-real-png-header-at-all").toString("base64")}`;
  assert.throws(
    () => validateAndDecodeVisionImage(spoofedPng),
    (err) => err instanceof VisionValidationError && err.code === "VISION_INVALID_IMAGE" && err.status === 400
  );

  // Oversized image (> 4MB) is rejected with 413 VISION_IMAGE_TOO_LARGE
  const oversizedBase64 = "A".repeat(Math.ceil(((MAX_VISION_IMAGE_BYTES + 1024) * 4) / 3));
  assert.throws(
    () => validateAndDecodeVisionImage(`data:image/png;base64,${oversizedBase64}`),
    (err) => err instanceof VisionValidationError && err.code === "VISION_IMAGE_TOO_LARGE" && err.status === 413
  );
});

test("Phase 3.2: extractFromVisionRegion combines OCR + Vision model and never persists images", async () => {
  let receivedImageArg = null;
  const mockAi = new AIClient({
    mockHandler: async (args) => {
      receivedImageArg = args.imageDataUrl;
      return JSON.stringify({
        extractedQuestion: "Given the state diagram below, compute $\\int_0^1 x^2 dx$ and the DP transition.",
        extractedCode: "def solve(n):\n    return n * (n + 1) // 2",
        extractedOptions: ["1/3", "1/2", "1"],
        detectedLanguage: "python",
        tables: ["| n | f(n) |\n|---|---|\n| 1 | 1 |"],
        equations: ["\\int_0^1 x^2 dx = \\frac{1}{3}"],
        diagramSummary: "3-state DFA with transitions on 0 and 1",
        visionConfidence: 0.94,
        uncertaintyNotes: ""
      });
    }
  });

  const mockOcrRunner = async () => ({
    available: true,
    engine: "tesseract",
    text: "Given the state diagram below compute x^2 dx",
    confidence: 0.88
  });

  const res = await extractFromVisionRegion(
    { imageDataUrl: VALID_PNG_DATA_URL, mimeType: "image/png", hintContext: "Quiz 4" },
    { aiClient: mockAi, ocrRunner: mockOcrRunner }
  );

  assert.equal(receivedImageArg, "[REDACTED_IMAGE]", "Mock handler must receive redacted image token");
  assert.equal(res.imagePersisted, false);
  assert.equal(res.editableBeforeAnalysis, true);
  assert.equal(res.requiresUserConfirmation, false);
  assert.ok(res.ocrConfidence >= 0.9);
  assert.equal(res.ocrEngine, "tesseract+vision-llm");
  assert.ok(res.extractedQuestion.includes("\\int_0^1 x^2 dx"));
  assert.ok(res.extractedCode.includes("def solve(n):"));
  assert.equal(res.extractedOptions.length, 3);
  assert.equal(res.tables.length, 1);
  assert.equal(res.equations.length, 1);
  assert.ok(res.diagramSummary.includes("DFA"));
});

test("Phase 3.3: Low OCR confidence (< 0.75) sets requiresUserConfirmation = true", async () => {
  const lowConfAi = new AIClient({
    mockHandler: async () =>
      JSON.stringify({
        extractedQuestion: "Blurry scan: find shortest path in weighted graph?",
        extractedCode: "",
        extractedOptions: [],
        detectedLanguage: "",
        tables: [],
        equations: [],
        diagramSummary: "Handwritten graph with unclear edge weights",
        visionConfidence: 0.58,
        uncertaintyNotes: "Edge weights between B and C are blurry."
      })
  });

  const lowConfOcr = async () => ({
    available: true,
    engine: "tesseract",
    text: "Blurry scan find shortest path",
    confidence: 0.52
  });

  const res = await extractFromVisionRegion(
    { imageDataUrl: VALID_PNG_DATA_URL },
    { aiClient: lowConfAi, ocrRunner: lowConfOcr }
  );

  assert.ok(res.ocrConfidence < 0.75, `Expected ocrConfidence < 0.75, got ${res.ocrConfidence}`);
  assert.equal(res.requiresUserConfirmation, true);
  assert.ok(res.uncertaintyNotes.includes("blurry"));
});

import { EventEmitter } from "node:events";

function dispatchRequest(expressApp, { method, url, body, headers: requestHeaders = {} }) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { "content-type": "application/json", ...requestHeaders };
    req.socket = { remoteAddress: "127.0.0.1" };
    req.connection = req.socket;
    req.body = body || {};
    req._body = true; // bypass stream read since req.body is pre-populated

    let statusCode = 200;
    const headers = {};
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      setHeader(k, v) {
        headers[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return headers[k.toLowerCase()] || "";
      },
      json(data) {
        resolve({ status: statusCode, body: data });
      },
      send(data) {
        resolve({ status: statusCode, body: data });
      },
      end() {
        resolve({ status: statusCode, body: null });
      }
    };

    expressApp.handle(req, res, (err) => {
      if (err) resolve({ status: 500, error: err.message });
      else resolve({ status: 404 });
    });
  });
}

test("Phase 3.4: POST /api/vision/extract validates MIME/magic-bytes and returns structured payload", async () => {
  // 1. Spoofed PNG header returns 400 VISION_INVALID_IMAGE
  const badRes = await dispatchRequest(app, {
    method: "POST",
    url: "/api/vision/extract",
    body: {
      imageDataUrl: `data:image/png;base64,${Buffer.from("spoofed-png-bytes-123456").toString("base64")}`
    }
  });
  assert.equal(badRes.status, 400);
  assert.equal(badRes.body.code, "VISION_INVALID_IMAGE");

  // 2. Unsupported MIME type returns 415 VISION_UNSUPPORTED_TYPE
  const svgRes = await dispatchRequest(app, {
    method: "POST",
    url: "/api/vision/extract",
    body: {
      imageDataUrl: `data:image/svg+xml;base64,${Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>").toString("base64")}`
    }
  });
  assert.equal(svgRes.status, 415);
  assert.equal(svgRes.body.code, "VISION_UNSUPPORTED_TYPE");
});

test("Phase 3.5: Extension UI & shared schemas enforce user-triggered Capture Region, Preview Send/Cancel, and Low-OCR Confirmation", () => {
  // Verify CAPTURE_VISIBLE_TAB is accepted by shared runtime message validator
  const parsedMsg = RuntimeMessageEnvelopeSchema.safeParse({ type: "CAPTURE_VISIBLE_TAB" });
  assert.equal(parsedMsg.success, true);

  // Verify VisionExtractRequestSchema validates input
  const parsedReq = VisionExtractRequestSchema.safeParse({
    imageDataUrl: VALID_PNG_DATA_URL,
    mimeType: "image/png"
  });
  assert.equal(parsedReq.success, true);

  // Verify extension UI source has region selector, local preview with Send/Cancel, and low-OCR confirmation
  const uiSource = fs.readFileSync(path.join(__dirname, "../../extension/src/ui/index.tsx"), "utf8");
  assert.ok(uiSource.includes('id="examai-capture-region-btn"'), "Must include Capture Region button");
  assert.ok(uiSource.includes('id="examai-region-selector"'), "Must include user-drawn rectangle selector");
  assert.ok(uiSource.includes('id="examai-vision-preview-card"'), "Must include local crop preview before sending");
  assert.ok(uiSource.includes('id="examai-vision-send-btn"'), "Must include Send to OCR button in preview");
  assert.ok(uiSource.includes('id="examai-vision-cancel-btn"'), "Must include Cancel button in preview");
  assert.ok(uiSource.includes('id="examai-low-ocr-banner"'), "Must include low-OCR-confidence confirmation banner");
  assert.ok(uiSource.includes('id="examai-confirm-ocr-btn"'), "Must require user click to confirm low-OCR text");
});
