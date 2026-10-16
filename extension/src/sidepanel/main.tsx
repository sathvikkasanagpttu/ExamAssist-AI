/**
 * ExamAssist AI - Side Panel Controller (TypeScript + Shared Zod Validation + Phase 2 Coding Engine UI)
 * Implements:
 * - 6 Tabs: Problem | Hints | Solution | Tests | Complexity | Debug
 * - 4-Level Progressive Hint Ladder (lazy per-level fetch; Level 4 not in DOM/memory until clicked)
 * - Practice Mode / Authorized Assessment Mode gate ("Show full solution" requires explicit click + visible notice)
 * - Read-only Monaco/CodeMirror line-numbered Solution Viewer & Side-by-Side Diff (Copy-only, zero synthetic typing)
 * - "Run My Code on Samples", "Code Review", "Translate & Re-Test", "Explain Error in Plain English"
 * - Concept tags & "Similar Practice Problems" list from dataset
 * - Verified by sandbox badge (with N/N tests, language+version, runtime, memory, test strength) ONLY when executed
 */

import {
  getApiBaseUrl,
  requestCodingAnalysis,
  requestCodingDebug,
  requestCodingHint,
  requestGraphTraverse,
  requestRecruiterBenchmarks
} from "../messaging";
import type { ExplanationLevel } from "@examassist/shared";

interface TestRunEntry {
  stdin?: string;
  stdout?: string;
  actualOutput?: string;
  expectedOutput?: string;
  diff?: string;
  runtimeMs?: number;
  memoryKb?: number;
  passed?: boolean;
  executed?: boolean;
}

interface CodingAnalysisState {
  confidence?: string;
  language?: string;
  conceptTags?: string[];
  similarProblems?: Array<{ id: string; title: string; language: string; difficulty: string; topic: string }>;
  parsedProblem?: { statement?: string };
  hints?: Record<string, string | null>;
  ranking?: { winnerReason?: string };
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
    runtimeVersion?: string | null;
    avgRuntimeMs?: number | null;
    peakMemoryKb?: number | null;
    testStrength?: number | null;
    repairAttempts?: number;
    differentialMatched?: boolean | null;
    runs?: TestRunEntry[];
  };
  complexity?: Record<string, unknown>;
}

function formatCodeWithLineNumbers(code: string): string {
  const lines = String(code || "").split(/\r?\n/);
  return lines.map((line, idx) => `${String(idx + 1).padStart(3, " ")} | ${line}`).join("\n");
}

function escapeHtml(raw: string): string {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderPerTestTable(runs: TestRunEntry[]): string {
  if (!Array.isArray(runs) || runs.length === 0) return "";
  const rowsHtml = runs
    .map((r, idx) => {
      const actual = r.stdout ?? r.actualOutput ?? "";
      const status = !r.executed ? "⚠️ Not Run" : r.passed ? "✅ PASS" : "❌ FAIL";
      return `<tr>
        <td>#${idx + 1}</td>
        <td>${escapeHtml(r.stdin || "(empty)")}</td>
        <td>${escapeHtml(r.expectedOutput || "(any)")}</td>
        <td>${escapeHtml(actual)}</td>
        <td>${escapeHtml(r.diff || "-")}</td>
        <td>${r.runtimeMs ?? 0}ms</td>
        <td>${r.memoryKb ?? 0}KB</td>
        <td>${status}</td>
      </tr>`;
    })
    .join("");
  return `<table class="test-table">
    <thead>
      <tr><th>#</th><th>Stdin</th><th>Expected</th><th>Stdout</th><th>Diff</th><th>Time</th><th>Mem</th><th>Result</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

(function initSidePanel() {
  const DB_NAME = "ExamAssistLocalHistoryDB";
  const STORE_NAME = "problem_history";
  let currentAnalysis: CodingAnalysisState | null = null;
  let authorizedSolutionRevealed = false;
  let activeAnalyzeController: AbortController | null = null;
  let extractedSamples: Array<{ stdin: string; expectedOutput: string }> = [];

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
        codeEl.textContent = formatCodeWithLineNumbers(currentAnalysis.solution.code);
        codeEl.setAttribute("data-raw-code", currentAnalysis.solution.code);
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
    const codeEl = document.getElementById("sp-solution-code");
    const rawCode = codeEl?.getAttribute("data-raw-code") || currentAnalysis?.solution?.code || codeEl?.textContent || "";
    navigator.clipboard.writeText(rawCode).then(() => {
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
        if (Array.isArray(res.sampleTests)) extractedSamples = res.sampleTests;
        if (sEl) sEl.textContent = `Extracted from ${res.platform} (${res.editor?.adapter || "page"}). Solving...`;
        document.getElementById("sp-run-analyze")?.click();
      }
    });
  });

  document.getElementById("sp-question")?.addEventListener("paste", () => {
    setTimeout(() => {
      const qEl = document.getElementById("sp-question") as HTMLTextAreaElement | null;
      if (qEl && qEl.value.trim().length >= 5) {
        document.getElementById("sp-run-analyze")?.click();
      }
    }, 30);
  });

  document.getElementById("sp-cancel-analyze")?.addEventListener("click", () => {
    activeAnalyzeController?.abort();
  });

  // Phase 2: "Run My Code on Samples"
  document.getElementById("sp-run-samples")?.addEventListener("click", async () => {
    const userCode = (document.getElementById("sp-code") as HTMLTextAreaElement | null)?.value.trim() || "";
    const language = (document.getElementById("sp-language") as HTMLSelectElement | null)?.value || "python";
    const statusEl = document.getElementById("sp-status");
    if (!userCode) {
      if (statusEl) statusEl.textContent = "Enter or extract your code first to run on sample tests.";
      return;
    }
    if (statusEl) statusEl.textContent = "Running your code on sample tests in sandbox...";
    try {
      const apiBase = await getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/code/run-samples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode, language, sampleTests: extractedSamples })
      });
      const data = await res.json();
      const tableContainer = document.getElementById("sp-tests-table-container");
      const testsOut = document.getElementById("sp-tests-output");
      if (tableContainer) tableContainer.innerHTML = renderPerTestTable(data.results || []);
      if (testsOut) testsOut.textContent = JSON.stringify(data, null, 2);
      if (statusEl) {
        statusEl.textContent = data.executed
          ? data.badge || `Passed ${data.passedTests}/${data.totalTests} sample tests.`
          : `Not executed: ${data.error || "Sandbox unavailable"}`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Run samples error: ${(err as Error).message}`;
    }
  });

  // Phase 2: "Code Review"
  document.getElementById("sp-run-review")?.addEventListener("click", async () => {
    const question = (document.getElementById("sp-question") as HTMLTextAreaElement | null)?.value.trim() || "";
    const code = (document.getElementById("sp-code") as HTMLTextAreaElement | null)?.value.trim() || "";
    const language = (document.getElementById("sp-language") as HTMLSelectElement | null)?.value || "python";
    const statusEl = document.getElementById("sp-status");
    if (!code) {
      if (statusEl) statusEl.textContent = "Enter or extract your code first to run a code review.";
      return;
    }
    if (statusEl) statusEl.textContent = "Running AST & linter code review...";
    try {
      const apiBase = await getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/code/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, code, language })
      });
      const data = await res.json();
      const solExplEl = document.getElementById("sp-solution-expl");
      if (solExplEl) {
        solExplEl.textContent =
          `Readability Score: ${data.readabilityScore}/100\n` +
          `Readability: ${data.readabilityFeedback}\n` +
          `Naming: ${data.namingFeedback}\n` +
          `Complexity: ${data.complexityFeedback}\n` +
          `Edge Cases: ${(data.edgeCases || []).join(", ")}`;
      }
      if (statusEl) statusEl.textContent = `Code review complete (Readability ${data.readabilityScore}/100).`;
    } catch (err) {
      if (statusEl) statusEl.textContent = `Code review error: ${(err as Error).message}`;
    }
  });

  // Phase 2: "Translate Solution to Another Language & Re-Test"
  document.getElementById("sp-translate-btn")?.addEventListener("click", async () => {
    const question = (document.getElementById("sp-question") as HTMLTextAreaElement | null)?.value.trim() || "";
    const sourceCode =
      currentAnalysis?.solution?.code ||
      (document.getElementById("sp-code") as HTMLTextAreaElement | null)?.value.trim() ||
      "";
    const sourceLanguage =
      currentAnalysis?.language ||
      (document.getElementById("sp-language") as HTMLSelectElement | null)?.value ||
      "python";
    const targetLanguage =
      (document.getElementById("sp-translate-target") as HTMLSelectElement | null)?.value || "java";
    const solCodeEl = document.getElementById("sp-solution-code");
    if (!sourceCode) return;
    if (solCodeEl) solCodeEl.textContent = `Translating from ${sourceLanguage} to ${targetLanguage} and re-testing...`;
    try {
      const apiBase = await getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/code/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          sourceCode,
          sourceLanguage,
          targetLanguage,
          sampleTests: extractedSamples
        })
      });
      const data = await res.json();
      if (solCodeEl && data.translatedCode) {
        solCodeEl.textContent = formatCodeWithLineNumbers(data.translatedCode);
        solCodeEl.setAttribute("data-raw-code", data.translatedCode);
      }
      const badgeContainer = document.getElementById("sp-verified-badge");
      if (badgeContainer) {
        if (data.verification?.sandboxExecuted && data.verification?.badge) {
          badgeContainer.innerHTML = `<span class="badge verified">✓ ${escapeHtml(data.verification.badge)}</span>`;
        } else {
          badgeContainer.innerHTML = `<span class="badge unverified">⚠️ Translated (${escapeHtml(targetLanguage)}) — Not executed in sandbox</span>`;
        }
      }
    } catch (err) {
      if (solCodeEl) solCodeEl.textContent = `Translation error: ${(err as Error).message}`;
    }
  });

  // Phase 2: "Explain Compiler/Runtime Error in Plain English"
  document.getElementById("sp-explain-error")?.addEventListener("click", async () => {
    const code = (document.getElementById("sp-code") as HTMLTextAreaElement | null)?.value.trim() || "";
    const errorOutput =
      (document.getElementById("sp-failing-output") as HTMLTextAreaElement | null)?.value.trim() || "";
    const language = (document.getElementById("sp-language") as HTMLSelectElement | null)?.value || "python";
    const out = document.getElementById("sp-debug-output");
    if (!out) return;
    if (!errorOutput) {
      out.textContent = "Paste a compiler or runtime error in the box above first.";
      return;
    }
    out.textContent = "Translating compiler/runtime error into plain English...";
    try {
      const apiBase = await getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/code/explain-error`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, errorOutput })
      });
      const data = await res.json();
      out.textContent =
        `Category: ${data.failureCategory} (Line: ${data.lineNumber ?? "N/A"})\n` +
        `Plain-English Summary: ${data.plainEnglishSummary}\n` +
        `Why It Happened: ${data.whyItHappened}\n` +
        `How to Fix: ${data.howToFix}`;
    } catch (err) {
      out.textContent = `Error explanation failed: ${(err as Error).message}`;
    }
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
          sampleTests: extractedSamples,
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

      // Concept tags & similar practice problems
      const tagsEl = document.getElementById("sp-concept-tags");
      if (tagsEl) {
        tagsEl.innerHTML = (data.conceptTags || [])
          .map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`)
          .join("");
      }
      const simEl = document.getElementById("sp-similar-problems");
      if (simEl) {
        const sims = data.similarProblems || [];
        simEl.innerHTML =
          sims.length > 0
            ? `<strong>Similar Practice Problems:</strong> ` +
              sims.map((s) => `${escapeHtml(s.title)} (${escapeHtml(s.language)}, ${escapeHtml(s.difficulty)})`).join(" • ")
            : "";
      }

      // Verified by sandbox badge ONLY when executed
      const badgeContainer = document.getElementById("sp-verified-badge");
      if (badgeContainer) {
        if (data.verification?.sandboxExecuted && data.verification?.badge) {
          badgeContainer.innerHTML = `<span class="badge verified">✓ ${escapeHtml(data.verification.badge)}</span>`;
        } else {
          badgeContainer.innerHTML = `<span class="badge unverified">⚠️ Not executed in sandbox (${escapeHtml(data.confidence || "UNVERIFIED")})</span>`;
        }
      }

      const solCodeEl = document.getElementById("sp-solution-code");
      if (solCodeEl) {
        if (mode === "Authorized Assessment Mode" && !authorizedSolutionRevealed) {
          solCodeEl.textContent = "";
        } else {
          const rawCode = data.solution?.code || "// No code generated";
          solCodeEl.textContent = formatCodeWithLineNumbers(rawCode);
          solCodeEl.setAttribute("data-raw-code", rawCode);
        }
      }

      const solExplEl = document.getElementById("sp-solution-expl");
      if (solExplEl) {
        solExplEl.textContent =
          `${data.solution?.explanation || ""}\n\n` +
          `Ranking & Trade-offs: ${data.ranking?.winnerReason || data.solution?.alternativesComparison || ""}`;
      }

      const tableContainer = document.getElementById("sp-tests-table-container");
      if (tableContainer) {
        tableContainer.innerHTML = renderPerTestTable(data.verification?.runs || []);
      }

      const testsOut = document.getElementById("sp-tests-output");
      if (testsOut) {
        testsOut.textContent = JSON.stringify(
          {
            sandboxExecuted: data.verification?.sandboxExecuted,
            passedTests: data.verification?.passedTests,
            totalTests: data.verification?.totalTests,
            testStrength: data.verification?.testStrength,
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
      const targetTab = mode === "Authorized Assessment Mode" ? "hints" : "solution";
      const targetBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`) as HTMLElement | null;
      targetBtn?.click();
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
    const sbsEl = document.getElementById("sp-side-by-side-diff");
    if (!out) return;

    if (!userCode) {
      out.textContent = "Paste or extract your code in the Problem tab first.";
      return;
    }
    out.textContent = "Analyzing bug & generating side-by-side diff...";
    try {
      const apiBase = await getApiBaseUrl();
      const data = (await requestCodingDebug(
        {
          question,
          userCode,
          failingOutput,
          language,
          explanationLevel,
          sampleTests: extractedSamples
        },
        apiBase
      )) as unknown as {
        bugLine?: number | null;
        bugSummary?: string;
        rootCause?: string;
        minimalDiff?: string;
        sideBySideDiff?: Array<{ lineNumber: number; left: string | null; right: string | null; status: string }>;
      };

      if (sbsEl && Array.isArray(data.sideBySideDiff)) {
        sbsEl.innerHTML = data.sideBySideDiff
          .map((row) => {
            const leftCls = row.status === "removed" || row.status === "modified" ? "diff-removed" : "diff-unchanged";
            const rightCls = row.status === "added" || row.status === "modified" ? "diff-added" : "diff-unchanged";
            return `<div class="diff-cell ${leftCls}">${row.lineNumber}: ${escapeHtml(row.left ?? "")}</div>
                    <div class="diff-cell ${rightCls}">${row.lineNumber}: ${escapeHtml(row.right ?? "")}</div>`;
          })
          .join("");
      }

      out.textContent =
        `Bug Line: ${data.bugLine ?? "N/A"}\n` +
        `Summary: ${data.bugSummary}\n` +
        `Root Cause: ${data.rootCause}\n\n` +
        `--- Unified Diff (Read-Only, Copy to Apply) ---\n${data.minimalDiff}`;
    } catch (err) {
      const e = err as Error;
      out.textContent = `Debug error: ${e.message}`;
    }
  });

  // --- 7. Graph & Recruiter Showcase Event Handlers ---
  document.getElementById("sp-run-graph")?.addEventListener("click", async () => {
    const question =
      (document.getElementById("sp-question") as HTMLTextAreaElement | null)?.value.trim() ||
      "Explain Dijkstra algorithm and shortest path";
    const out = document.getElementById("sp-graph-output");
    if (!out) return;
    out.textContent = "Traversing Academic Knowledge Graph...";
    try {
      const apiBase = await getApiBaseUrl();
      const res = (await requestGraphTraverse(question, apiBase)) as unknown as {
        matchedConcepts?: Array<{ name: string; definition: string }>;
        prerequisites?: Array<{ name: string; definition: string; depth: number }>;
        formulas?: Array<{ name: string; expression: string; variables: string[] }>;
        pitfalls?: Array<{ misconception: string; correction: string }>;
      };

      const parts: string[] = [];
      if (res.matchedConcepts && res.matchedConcepts.length > 0) {
        parts.push(`🎯 Target Concepts:\n${res.matchedConcepts.map((c) => `  • ${c.name}: ${c.definition}`).join("\n")}`);
      }
      if (res.prerequisites && res.prerequisites.length > 0) {
        parts.push(`\n📚 Prerequisite DAG (Foundational Knowledge):\n${res.prerequisites.map((p) => `  [L${p.depth}] ${p.name} — ${p.definition}`).join("\n")}`);
      }
      if (res.formulas && res.formulas.length > 0) {
        parts.push(`\n📐 Linked Formulas:\n${res.formulas.map((f) => `  • ${f.name}: ${f.expression}\n    Variables: ${f.variables.join(", ")}`).join("\n")}`);
      }
      if (res.pitfalls && res.pitfalls.length > 0) {
        parts.push(`\n⚠️ Common Conceptual Pitfalls:\n${res.pitfalls.map((pit) => `  • Traps: "${pit.misconception}"\n    Correction: ${pit.correction}`).join("\n")}`);
      }

      out.textContent = parts.length > 0 ? parts.join("\n") : "No specific knowledge graph concepts matched for this query.";
    } catch (err) {
      const e = err as Error;
      out.textContent = `Graph traversal error: ${e.message}`;
    }
  });

  document.querySelectorAll(".benchmark-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const target = e.currentTarget as HTMLElement | null;
      const bmId = target?.getAttribute("data-bm");
      const out = document.getElementById("sp-benchmark-result");
      if (!out || !bmId) return;

      out.style.display = "block";
      out.textContent = `Loading benchmark [${bmId}]...`;
      try {
        const apiBase = await getApiBaseUrl();
        const data = (await requestRecruiterBenchmarks(apiBase)) as unknown as {
          benchmarks?: Array<{ id: string; title: string; category: string; description: string; samplePayload: Record<string, unknown> }>;
        };
        const found = data.benchmarks?.find((b) => b.id === bmId);
        if (found) {
          out.textContent =
            `🌟 Benchmark: ${found.title}\n` +
            `Category: ${found.category}\n` +
            `Description: ${found.description}\n\n` +
            `Verified Payload:\n${JSON.stringify(found.samplePayload, null, 2)}`;
        } else {
          out.textContent = `Benchmark ${bmId} loaded successfully.`;
        }
      } catch (err) {
        const errObj = err as Error;
        out.textContent = `Benchmark fetch error: ${errObj.message}`;
      }
    });
  });

  document.getElementById("sp-clear-history")?.addEventListener("click", () => {
    void clearHistory();
  });
  void updateHistoryCount();
})();
