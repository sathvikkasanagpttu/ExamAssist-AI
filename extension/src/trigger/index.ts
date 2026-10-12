/**
 * ExamAssist AI - User-Triggered Capture & Allow-List Gate (TypeScript)
 *
 * HARD RULE: Strictly visible and user-triggered only.
 * No background capture, no stealth, no auto-submit, no writing into host editors.
 */

import {
  ExtractionManager,
  parseQuestionAndOptions,
  type ExtractedAssessmentQuestion
} from "../extractors";
import { getStorageConfig, isExtensionContextAlive } from "../messaging";

export const DEFAULT_ALLOWED_SITES = [
  "localhost",
  "127.0.0.1",
  "hackerrank.com",
  "leetcode.com",
  "geeksforgeeks.org",
  "instructure.com"
];

export async function isSiteAllowed(hostname = window.location.hostname): Promise<boolean> {
  const cfg = await getStorageConfig({
    enableAllSites: false,
    allowedSites: DEFAULT_ALLOWED_SITES
  });
  if (cfg.enableAllSites) return true;
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || !host) return true;
  return (cfg.allowedSites || []).some((site) => {
    const clean = String(site || "")
      .toLowerCase()
      .replace(/^\*\./, "");
    return host === clean || host.endsWith("." + clean);
  });
}

export interface TriggerCallbacks {
  onShowFloatingTrigger: (range: Range, captured: ExtractedAssessmentQuestion) => void;
  onHideFloatingTrigger: () => void;
  onExecuteAnalyze: (captured: ExtractedAssessmentQuestion) => void;
  isEventInsideOverlay: (target: EventTarget | null) => boolean;
}

export function registerUserTriggers(
  doc: Document,
  extractionManager: ExtractionManager,
  callbacks: TriggerCallbacks
): () => void {
  const handleMouseUp = async (e: MouseEvent) => {
    if (!isExtensionContextAlive() && typeof (window as unknown as { __EXAMASSIST_E2E__?: boolean }).__EXAMASSIST_E2E__ === "undefined") {
      return;
    }
    if (callbacks.isEventInsideOverlay(e.target)) return;

    const allowed = await isSiteAllowed();
    if (!allowed) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      callbacks.onHideFloatingTrigger();
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 5) {
      callbacks.onHideFloatingTrigger();
      return;
    }

    const cfg = await getStorageConfig({ showFloatingButton: true });
    if (!cfg.showFloatingButton) return;

    const captured =
      extractionManager.extractFromSelection(sel) || {
        success: true,
        question: text,
        options: [],
        mathFormula: "",
        codeSnippet: "",
        tableData: "",
        sourceAdapter: "Selection"
      };

    if (!captured.options || captured.options.length === 0) {
      const parsed = parseQuestionAndOptions(text);
      if (parsed.options.length >= 2) {
        captured.question = parsed.question;
        captured.options = parsed.options;
      }
    }

    if (captured && captured.question) {
      callbacks.onShowFloatingTrigger(sel.getRangeAt(0), captured);
    }
  };

  const handleCopy = async () => {
    if (!isExtensionContextAlive()) return;
    const allowed = await isSiteAllowed();
    if (!allowed) return;

    const sel = window.getSelection();
    const text = sel?.toString()?.trim();
    const cfg = await getStorageConfig({ autoAnswerOnCopy: false });

    if (cfg.autoAnswerOnCopy && text && text.length >= 5) {
      callbacks.onHideFloatingTrigger();
      const captured =
        extractionManager.extractFromSelection(sel) || {
          success: true,
          question: text,
          options: [],
          mathFormula: "",
          codeSnippet: "",
          tableData: "",
          sourceAdapter: "Copy"
        };
      if (captured && captured.question) {
        callbacks.onExecuteAnalyze(captured);
      }
    }
  };

  const handleKeyDown = async (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "E" || e.key === "e")) {
      e.preventDefault();
      callbacks.onHideFloatingTrigger();

      const allowed = await isSiteAllowed();
      if (!allowed) return;

      const sel = window.getSelection();
      let captured: ExtractedAssessmentQuestion | null = null;
      if (sel && sel.toString().trim().length >= 5) {
        captured = extractionManager.extractFromSelection(sel);
      } else {
        captured = extractionManager.extract(doc.activeElement, doc);
      }
      if (captured && captured.question) {
        callbacks.onExecuteAnalyze(captured);
      }
    }
  };

  doc.addEventListener("mouseup", handleMouseUp);
  doc.addEventListener("copy", handleCopy);
  doc.addEventListener("keydown", handleKeyDown);

  return () => {
    doc.removeEventListener("mouseup", handleMouseUp);
    doc.removeEventListener("copy", handleCopy);
    doc.removeEventListener("keydown", handleKeyDown);
  };
}
