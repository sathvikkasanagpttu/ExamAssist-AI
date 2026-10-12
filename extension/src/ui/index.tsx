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
import { extractCodingProblem } from "../extractors";
import {
  getApiBaseUrl,
  getStorageConfig,
  setStorageConfig,
  streamAssessmentAnalysis,
  requestCodingHint,
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

function formatDirectAnswer(directAnswer: unknown): string {
  if (!directAnswer) return "";
  if (typeof directAnswer === "string") return directAnswer;
  if (typeof directAnswer === "object") {
    const obj = directAnswer as { option?: string; text?: string };
    return `${obj.option ? obj.option + ". " : ""}${obj.text || ""}`.trim();
  }
  return String(directAnswer);
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
  const [language, setLanguage] = useState<string>("python");

  const [streaming, setStreaming] = useState<boolean>(false);
  const [streamStage, setStreamStage] = useState<string>("");
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [errorState, setErrorState] = useState<{ code?: string; message: string } | null>(null);

  const [hintsByLevel, setHintsByLevel] = useState<Record<number, string>>({});
  const [activeHintLevel, setActiveHintLevel] = useState<number | null>(null);
  const [hintLoading, setHintLoading] = useState<boolean>(false);
  const [copyStatus, setCopyStatus] = useState<string>("📋 Copy Answer");

  // Phase 3: User-triggered Vision + OCR states
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
  const [lowOcrConfirmed, setLowOcrConfirmed] = useState<boolean>(true);

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
    if (visionMeta?.requiresUserConfirmation && !lowOcrConfirmed) {
      setErrorState({
        code: "LOW_OCR_CONFIDENCE_UNCONFIRMED",
        message: "Low OCR confidence detected. Please review the extracted text and click 'Confirm Extracted Text' before analyzing."
      });
      return;
    }
    const q = (qOverride !== undefined ? qOverride : questionText).trim();
    const opts =
      optsOverride !== undefined
        ? optsOverride
        : optionsText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
    const code = codeOverride !== undefined ? codeOverride : codeSnippet;

    if (q.length < 3) {
      setErrorState({ code: "EMPTY_QUESTION", message: "Please enter or select a question with at least 3 characters." });
      return;
    }

    abortCtrl?.abort();
    const controller = new AbortController();
    setAbortCtrl(controller);
    setStreaming(true);
    setStreamStage("Connecting to ExamAssist AI...");
    setErrorState(null);
    setResult(null);
    setHintsByLevel({});
    setActiveHintLevel(null);
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

  async function handleRequestHint(level: number) {
    const q = questionText.trim();
    if (q.length < 3) {
      setErrorState({ code: "EMPTY_QUESTION", message: "Enter or extract a problem statement before requesting a hint." });
      return;
    }
    setActiveHintLevel(level);
    if (hintsByLevel[level]) return;

    setHintLoading(true);
    try {
      const apiBase = await getApiBaseUrl();
      const res = await requestCodingHint(
        {
          question: q,
          userCode: codeSnippet,
          language,
          level,
          explanationLevel: "Technical"
        },
        apiBase
      );
      setHintsByLevel((prev) => ({ ...prev, [level]: res.activeHint }));
    } catch (err) {
      const e = err as Error;
      setHintsByLevel((prev) => ({ ...prev, [level]: `Hint error: ${e.message}` }));
    } finally {
      setHintLoading(false);
    }
  }

  function handleExtractPageCoding() {
    const extracted = extractCodingProblem(document);
    if (extracted.statement) setQuestionText(extracted.statement);
    if (extracted.starterCode) setCodeSnippet(extracted.starterCode);
    if (extracted.language) setLanguage(extracted.language);
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
  }

  async function handleSendVisionPreview() {
    if (!visionPreview) return;
    setVisionLoading(true);
    setErrorState(null);
    try {
      const apiBase = await getApiBaseUrl();
      const res = await requestVisionExtraction(
        {
          imageDataUrl: visionPreview.croppedDataUrl,
          mimeType: "image/png",
          hintContext: document.title || ""
        },
        apiBase
      );
      setVisionMeta(res);
      setVisionPreview(null);
      if (res.extractedQuestion) setQuestionText(res.extractedQuestion);
      if (res.extractedOptions?.length) setOptionsText(res.extractedOptions.join("\n"));
      if (res.extractedCode) setCodeSnippet(res.extractedCode);
      if (res.detectedLanguage) setLanguage(res.detectedLanguage);
      setLowOcrConfirmed(!res.requiresUserConfirmation);
    } catch (err) {
      const e = err as Error & { code?: string };
      setErrorState({ code: e.code || "VISION_ERROR", message: e.message || "Vision extraction failed." });
    } finally {
      setVisionLoading(false);
    }
  }

  const answerStr = result ? formatDirectAnswer(result.directAnswer) : "";
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
                style={{ borderColor: visionMeta.requiresUserConfirmation && !lowOcrConfirmed ? "#f59e0b" : "#10b981" }}
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
                {visionMeta.requiresUserConfirmation && !lowOcrConfirmed && (
                  <div id="examai-low-ocr-banner" className="examai-notice" style={{ marginTop: "6px" }}>
                    <strong>⚠️ Low OCR Confidence ({Math.round(visionMeta.ocrConfidence * 100)}%):</strong>{" "}
                    {visionMeta.uncertaintyNotes || "Please review and edit the extracted text below, then confirm before analyzing."}
                    <div style={{ marginTop: "6px" }}>
                      <button
                        id="examai-confirm-ocr-btn"
                        className="examai-btn primary"
                        onClick={() => {
                          setLowOcrConfirmed(true);
                          setErrorState(null);
                        }}
                      >
                        ✓ Confirm Extracted Text
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="examai-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", gap: "4px", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase" }}>
                  Captured Question (Editable in Panel Only)
                </strong>
                <div style={{ display: "flex", gap: "4px" }}>
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
                placeholder="Question statement..."
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
                  🚀 {streaming ? "Analyzing..." : "Analyze"}
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
                    : "Assessment Error"}
                </strong>
                <span>{errorState.message}</span>
              </div>
            )}

            <div className="examai-card">
              <strong style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase" }}>
                Progressive Hint Ladder (Lazy 1-4)
              </strong>
              <div className="examai-hint-row">
                {[1, 2, 3, 4].map((lvl) => (
                  <button
                    key={lvl}
                    data-hint-level={lvl}
                    className={`examai-btn ${activeHintLevel === lvl ? "primary" : ""}`}
                    onClick={() => void handleRequestHint(lvl)}
                  >
                    Level {lvl}
                  </button>
                ))}
              </div>
              {activeHintLevel !== null && (
                <pre id="examai-hint-output" className="examai-pre">
                  {hintLoading && !hintsByLevel[activeHintLevel]
                    ? `Generating Level ${activeHintLevel} hint...`
                    : hintsByLevel[activeHintLevel] || ""}
                </pre>
              )}
            </div>

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
                    <div id="examai-direct-answer" style={{ fontWeight: 700, fontSize: "14px", color: "#38bdf8", marginBottom: "6px" }}>
                      {answerStr}
                    </div>
                    <div id="examai-explanation" style={{ fontSize: "12.5px", whiteSpace: "pre-wrap" }}>
                      {String(result.explanation || "")}
                    </div>
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
