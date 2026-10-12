/**
 * ExamAssist AI - Learning-First Side Panel Controller (Phase 3)
 * Implements:
 * - 6 Tabs: Problem | Hints | Solution | Tests | Complexity | Debug
 * - 4-Level Progressive Hint Ladder (defaults to Level 1; each level requires an explicit click)
 * - Authorized Assessment Mode gate ("Show full solution" requires explicit click + visible notice)
 * - Read-only Solution & Minimal Diff viewer (Copy-only, zero synthetic typing)
 * - Local-only IndexedDB problem history (deletable, off in Authorized Mode unless enabled)
 */

(function () {
  const DB_NAME = "ExamAssistLocalHistoryDB";
  const STORE_NAME = "problem_history";
  let currentAnalysis = null;
  let authorizedSolutionRevealed = false;

  // --- IndexedDB Local History Helper ---
  function openHistoryDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveToHistory(entry) {
    const mode = document.getElementById("sp-mode")?.value || "Practice Mode";
    if (mode === "Authorized Assessment Mode") return; // Off in Authorized mode by default
    const db = await openHistoryDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ ...entry, savedAt: new Date().toISOString() });
    updateHistoryCount();
  }

  async function updateHistoryCount() {
    const db = await openHistoryDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readonly");
    const countReq = tx.objectStore(STORE_NAME).count();
    countReq.onsuccess = () => {
      const el = document.getElementById("sp-history-count");
      if (el) el.textContent = `Local History: ${countReq.result || 0} saved`;
    };
  }

  async function clearHistory() {
    const db = await openHistoryDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    updateHistoryCount();
  }

  // --- Tab Switching ---
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

  function applyAuthorizedSolutionGate() {
    const mode = document.getElementById("sp-mode")?.value;
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

  async function getApiBase() {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const cfg = await chrome.storage.local.get({ apiBase: "http://localhost:8787" });
      return String(cfg.apiBase || "http://localhost:8787").replace(/\/+$/, "");
    }
    return "http://localhost:8787";
  }

  // --- Hint Ladder (Lazy per-level fetch; Level 4 not in DOM/memory until clicked) ---
  document.querySelectorAll(".hint-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".hint-btn").forEach((b) => b.classList.remove("primary"));
      btn.classList.add("primary");
      const level = Number(btn.getAttribute("data-level") || "1");
      const levelKey = `level${level}`;
      const out = document.getElementById("sp-hint-output");
      const question = document.getElementById("sp-question")?.value?.trim() || currentAnalysis?.parsedProblem?.statement || "";
      const userCode = document.getElementById("sp-code")?.value || "";
      const language = document.getElementById("sp-language")?.value || currentAnalysis?.language || "python";
      const explanationLevel = document.getElementById("sp-expl-level")?.value || "Technical";

      if (!question || question.length < 3) {
        out.textContent = "Enter or extract a problem statement first to request a hint.";
        return;
      }

      if (currentAnalysis?.hints?.[levelKey]) {
        out.textContent = currentAnalysis.hints[levelKey];
        return;
      }

      out.textContent = `Generating Level ${level} hint...`;
      try {
        const apiBase = await getApiBase();
        const res = await fetch(`${apiBase}/api/code/hint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, userCode, language, level, explanationLevel })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!currentAnalysis) currentAnalysis = { hints: {} };
        if (!currentAnalysis.hints) currentAnalysis.hints = {};
        currentAnalysis.hints[levelKey] = data.activeHint;
        out.textContent = data.activeHint;
      } catch (err) {
        out.textContent = `Hint error: ${err.message}`;
      }
    });
  });

  // --- Copy Solution ---
  document.getElementById("sp-copy-sol")?.addEventListener("click", () => {
    const code = document.getElementById("sp-solution-code")?.textContent || "";
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById("sp-copy-sol");
      btn.textContent = "✓ Copied";
      setTimeout(() => { btn.textContent = "📋 Copy Code"; }, 1400);
    });
  });

  // --- Extract from Active Tab ---
  document.getElementById("sp-extract-page")?.addEventListener("click", async () => {
    if (!chrome?.tabs) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_CODING_PROBLEM" }, (res) => {
      if (res && res.statement) {
        document.getElementById("sp-question").value = res.statement;
        if (res.starterCode) document.getElementById("sp-code").value = res.starterCode;
        if (res.language) document.getElementById("sp-language").value = res.language;
        if (res.failingOutput) document.getElementById("sp-failing-output").value = res.failingOutput;
        document.getElementById("sp-status").textContent = `Extracted from ${res.platform} (${res.editor?.adapter || "page"}).`;
      }
    });
  });

  // --- Run Full Coding Analysis ---
  document.getElementById("sp-run-analyze")?.addEventListener("click", async () => {
    const question = document.getElementById("sp-question").value.trim();
    const userCode = document.getElementById("sp-code").value;
    const language = document.getElementById("sp-language").value;
    const explanationLevel = document.getElementById("sp-expl-level").value;
    const mode = document.getElementById("sp-mode").value;
    const statusEl = document.getElementById("sp-status");

    if (question.length < 3) {
      statusEl.textContent = "Please enter or extract a problem statement first.";
      return;
    }

    statusEl.textContent = "Streaming analysis from Coding Engine...";
    try {
      const apiBase = await getApiBase();

      const res = await fetch(`${apiBase}/api/code/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, userCode, language, explanationLevel, mode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      currentAnalysis = data;
      authorizedSolutionRevealed = false;
      applyAuthorizedSolutionGate();

      // Default Hint Level 1
      document.getElementById("sp-hint-output").textContent = data.hints?.level1 || "Click Level 1 to request a conceptual hint.";

      // Solution & Badge (only show verified badge when sandbox actually ran)
      const badgeContainer = document.getElementById("sp-verified-badge");
      if (data.verification?.sandboxExecuted && data.verification?.badge) {
        badgeContainer.innerHTML = `<span class="badge verified">✓ ${data.verification.badge}</span>`;
      } else {
        badgeContainer.innerHTML = `<span class="badge unverified">⚠️ Not executed in sandbox (${data.confidence})</span>`;
      }

      if (mode === "Authorized Assessment Mode" && !authorizedSolutionRevealed) {
        document.getElementById("sp-solution-code").textContent = "// Hidden in Authorized Assessment Mode until explicitly revealed";
      } else {
        document.getElementById("sp-solution-code").textContent = data.solution?.code || "// No code generated";
      }
      document.getElementById("sp-solution-expl").textContent =
        `${data.solution?.explanation || ""}\n\nWhy alternatives are slower: ${data.solution?.alternativesComparison || ""}`;

      // Tests tab
      document.getElementById("sp-tests-output").textContent = JSON.stringify(
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

      // Complexity tab
      document.getElementById("sp-complexity-output").textContent = JSON.stringify(data.complexity || {}, null, 2);

      statusEl.textContent = `Completed (${data.confidence}). Hints unlocked at Level 1.`;
      await saveToHistory({ question: question.slice(0, 120), language, confidence: data.confidence });
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    }
  });

  // --- Run Debug Diff ---
  document.getElementById("sp-run-debug")?.addEventListener("click", async () => {
    const question = document.getElementById("sp-question").value.trim() || "Debug submitted code";
    const userCode = document.getElementById("sp-code").value.trim();
    const failingOutput = document.getElementById("sp-failing-output").value.trim();
    const language = document.getElementById("sp-language").value;
    const explanationLevel = document.getElementById("sp-expl-level").value;
    const out = document.getElementById("sp-debug-output");

    if (!userCode) {
      out.textContent = "Paste or extract your code in the Problem tab first.";
      return;
    }
    out.textContent = "Analyzing bug & generating minimal diff...";
    try {
      const apiBase = await getApiBase();

      const res = await fetch(`${apiBase}/api/code/debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, userCode, failingOutput, language, explanationLevel })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      out.textContent =
        `Bug Line: ${data.bugLine ?? "N/A"}\n` +
        `Summary: ${data.bugSummary}\n` +
        `Root Cause: ${data.rootCause}\n\n` +
        `--- Minimal Diff (Read-Only, Copy to Apply) ---\n${data.minimalDiff}`;
    } catch (err) {
      out.textContent = `Debug error: ${err.message}`;
    }
  });

  document.getElementById("sp-clear-history")?.addEventListener("click", clearHistory);
  updateHistoryCount();
})();
