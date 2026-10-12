/**
 * ExamAssist AI - Content Script Entry Point (TypeScript + Shadow DOM)
 * Coordinates modular architecture:
 * - extractors/ (EditorAdapters, ProblemAdapters, QuestionExtractors)
 * - trigger/ (user selection, opt-in copy, keyboard shortcut, site allow-list)
 * - messaging/ (shared Zod schema validation + SSE streaming client)
 * - ui/ (Preact + Tailwind Shadow DOM in-page trigger & assessment panel)
 *
 * HARD RULE: Visible and user-triggered only. Read-only page extraction;
 * never writes into host page editors or dispatches synthetic typing events.
 */

import {
  ExtractionManager,
  extractCodingProblem,
  parseQuestionAndOptions
} from "./extractors";
import {
  isExtensionContextAlive,
  validateRuntimeMessage
} from "./messaging";
import { registerUserTriggers } from "./trigger";
import {
  ensureShadowOverlayRoot,
  hideInPageFloatingTrigger,
  isEventFromShadowOverlay,
  openInPageOverlayAndAnalyze,
  showInPageFloatingTrigger
} from "./ui";

declare global {
  interface Window {
    __EXAMASSIST_CONTENT_LOADED__?: boolean;
    __EXAMASSIST_TEST_API__?: {
      extractCodingProblem: typeof extractCodingProblem;
      parseQuestionAndOptions: typeof parseQuestionAndOptions;
      openInPageOverlayAndAnalyze: typeof openInPageOverlayAndAnalyze;
      ensureShadowOverlayRoot: typeof ensureShadowOverlayRoot;
    };
  }
}

(() => {
  if (typeof window === "undefined") return;
  if (window.__EXAMASSIST_CONTENT_LOADED__) return;
  window.__EXAMASSIST_CONTENT_LOADED__ = true;

  const extractionManager = new ExtractionManager();

  // Expose controlled test API for local Playwright fixture verification
  window.__EXAMASSIST_TEST_API__ = {
    extractCodingProblem,
    parseQuestionAndOptions,
    openInPageOverlayAndAnalyze,
    ensureShadowOverlayRoot
  };

  registerUserTriggers(document, extractionManager, {
    onShowFloatingTrigger: (range, captured) => {
      showInPageFloatingTrigger(range, captured);
    },
    onHideFloatingTrigger: () => {
      hideInPageFloatingTrigger();
    },
    onExecuteAnalyze: (captured) => {
      openInPageOverlayAndAnalyze(captured);
    },
    isEventInsideOverlay: (target) => isEventFromShadowOverlay(target)
  });

  if (isExtensionContextAlive()) {
    try {
      chrome.runtime.onMessage.addListener((rawMsg: unknown, _sender, sendResponse) => {
        if (!isExtensionContextAlive()) return false;
        const validation = validateRuntimeMessage(rawMsg);
        if (!validation.valid || !validation.message) {
          sendResponse?.({ error: validation.error || "Invalid extension message" });
          return false;
        }

        const msg = validation.message;
        if ("action" in msg && msg.action === "EXTRACT_CODING_PROBLEM") {
          const problem = extractCodingProblem(document);
          sendResponse?.(problem);
          return true;
        }
        if ("type" in msg) {
          if (msg.type === "EXTRACT_CODING_PROBLEM") {
            const problem = extractCodingProblem(document);
            sendResponse?.(problem);
            return true;
          }
          if (msg.type === "RESEARCH_SELECTION") {
            hideInPageFloatingTrigger();
            const sel = window.getSelection();
            const captured =
              extractionManager.extractFromSelection(sel) || {
                success: true,
                question: msg.text || "",
                options: [],
                mathFormula: "",
                codeSnippet: "",
                tableData: "",
                sourceAdapter: "ContextMenu"
              };
            openInPageOverlayAndAnalyze(captured);
            sendResponse?.({ ok: true });
            return true;
          }
          if (msg.type === "TRIGGER_EXAM_ASSIST") {
            hideInPageFloatingTrigger();
            const sel = window.getSelection();
            const captured =
              sel && sel.toString().trim().length >= 5
                ? extractionManager.extractFromSelection(sel)
                : extractionManager.extract(document.activeElement, document);
            if (captured && captured.question) {
              openInPageOverlayAndAnalyze(captured);
            }
            sendResponse?.({ ok: true });
            return true;
          }
          if (msg.type === "ASK") {
            hideInPageFloatingTrigger();
            openInPageOverlayAndAnalyze({
              success: true,
              question: msg.question,
              options: [],
              mathFormula: "",
              codeSnippet: "",
              tableData: "",
              sourceAdapter: "PopupAsk"
            });
            sendResponse?.({ ok: true });
            return true;
          }
        }
        return false;
      });
    } catch (err) {
      console.warn("[ExamAssist] Could not register runtime message listener:", err);
    }
  }
})();
