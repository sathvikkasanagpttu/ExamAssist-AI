/**
 * ExamAssist AI - In-Page Shadow DOM UI Module (Preact + Tailwind)
 * Renders all in-page UI inside a Shadow DOM root (#examai-shadow-host).
 *
 * HARD RULES:
 * - Never writes into the page's editors or dispatches synthetic typing events.
 * - Keeps Practice Mode / Authorized Assessment Mode gate.
 * - Lazy 4-level hint ladder (fetches one level per click; Level 4 is not in DOM until requested).
 */

import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import type { ExtractedAssessmentQuestion } from "../extractors";
import { extractCodingProblem, ExtractionManager, parseQuestionAndOptions } from "../extractors";
import {
  getApiBaseUrl,
  getStorageConfig,
  setStorageConfig,
  streamAssessmentAnalysis,
  captureAndCropVisibleRegion,
  requestVisionExtraction,
  type VisionExtractResponse
} from "../messaging";
import { SHADOW_DOM_STYLES } from "./shadowStyles";

export const SHADOW_HOST_ID = "examai-shadow-host";
export const PANEL_ID = "examai-panel";
export const FLOAT_BTN_ID = "examai-floating-btn";

interface FloatingTriggerState {
  visible: boolean;
  top: number;
  left: number;
  captured: ExtractedAssessmentQuestion | null;
}

interface OverlayProps {
  initialTrigger: FloatingTriggerState;
  initialPanelOpen: boolean;
  initialCaptured: ExtractedAssessmentQuestion | null;
  autoRunToken: number;
}

let currentProps: OverlayProps = {
  initialTrigger: { visible: false, top: 0, left: 0, captured: null },
  initialPanelOpen: false,
  initialCaptured: null,
  autoRunToken: 0
};

function formatDirectAnswer(directAnswer: unknown, fullResult?: Record<string, unknown> | null): string {
  if (directAnswer) {
    if (typeof directAnswer === "string" && directAnswer.trim()) return directAnswer.trim();
    if (typeof directAnswer === "object") {
      const obj = directAnswer as { option?: string; text?: string };
      const formatted = `${obj.option ? obj.option + ". " : ""}${obj.text || ""}`.trim();
      if (formatted) return formatted;
    }
  }
  const fallbackText = String(fullResult?.directAnswerText || fullResult?.ownSolution || "").trim();
  return fallbackText;
}

function InPageOverlayApp(props: OverlayProps) {
  const [trigger, setTrigger] = useState<FloatingTriggerState>(props.initialTrigger);
  const [panelOpen, setPanelOpen] = useState<boolean>(props.initialPanelOpen);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mode, setMode] = useState<"Practice Mode" | "Authorized Assessment Mode">("Practice Mode");
  const [authorizedRevealed, setAuthorizedRevealed] = useState<boolean>(false);

  const [questionText, setQuestionText] = useState<string>(props.initialCaptured?.question || "");
  const [optionsText, setOptionsText] = useState<string>((props.initialCaptured?.options || []).join("\n"));
  const [codeSnippet, setCodeSnippet] = useState<string>(props.initialCaptured?.codeSnippet || "");
  const [, setLanguage] = useState<string>("python");

  const [streaming, setStreaming] = useState<boolean>(false);
  const [streamStage, setStreamStage] = useState<string>("");
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [errorState, setErrorState] = useState<{ code?: string; message: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState<string>("📋 Copy Answer");

  // User-triggered Vision + OCR states
  const [selectingRegion, setSelectingRegion] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [visionPreview, setVisionPreview] = useState<{
    croppedDataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [visionLoading, setVisionLoading] = useState<boolean>(false);
  const [visionMeta, setVisionMeta] = useState<VisionExtractResponse | null>(null);

  useEffect(() => {
    getStorageConfig({ theme: "dark", mode: "Practice Mode" }).then((cfg) => {
      if (cfg.theme === "light" || cfg.theme === "dark") setTheme(cfg.theme);
      if (cfg.mode === "Practice Mode" || cfg.mode === "Authorized Assessment Mode") setMode(cfg.mode);
    });
  }, []);

  useEffect(() => {
    setTrigger(props.initialTrigger);
  }, [props.initialTrigger]);

  useEffect(() => {
    setPanelOpen(props.initialPanelOpen);
  }, [props.initialPanelOpen]);

  useEffect(() => {
    if (props.initialCaptured) {
      const cap = props.initialCaptured;
      setQuestionText(cap.question || "");
      setOptionsText((cap.options || []).join("\n"));
      setCodeSnippet(cap.codeSnippet || "");
      if (props.autoRunToken > 0) {
        void runAnalyze(cap.question, cap.options || [], cap.codeSnippet || "");
      }
    }
  }, [props.autoRunToken, props.initialCaptured]);

  async function runAnalyze(qOverride?: string, optsOverride?: string[], codeOverride?: string) {
    const rawInput = (qOverride !== undefined ? qOverride : questionText).trim();
    const parsedInline = parseQuestionAndOptions(rawInput);
    const manualOpts =
      optsOverride !== undefined
        ? optsOverride
        : optionsText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
    const opts = manualOpts.length > 0 ? manualOpts : parsedInline.options;
    const q = (manualOpts.length > 0 ? rawInput : parsedInline.question || rawInput).trim();
    const code = codeOverride !== undefined ? codeOverride : codeSnippet;

    if (q.length < 3) {
      setErrorState({ code: "EMPTY_QUESTION", message: "Please enter or select a question with at least 3 characters." });
      return;
    }

    abortCtrl?.abort();
    const controller = new AbortController();
    setAbortCtrl(controller);
    setStreaming(true);
    setStreamStage("Generating answer...");
    setErrorState(null);
    setResult(null);
    setAuthorizedRevealed(false);

    try {
      const apiBase = await getApiBaseUrl();
      const identity = await getStorageConfig({ localUserId: "" });
      let userId = identity.localUserId;
      if (!userId) {
        userId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`;
        await setStorageConfig({ localUserId: userId });
      }

      const data = await streamAssessmentAnalysis({
        request: {
          question: q,
          options: opts,
          codeSnippet: code,
          tableData: "",
          mathFormula: "",
          context: "",
          maxSources: 5,
          mode
        },
        apiBase,
        localUserId: userId,
        signal: controller.signal,
        onProgress: (p) => {
          setStreamStage(p.label);
        }
      });

      setResult(data);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.name === "AbortError") {
        setErrorState({ code: "CANCELLED", message: "Analysis cancelled by user. No answer was generated." });
      } else if (e.message?.toLowerCase().includes("failed to fetch")) {
        const apiBase = await getApiBaseUrl().catch(() => "http://localhost:8787");
        setErrorState({
          code: "CONNECTION_FAILED",
          message: `Cannot connect to ExamAssist backend at ${apiBase}. Ensure 'npm start' is running in the server directory.`
        });
      } else {
        setErrorState({ code: e.code || "ERROR", message: e.message || "Request failed." });
      }
    } finally {
      setStreaming(false);
      setAbortCtrl(null);
    }
  }

  function handleCancelStream() {
    abortCtrl?.abort();
  }

  function handleExtractPageCoding() {
    const extracted = extractCodingProblem(document);
    const manager = new ExtractionManager();
    const pageExtracted = manager.extract(document.activeElement, document);

    const nextQ = extracted.statement || pageExtracted?.question || "";
    const nextOpts = pageExtracted?.options || [];
    const nextCode = extracted.starterCode || pageExtracted?.codeSnippet || "";

    if (nextQ) setQuestionText(nextQ);
    if (nextOpts.length > 0) setOptionsText(nextOpts.join("\n"));
    if (nextCode) setCodeSnippet(nextCode);
    if (extracted.language) setLanguage(extracted.language);

    if (nextQ.trim().length >= 3) {
      void runAnalyze(nextQ, nextOpts, nextCode);
    }
  }

  async function extractAndSolveImage(imageDataUrl: string, mimeType: string) {
    setVisionLoading(true);
    setErrorState(null);
    setStreaming(true);
    setStreamStage("Extracting question from uploaded image...");
    try {
      const apiBase = await getApiBaseUrl();
      const res = await requestVisionExtraction(
        {
          imageDataUrl,
          mimeType: (mimeType || "image/png") as "image/png" | "image/jpeg" | "image/webp",
          hintContext: document.title || ""
        },
        apiBase
      );
      setVisionMeta(res);
      setVisionPreview(null);
      const q = (res.extractedQuestion || res.extractedCode || "").trim();
      const opts = res.extractedOptions || [];
      const code = res.extractedCode || "";
      if (q) setQuestionText(q);
      if (opts.length) setOptionsText(opts.join("\n"));
      if (code) setCodeSnippet(code);
      if (res.detectedLanguage) setLanguage(res.detectedLanguage);

      if (q.length >= 3) {
        await runAnalyze(q, opts, code);
      } else {
        setStreaming(false);
        setErrorState({
          code: "VISION_EMPTY",
          message: "Could not detect a readable question in the image. Please try a clearer image or paste the question."
        });
      }
    } catch (err) {
      setStreaming(false);
      const e = err as Error & { code?: string };
      setErrorState({ code: e.code || "VISION_ERROR", message: e.message || "Vision extraction failed." });
    } finally {
      setVisionLoading(false);
    }
  }

  function handleUploadQuestionFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl) {
          void extractAndSolveImage(dataUrl, file.type || "image/png");
        }
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "").trim();
        if (text) {
          const parsed = parseQuestionAndOptions(text);
          const q = parsed.question || text;
          const opts = parsed.options || [];
          setQuestionText(q);
          if (opts.length > 0) setOptionsText(opts.join("\n"));
          void runAnalyze(q, opts, codeSnippet);
        }
      };
      reader.readAsText(file);
    }
  }

  function handleStartRegionSelect() {
    setErrorState(null);
    setVisionPreview(null);
    setVisionMeta(null);
    setDragStart(null);
    setDragCurrent(null);
    setSelectingRegion(true);
  }

  async function handleFinishRegionSelect(start: { x: number; y: number }, end: { x: number; y: number }) {
    setSelectingRegion(false);
    setDragStart(null);
    setDragCurrent(null);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.max(24, Math.abs(end.x - start.x));
    const height = Math.max(24, Math.abs(end.y - start.y));
    const cropped = await captureAndCropVisibleRegion({ x, y, width, height });
    setVisionPreview(cropped);
    void extractAndSolveImage(cropped.croppedDataUrl, "image/png");
  }

  async function handleSendVisionPreview() {
    if (!visionPreview) return;
    await extractAndSolveImage(visionPreview.croppedDataUrl, "image/png");
  }

  const answerStr = result ? formatDirectAnswer(result.directAnswer, result) : "";
  const confidence = String(result?.confidence || "UNVERIFIED");

  return (
    <div>
      {selectingRegion && (
        <div
          id="examai-region-selector"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            background: "rgba(15, 23, 42, 0.35)",
            cursor: "crosshair",
            userSelect: "none"
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const pt = { x: e.clientX, y: e.clientY };
            setDragStart(pt);
            setDragCurrent(pt);
          }}
          onMouseMove={(e) => {
            if (!dragStart) return;
            e.preventDefault();
            setDragCurrent({ x: e.clientX, y: e.clientY });
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const start = dragStart || { x: Math.max(0, e.clientX - 160), y: Math.max(0, e.clientY - 90) };
            const end = { x: e.clientX, y: e.clientY };
            void handleFinishRegionSelect(start, end);
          }}
        >
          <div
            style={{
              position: "fixed",
              top: "14px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#0f172a",
              color: "#e2e8f0",
              border: "1px solid #38bdf8",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "12px",
              display: "flex",
              gap: "10px",
              alignItems: "center"
            }}
          >
            <span>Drag a rectangle over the diagram, equation, table, or code to capture locally</span>
            <button
              id="examai-cancel-region-select"
              className="examai-btn danger"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setSelectingRegion(false);
                setDragStart(null);
                setDragCurrent(null);
              }}
            >
              Cancel
            </button>
          </div>
          {dragStart && dragCurrent && (
            <div
              id="examai-region-box"
              style={{
                position: "fixed",
                left: `${Math.min(dragStart.x, dragCurrent.x)}px`,
                top: `${Math.min(dragStart.y, dragCurrent.y)}px`,
                width: `${Math.max(4, Math.abs(dragCurrent.x - dragStart.x))}px`,
                height: `${Math.max(4, Math.abs(dragCurrent.y - dragStart.y))}px`,
                border: "2px dashed #38bdf8",
                background: "rgba(56, 189, 248, 0.14)",
                pointerEvents: "none"
              }}
            />
          )}
        </div>
      )}

      {trigger.visible && trigger.captured && (
        <button
          id={FLOAT_BTN_ID}
          className="examai-floating-trigger"
          style={{ top: `${trigger.top}px`, left: `${trigger.left}px` }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const cap = trigger.captured!;
            setTrigger({ visible: false, top: 0, left: 0, captured: null });
            setPanelOpen(true);
            setQuestionText(cap.question);
            setOptionsText((cap.options || []).join("\n"));
            setCodeSnippet(cap.codeSnippet || "");
            void runAnalyze(cap.question, cap.options || [], cap.codeSnippet || "");
          }}
        >
          <span>⚡ ExamAssist AI</span>
        </button>
      )}

      {panelOpen && (
        <aside id={PANEL_ID} className={`examai-panel ${theme === "light" ? "light" : ""}`} role="dialog" aria-label="ExamAssist AI Panel">
          <div className="examai-head">
            <div className="examai-brand">
              <span>⚡ ExamAssist AI</span>
            </div>
            <div className="examai-actions">
              <select
                id="examai-mode-select"
                className="examai-select"
                style={{ width: "auto" }}
                value={mode}
                onChange={(e) => {
                  const nextMode = (e.target as HTMLSelectElement).value as "Practice Mode" | "Authorized Assessment Mode";
                  setMode(nextMode);
                  setAuthorizedRevealed(false);
                  void setStorageConfig({ mode: nextMode });
                }}
              >
                <option value="Practice Mode">Practice Mode</option>
                <option value="Authorized Assessment Mode">Authorized Mode</option>
              </select>
              <button
                id="examai-theme-toggle"
                className="examai-btn"
                title="Toggle theme"
                onClick={() => {
                  const next = theme === "dark" ? "light" : "dark";
                  setTheme(next);
                  void setStorageConfig({ theme: next });
                }}
              >
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
              <button id="examai-close" className="examai-btn" title="Close" onClick={() => setPanelOpen(false)}>
                ✕
              </button>
            </div>
          </div>

          <div className="examai-body">
            {visionPreview && (
              <div id="examai-vision-preview-card" className="examai-card" style={{ borderColor: "#38bdf8" }}>
                <strong style={{ fontSize: "11px", color: "#38bdf8", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                  📷 Local Region Preview ({visionPreview.width}×{visionPreview.height}px)
                </strong>
                <p style={{ fontSize: "11px", color: "#94a3b8", margin: "0 0 6px 0" }}>
                  Cropped locally in browser. Nothing leaves your browser until you click Send to OCR. Images are never stored or logged.
                </p>
                <img
                  id="examai-vision-preview-img"
                  src={visionPreview.croppedDataUrl}
                  alt="Captured region preview"
                  style={{ maxWidth: "100%", maxHeight: "140px", borderRadius: "6px", border: "1px solid #334155", display: "block", marginBottom: "8px" }}
                />
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    id="examai-vision-send-btn"
                    className="examai-btn primary"
                    disabled={visionLoading}
                    onClick={() => void handleSendVisionPreview()}
                  >
                    {visionLoading ? "⏳ Extracting OCR..." : "📤 Send to OCR"}
                  </button>
                  <button
                    id="examai-vision-cancel-btn"
                    className="examai-btn danger"
                    disabled={visionLoading}
                    onClick={() => setVisionPreview(null)}
                  >
                    ✕ Cancel
                  </button>
                </div>
              </div>
            )}

            {visionMeta && (
              <div
                id="examai-vision-meta-card"
                className="examai-card"
                style={{ borderColor: "#10b981" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "11px", color: "#e2e8f0" }}>
                    OCR Confidence: {Math.round(visionMeta.ocrConfidence * 100)}% ({visionMeta.ocrEngine})
                  </strong>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>Image not stored</span>
                </div>
                {visionMeta.diagramSummary && (
                  <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "4px" }}>
                    Diagram/Table: {visionMeta.diagramSummary}
                  </div>
                )}
              </div>
            )}

            {visionMeta?.requiresUserConfirmation && (
              <div id="examai-low-ocr-banner" className="examai-card" style={{ borderColor: "#f59e0b" }}>
                <strong style={{ color: "#fbbf24" }}>
                  ⚠️ Low OCR Confidence ({Math.round((visionMeta.ocrConfidence || 0) * 100)}%)
                </strong>
                <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "4px" }}>
                  Please verify the extracted text below and click to re-solve if you made edits:
                </div>
                <button
                  id="examai-confirm-ocr-btn"
                  className="examai-btn primary"
                  style={{ marginTop: "6px" }}
                  onClick={() => {
                    setVisionMeta({ ...visionMeta, requiresUserConfirmation: false });
                    void runAnalyze();
                  }}
                >
                  ✅ Confirm & Re-Solve
                </button>
              </div>
            )}

            <div className="examai-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", gap: "4px", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase" }}>
                  Question (Upload, Capture, or Paste to Get Answer)
                </strong>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  <label
                    id="examai-upload-btn"
                    className="examai-btn"
                    style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", margin: 0 }}
                  >
                    📤 Upload Question
                    <input
                      id="examai-upload-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,.txt,.md"
                      style={{ display: "none" }}
                      onChange={handleUploadQuestionFile}
                    />
                  </label>
                  <button id="examai-capture-region-btn" className="examai-btn" onClick={handleStartRegionSelect}>
                    📷 Capture Region
                  </button>
                  <button id="examai-extract-coding" className="examai-btn" onClick={handleExtractPageCoding}>
                    🔍 Extract Page
                  </button>
                </div>
              </div>
              <textarea
                id="examai-edit-question"
                className="examai-textarea"
                value={questionText}
                onInput={(e) => setQuestionText((e.target as HTMLTextAreaElement).value)}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (items) {
                    for (let i = 0; i < items.length; i++) {
                      const item = items[i];
                      if (item.type.startsWith("image/")) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const dataUrl = String(reader.result || "");
                            if (dataUrl) void extractAndSolveImage(dataUrl, file.type || "image/png");
                          };
                          reader.readAsDataURL(file);
                        }
                        return;
                      }
                    }
                  }
                  const pastedText = e.clipboardData?.getData("text/plain")?.trim() || "";
                  if (pastedText.length >= 5) {
                    setTimeout(() => {
                      const parsed = parseQuestionAndOptions(pastedText);
                      const q = parsed.question || pastedText;
                      const opts = parsed.options || [];
                      setQuestionText(q);
                      if (opts.length > 0) setOptionsText(opts.join("\n"));
                      void runAnalyze(q, opts, codeSnippet);
                    }, 20);
                  }
                }}
                placeholder="Paste or upload a question (or image screenshot) to get the answer immediately..."
              />
              <textarea
                id="examai-edit-options"
                className="examai-textarea"
                style={{ marginTop: "6px", minHeight: "44px" }}
                value={optionsText}
                onInput={(e) => setOptionsText((e.target as HTMLTextAreaElement).value)}
                placeholder="Options (one per line, optional)..."
              />
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <button
                  id="examai-reanalyze-btn"
                  className="examai-btn primary"
                  disabled={streaming}
                  onClick={() => void runAnalyze()}
                >
                  🚀 {streaming ? "Getting Answer..." : "Get Answer"}
                </button>
                {streaming && (
                  <button id="examai-cancel-stream" className="examai-btn danger" onClick={handleCancelStream}>
                    ⏹ Cancel
                  </button>
                )}
              </div>
            </div>

            {streaming && (
              <div id="examai-stream-status" className="examai-card" style={{ borderColor: "#0284c7" }}>
                <strong id="examai-stream-stage" style={{ color: "#38bdf8" }}>
                  ⏳ {streamStage}
                </strong>
              </div>
            )}

            {errorState && (
              <div id="examai-error-banner" className="examai-error" data-error-code={errorState.code}>
                <strong style={{ display: "block", marginBottom: "4px" }}>
                  {errorState.code === "CANCELLED"
                    ? "Analysis Cancelled"
                    : errorState.code === "AI_NOT_CONFIGURED"
                    ? "⚠️ AI Key Not Configured"
                    : errorState.code === "AI_RATE_LIMITED"
                    ? "⚠️ API Credits / Quota Exhausted"
                    : errorState.code === "CONNECTION_FAILED"
                    ? "⚠️ Backend Offline"
                    : "Assessment Error"}
                </strong>
                <span>{errorState.message}</span>
              </div>
            )}

            {result && (
              <div id="examai-result-card" className="examai-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span id="examai-confidence-badge" className={`examai-badge ${confidence}`}>
                    Confidence: {confidence}
                  </span>
                  <button
                    id="examai-copy-btn"
                    className="examai-btn"
                    onClick={() => {
                      navigator.clipboard?.writeText(answerStr);
                      setCopyStatus("✓ Copied");
                      setTimeout(() => setCopyStatus("📋 Copy Answer"), 1400);
                    }}
                  >
                    {copyStatus}
                  </button>
                </div>

                {mode === "Authorized Assessment Mode" && !authorizedRevealed ? (
                  <div id="examai-auth-gate" className="examai-notice">
                    <strong>Authorized Assessment Mode Notice:</strong> Confirm that viewing the full solution is permitted for this assessment.
                    <div style={{ marginTop: "6px" }}>
                      <button
                        id="examai-reveal-auth-sol"
                        className="examai-btn primary"
                        onClick={() => setAuthorizedRevealed(true)}
                      >
                        Show Full Solution
                      </button>
                    </div>
                  </div>
                ) : (
                  <div id="examai-solution-view">
                    <div id="examai-direct-answer" style={{ fontWeight: 700, fontSize: "14px", color: "#38bdf8", marginBottom: "6px", whiteSpace: "pre-wrap" }}>
                      {answerStr}
                    </div>
                    {typeof result.ownSolution === "string" &&
                      result.ownSolution.trim() &&
                      result.ownSolution.trim() !== answerStr &&
                      result.ownSolution.trim() !== String(result.explanation || "").trim() && (
                        <div
                          id="examai-own-solution"
                          style={{
                            fontSize: "12.5px",
                            whiteSpace: "pre-wrap",
                            background: "rgba(15, 23, 42, 0.55)",
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid rgba(148, 163, 184, 0.25)",
                            marginBottom: "8px",
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
                          }}
                        >
                          {result.ownSolution}
                        </div>
                      )}
                    <div id="examai-explanation" style={{ fontSize: "12.5px", whiteSpace: "pre-wrap", marginBottom: "6px" }}>
                      {String(result.explanation || "")}
                    </div>
                    {Array.isArray(result.reasoningSteps) && result.reasoningSteps.length > 0 && (
                      <div id="examai-reasoning-steps" style={{ fontSize: "12px", marginTop: "6px" }}>
                        <strong style={{ color: "#94a3b8" }}>Reasoning Steps:</strong>
                        <ol style={{ margin: "4px 0 0 18px", padding: 0 }}>
                          {(result.reasoningSteps as string[]).map((step, idx) => (
                            <li key={idx} style={{ marginBottom: "2px" }}>
                              {String(step)}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {Array.isArray(result.optionAnalysis) && result.optionAnalysis.length > 0 && (
                      <div id="examai-option-analysis" style={{ fontSize: "12px", marginTop: "6px" }}>
                        <strong style={{ color: "#94a3b8" }}>Option Analysis:</strong>
                        <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                          {(
                            result.optionAnalysis as Array<{
                              option?: string;
                              text?: string;
                              correct?: boolean;
                              isCorrect?: boolean;
                              reason?: string;
                              analysis?: string;
                            }>
                          ).map((opt, idx) => (
                            <li key={idx} style={{ marginBottom: "2px" }}>
                              <strong>
                                {opt.option ? `${opt.option}. ` : ""}
                                {opt.text || ""}
                              </strong>{" "}
                              {opt.correct || opt.isCorrect ? "✅ " : "❌ "}
                              {opt.reason || opt.analysis || ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {typeof result.confidenceReason === "string" && result.confidenceReason.trim() && (
                      <div id="examai-confidence-reason" style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}>
                        {result.confidenceReason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

export function ensureShadowOverlayRoot(doc: Document = document): ShadowRoot {
  let host = doc.getElementById(SHADOW_HOST_ID);
  if (!host) {
    host = doc.createElement("div");
    host.id = SHADOW_HOST_ID;
    doc.body.appendChild(host);
  }
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  if (!shadow.querySelector("style[data-examai-shadow-styles]")) {
    const styleEl = doc.createElement("style");
    styleEl.setAttribute("data-examai-shadow-styles", "true");
    styleEl.textContent = SHADOW_DOM_STYLES;
    shadow.appendChild(styleEl);
  }
  let mountNode = shadow.querySelector("#examai-shadow-mount");
  if (!mountNode) {
    mountNode = doc.createElement("div");
    mountNode.id = "examai-shadow-mount";
    shadow.appendChild(mountNode);
  }
  render(<InPageOverlayApp {...currentProps} />, mountNode);
  return shadow;
}

function updateOverlay(next: Partial<OverlayProps>): void {
  currentProps = { ...currentProps, ...next };
  ensureShadowOverlayRoot(document);
}

export function showInPageFloatingTrigger(range: Range, captured: ExtractedAssessmentQuestion): void {
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return;
  const top = window.scrollY + rect.bottom + 8;
  const left = Math.max(10, Math.min(window.scrollX + rect.left, window.innerWidth - 180));
  updateOverlay({
    initialTrigger: { visible: true, top, left, captured }
  });
}

export function hideInPageFloatingTrigger(): void {
  if (!document.getElementById(SHADOW_HOST_ID)) return;
  updateOverlay({
    initialTrigger: { visible: false, top: 0, left: 0, captured: null }
  });
}

export function openInPageOverlayAndAnalyze(captured: ExtractedAssessmentQuestion): void {
  updateOverlay({
    initialTrigger: { visible: false, top: 0, left: 0, captured: null },
    initialPanelOpen: true,
    initialCaptured: captured,
    autoRunToken: Date.now()
  });
}

export function isEventFromShadowOverlay(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Node)) return false;
  const host = document.getElementById(SHADOW_HOST_ID);
  if (!host) return false;
  return target === host || host.contains(target);
}
