/**
 * ExamAssist AI - Side Panel Controller (TypeScript + Shared Zod Validation)
 * Implements:
 * - 6 Tabs: Problem | Hints | Solution | Tests | Complexity | Debug
 * - 4-Level Progressive Hint Ladder (lazy per-level fetch; Level 4 not in DOM/memory until clicked)
 * - Practice Mode / Authorized Assessment Mode gate ("Show full solution" requires explicit click + visible notice)
 * - Read-only Solution & Minimal Diff viewer (Copy-only, zero synthetic typing)
 * - Cancelable analysis requests (AbortController)
 * - Local-only IndexedDB problem history (deletable, off in Authorized Mode)
 */

import {
  getApiBaseUrl,
  requestCodingAnalysis,
  requestCodingDebug,
  requestCodingHint
} from "../messaging";
import type { ExplanationLevel } from "@examassist/shared";

interface CodingAnalysisState {
  confidence?: string;
  language?: string;
  parsedProblem?: { statement?: string };
  hints?: Record<string, string | null>;
  solution?: {
    code?: string;
    explanation?: string;
    alternativesComparison?: string;
  };
  verification?: {
    sandboxExecuted?: boolean;
    badge?: string | null;
    passedTests?: number;
    totalTests?: number;
    repairAttempts?: number;
    differentialMatched?: boolean | null;
    runs?: unknown[];
  };
  complexity?: Record<string, unknown>;
}

(function initSidePanel() {
  const DB_NAME = "ExamAssistLocalHistoryDB";
  const STORE_NAME = "problem_history";
  let currentAnalysis: CodingAnalysisState | null = null;
  let authorizedSolutionRevealed = false;
  let activeAnalyzeController: AbortController | null = null;

  function openHistoryDB(): Promise<IDBDatabase | null> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveToHistory(entry: Record<string, unknown>): Promise<void> {
    const modeEl = document.getElementById("sp-mode") as HTMLSelectElement | null;
    const mode = modeEl?.value || "Practice Mode";
    if (mode === "Authorized Assessment Mode") return;
    const db = await openHistoryDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ ...entry, savedAt: new Date().toISOString() });
    void updateHistoryCount();
  }

  async function updateHistoryCount(): Promise<void> {
    const db = await openHistoryDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readonly");
    const countReq = tx.objectStore(STORE_NAME).count();
    countReq.onsuccess = () => {
      const el = document.getElementById("sp-history-count");
      if (el) el.textContent = `Local History: ${countReq.result || 0} saved`;
    };
  }

  async function clearHistory(): Promise<void> {
    const db = await openHistoryDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    void updateHistoryCount();
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.getAttribute("data-tab");
      document.getElementById(`tab-${tab}`)?.classList.add("active");
      applyAuthorizedSolutionGate();
    });
  });

  function applyAuthorizedSolutionGate(): void {
    const mode = (document.getElementById("sp-mode") as HTMLSelectElement | null)?.value;
    const gateEl = document.getElementById("sp-auth-gate");
    const contentEl = document.getElementById("sp-solution-content");
    const codeEl = document.getElementById("sp-solution-code");
    if (mode === "Authorized Assessment Mode" && !authorizedSolutionRevealed) {
      if (gateEl) gateEl.style.display = "block";
      if (contentEl) contentEl.style.display = "none";
      if (codeEl) codeEl.textContent = "";
    } else {
      if (gateEl) gateEl.style.display = "none";
      if (contentEl) contentEl.style.display = "block";
      if (codeEl && currentAnalysis?.solution?.code) {
        codeEl.textContent = currentAnalysis.solution.code;
      }
    }
  }

  document.getElementById("sp-mode")?.addEventListener("change", () => {
    authorizedSolutionRevealed = false;
    applyAuthorizedSolutionGate();
  });

  document.getElementById("sp-reveal-auth-sol")?.addEventListener("click", () => {
    authorizedSolutionRevealed = true;
    applyAuthorizedSolutionGate();
  });

  document.querySelectorAll(".hint-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".hint-btn").forEach((b) => b.classList.remove("primary"));
      btn.classList.add("primary");
      const level = Number(btn.getAttribute("data-level") || "1");
      const levelKey = `level${level}`;
      const out = document.getElementById("sp-hint-output");
      if (!out) return;

      const question =
        (document.getElementById("sp-question") as HTMLTextAreaElement | null)?.value?.trim() ||
        currentAnalysis?.parsedProblem?.statement ||
        "";
      const userCode = (document.getElementById("sp-code") as HTMLTextAreaElement | null)?.value || "";
      const language =
        (document.getElementById("sp-language") as HTMLSelectElement | null)?.value ||
        currentAnalysis?.language ||
        "python";
      const explanationLevel = ((document.getElementById("sp-expl-level") as HTMLSelectElement | null)?.value ||
        "Technical") as ExplanationLevel;

      if (!question || question.length < 3) {
        out.textContent = "Enter or extract a problem statement first to request a hint.";
        return;
      }

      if (currentAnalysis?.hints?.[levelKey]) {
        out.textContent = currentAnalysis.hints[levelKey] || "";
        return;
      }

      out.textContent = `Generating Level ${level} hint...`;
      try {
        const apiBase = await getApiBaseUrl();
        const data = await requestCodingHint(
          { question, userCode, language, level, explanationLevel },
          apiBase
        );
        if (!currentAnalysis) currentAnalysis = { hints: {} };
        if (!currentAnalysis.hints) currentAnalysis.hints = {};
        currentAnalysis.hints[levelKey] = data.activeHint;
        out.textContent = data.activeHint;
      } catch (err) {
        const e = err as Error;
        out.textContent = `Hint error: ${e.message}`;
      }
    });
  });

  document.getElementById("sp-copy-sol")?.addEventListener("click", () => {
    const code = document.getElementById("sp-solution-code")?.textContent || "";
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById("sp-copy-sol");
      if (btn) {
        btn.textContent = "✓ Copied";
        setTimeout(() => {
          btn.textContent = "📋 Copy Code";
        }, 1400);
      }
    });
  });

  document.getElementById("sp-extract-page")?.addEventListener("click", async () => {
    if (typeof chrome === "undefined" || !chrome.tabs) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_CODING_PROBLEM" }, (res) => {
      if (res && res.statement) {
        const qEl = document.getElementById("sp-question") as HTMLTextAreaElement | null;
        const cEl = document.getElementById("sp-code") as HTMLTextAreaElement | null;
        const lEl = document.getElementById("sp-language") as HTMLSelectElement | null;
        const fEl = document.getElementById("sp-failing-output") as HTMLTextAreaElement | null;
        const sEl = document.getElementById("sp-status");
        if (qEl) qEl.value = res.statement;
        if (res.starterCode && cEl) cEl.value = res.starterCode;
        if (res.language && lEl) lEl.value = res.language;
        if (res.failingOutput && fEl) fEl.value = res.failingOutput;
        if (sEl) sEl.textContent = `Extracted from ${res.platform} (${res.editor?.adapter || "page"}).`;
      }
    });
  });

  document.getElementById("sp-cancel-analyze")?.addEventListener("click", () => {
    activeAnalyzeController?.abort();
  });

  document.getElementById("sp-run-analyze")?.addEventListener("click", async () => {
    const question = (document.getElementById("sp-question") as HTMLTextAreaElement | null)?.value.trim() || "";
    const userCode = (document.getElementById("sp-code") as HTMLTextAreaElement | null)?.value || "";
    const language = (document.getElementById("sp-language") as HTMLSelectElement | null)?.value || "python";
    const explanationLevel = ((document.getElementById("sp-expl-level") as HTMLSelectElement | null)?.value ||
      "Technical") as ExplanationLevel;
    const mode = ((document.getElementById("sp-mode") as HTMLSelectElement | null)?.value || "Practice Mode") as
      | "Practice Mode"
      | "Authorized Assessment Mode";
    const statusEl = document.getElementById("sp-status");
    const cancelBtn = document.getElementById("sp-cancel-analyze");

    if (question.length < 3) {
      if (statusEl) statusEl.textContent = "Please enter or extract a problem statement first.";
      return;
    }

    activeAnalyzeController?.abort();
    activeAnalyzeController = new AbortController();
    if (cancelBtn) cancelBtn.style.display = "inline-block";
    if (statusEl) statusEl.textContent = "Streaming analysis from Coding Engine...";

    try {
      const apiBase = await getApiBaseUrl();
      const data = (await requestCodingAnalysis(
        {
          question,
          userCode,
          language,
          explanationLevel,
          mode,
          title: "",
          starterCode: "",
          constraints: "",
          inputFormat: "",
          outputFormat: "",
          sampleTests: [],
          failingOutput: "",
          options: [],
          sqlSchema: "",
          dialect: "SQLite"
        },
        apiBase,
        activeAnalyzeController.signal
      )) as unknown as CodingAnalysisState;

      currentAnalysis = data;
      authorizedSolutionRevealed = false;
      applyAuthorizedSolutionGate();

      const hintOut = document.getElementById("sp-hint-output");
      if (hintOut) {
        hintOut.textContent = data.hints?.level1 || "Click Level 1 to request a conceptual hint.";
      }

      const badgeContainer = document.getElementById("sp-verified-badge");
      if (badgeContainer) {
        if (data.verification?.sandboxExecuted && data.verification?.badge) {
          badgeContainer.innerHTML = `<span class="badge verified">✓ ${data.verification.badge}</span>`;
        } else {
          badgeContainer.innerHTML = `<span class="badge unverified">⚠️ Not executed in sandbox (${data.confidence})</span>`;
        }
      }

      const solCodeEl = document.getElementById("sp-solution-code");
      if (solCodeEl) {
        if (mode === "Authorized Assessment Mode" && !authorizedSolutionRevealed) {
          solCodeEl.textContent = "";
        } else {
          solCodeEl.textContent = data.solution?.code || "// No code generated";
        }
      }

      const solExplEl = document.getElementById("sp-solution-expl");
      if (solExplEl) {
        solExplEl.textContent = `${data.solution?.explanation || ""}\n\nWhy alternatives are slower: ${data.solution?.alternativesComparison || ""}`;
      }

      const testsOut = document.getElementById("sp-tests-output");
      if (testsOut) {
        testsOut.textContent = JSON.stringify(
          {
            sandboxExecuted: data.verification?.sandboxExecuted,
            passedTests: data.verification?.passedTests,
            totalTests: data.verification?.totalTests,
            repairAttempts: data.verification?.repairAttempts,
            differentialMatched: data.verification?.differentialMatched,
            runs: data.verification?.runs || []
          },
          null,
          2
        );
      }

      const compOut = document.getElementById("sp-complexity-output");
      if (compOut) {
        compOut.textContent = JSON.stringify(data.complexity || {}, null, 2);
      }

      if (statusEl) statusEl.textContent = `Completed (${data.confidence}). Hints unlocked at Level 1.`;
      await saveToHistory({ question: question.slice(0, 120), language, confidence: data.confidence });
    } catch (err) {
      const e = err as Error;
      if (statusEl) {
        statusEl.textContent = e.name === "AbortError" ? "Analysis cancelled." : `Error: ${e.message}`;
      }
    } finally {
      activeAnalyzeController = null;
      if (cancelBtn) cancelBtn.style.display = "none";
    }
  });

  document.getElementById("sp-run-debug")?.addEventListener("click", async () => {
    const question =
      (document.getElementById("sp-question") as HTMLTextAreaElement | null)?.value.trim() || "Debug submitted code";
    const userCode = (document.getElementById("sp-code") as HTMLTextAreaElement | null)?.value.trim() || "";
    const failingOutput =
      (document.getElementById("sp-failing-output") as HTMLTextAreaElement | null)?.value.trim() || "";
    const language = (document.getElementById("sp-language") as HTMLSelectElement | null)?.value || "python";
    const explanationLevel = ((document.getElementById("sp-expl-level") as HTMLSelectElement | null)?.value ||
      "Technical") as ExplanationLevel;
    const out = document.getElementById("sp-debug-output");
    if (!out) return;

    if (!userCode) {
      out.textContent = "Paste or extract your code in the Problem tab first.";
      return;
    }
    out.textContent = "Analyzing bug & generating minimal diff...";
    try {
      const apiBase = await getApiBaseUrl();
      const data = await requestCodingDebug(
        {
          question,
          userCode,
          failingOutput,
          language,
          explanationLevel,
          sampleTests: []
        },
        apiBase
      );

      out.textContent =
        `Bug Line: ${data.bugLine ?? "N/A"}\n` +
        `Summary: ${data.bugSummary}\n` +
        `Root Cause: ${data.rootCause}\n\n` +
        `--- Minimal Diff (Read-Only, Copy to Apply) ---\n${data.minimalDiff}`;
    } catch (err) {
      const e = err as Error;
      out.textContent = `Debug error: ${e.message}`;
    }
  });

  document.getElementById("sp-clear-history")?.addEventListener("click", () => {
    void clearHistory();
  });
  void updateHistoryCount();
})();
