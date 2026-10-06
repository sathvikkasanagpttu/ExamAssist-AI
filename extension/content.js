(() => {
  const PANEL_ID = "examai-panel";
  const FLOAT_BTN_ID = "examai-floating-btn";

  let extractionManager = null;
  let currentTheme = "dark"; // "dark" or "light"
  let currentMode = "Practice Mode"; // "Practice Mode" or "Authorized Assessment Mode"
  let authorizedModeConfirmed = false;
  let isMinimized = false;

  // Session History (cleared on close by default)
  const sessionHistory = [];
  let currentHistoryIndex = -1;

  function getExtractionManager() {
    if (!extractionManager && window.ExamAssist?.ExtractionManager) {
      extractionManager = new window.ExamAssist.ExtractionManager();
    }
    return extractionManager;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
  }

  function removeElement(id) {
    document.getElementById(id)?.remove();
  }

  function removeFloatingBtn() {
    removeElement(FLOAT_BTN_ID);
  }

  function removePanel() {
    removeElement(PANEL_ID);
    removeFloatingBtn();
    // Clear session history on close by default
    sessionHistory.length = 0;
    currentHistoryIndex = -1;
  }

  /**
   * Floating Action Button near user text selection
   */
  function showFloatingButton(range, captured) {
    removeFloatingBtn();
    if (!range || !captured.question || captured.question.length < 5) return;

    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;

    const btn = document.createElement("button");
    btn.id = FLOAT_BTN_ID;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
      <span>ExamAssist AI</span>`;

    const top = window.scrollY + rect.bottom + 8;
    const left = Math.max(10, Math.min(window.scrollX + rect.left, window.innerWidth - 180));

    btn.style.top = `${top}px`;
    btn.style.left = `${left}px`;

    btn.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeFloatingBtn();
      executeAnalyze(captured);
    };

    document.body.appendChild(btn);
  }

  /**
   * Draggable panel handler
   */
  function makeDraggable(panel, handle) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button") || e.target.closest(".examai-mode-badge")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;

      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${initialX}px`;
      panel.style.top = `${initialY}px`;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newX = Math.max(10, Math.min(window.innerWidth - panel.offsetWidth - 10, initialX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 50, initialY + dy));
      panel.style.left = `${newX}px`;
      panel.style.top = `${newY}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  /**
   * Mode confirmation modal for Authorized Assessment Mode
   */
  function showModeConfirmation(onConfirm) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const overlay = document.createElement("div");
    overlay.className = "examai-modal-overlay";
    overlay.innerHTML = `
      <div class="examai-modal-box">
        <strong style="display:block;margin-bottom:8px;font-size:14px;color:#34d399;">Authorized Assessment Mode</strong>
        <p style="margin:0 0 12px 0;line-height:1.45;color:#cbd5e1;">
          Please confirm that generative AI assistance and web search are <strong>explicitly permitted</strong> for this assessment by your course instructor or institution.
        </p>
        <div class="examai-modal-btns">
          <button id="examai-modal-cancel" class="examai-btn-action">Cancel</button>
          <button id="examai-modal-confirm" class="examai-btn-action" style="background:#059669;border-color:#10b981;">I Confirm</button>
        </div>
      </div>`;

    panel.appendChild(overlay);

    overlay.querySelector("#examai-modal-cancel").onclick = () => overlay.remove();
    overlay.querySelector("#examai-modal-confirm").onclick = () => {
      authorizedModeConfirmed = true;
      currentMode = "Authorized Assessment Mode";
      overlay.remove();
      onConfirm();
    };
  }

  /**
   * Renders the loading skeleton
   */
  function renderLoading(captured) {
    removeFloatingBtn();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }

    panel.className = currentTheme === "light" ? "examai-theme-light" : "";
    if (isMinimized) panel.classList.add("examai-minimized");

    const modeClass = currentMode === "Authorized Assessment Mode" ? "examai-mode-authorized" : "examai-mode-practice";

    panel.innerHTML = `
      <div class="examai-head">
        <div class="examai-title-wrap">
          <strong>ExamAssist AI</strong>
          <span id="examai-mode-toggle" class="examai-mode-badge ${modeClass}" title="Click to toggle mode">${esc(currentMode)}</span>
        </div>
        <div class="examai-actions">
          <button class="examai-btn-icon" id="examai-theme-toggle" title="Toggle Dark/Light Theme">🌓</button>
          <button class="examai-btn-icon" id="examai-min" title="Minimize">_</button>
          <button class="examai-btn-icon" id="examai-close" title="Close">✕</button>
        </div>
      </div>
      <div class="examai-body">
        <div class="examai-label">Question Detected</div>
        <div class="examai-question">${esc(captured.question)}</div>
        <div class="examai-skeleton-container">
          <div class="examai-skeleton-bar" style="width: 85%;"></div>
          <div class="examai-skeleton-bar" style="width: 100%;"></div>
          <div class="examai-skeleton-bar" style="width: 70%;"></div>
          <div class="examai-skeleton-bar" style="width: 90%;"></div>
          <div style="text-align:center;color:#60a5fa;font-size:12px;margin-top:14px;">
            Running multi-angle search, evidence extraction & verification pass…
          </div>
        </div>
      </div>`;

    makeDraggable(panel, panel.querySelector(".examai-head"));
    bindHeaderControls(panel, captured);
  }

  function bindHeaderControls(panel, currentCaptured) {
    panel.querySelector("#examai-close").onclick = removePanel;
    panel.querySelector("#examai-min").onclick = () => {
      isMinimized = !isMinimized;
      panel.classList.toggle("examai-minimized", isMinimized);
      panel.querySelector("#examai-min").textContent = isMinimized ? "□" : "_";
    };

    panel.querySelector("#examai-theme-toggle").onclick = () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      panel.classList.toggle("examai-theme-light", currentTheme === "light");
      chrome.storage.local.set({ theme: currentTheme });
    };

    panel.querySelector("#examai-mode-toggle").onclick = () => {
      if (currentMode === "Practice Mode") {
        showModeConfirmation(() => {
          updateModeBadge(panel);
        });
      } else {
        currentMode = "Practice Mode";
        updateModeBadge(panel);
      }
    };
  }

  function updateModeBadge(panel) {
    const badge = panel.querySelector("#examai-mode-toggle");
    if (!badge) return;
    badge.textContent = currentMode;
    badge.className = `examai-mode-badge ${currentMode === "Authorized Assessment Mode" ? "examai-mode-authorized" : "examai-mode-practice"}`;
  }

  /**
   * Renders the complete assessment result
   */
  function renderResult(data, captured) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    panel.className = currentTheme === "light" ? "examai-theme-light" : "";
    if (isMinimized) panel.classList.add("examai-minimized");

    const confLevel = (data.confidence || "UNVERIFIED").toUpperCase();
    const confClass = `examai-conf-${confLevel.toLowerCase()}`;
    const modeClass = currentMode === "Authorized Assessment Mode" ? "examai-mode-authorized" : "examai-mode-practice";

    const directAnswerText = typeof data.directAnswer === "object" && data.directAnswer !== null
      ? `${data.directAnswer.option ? data.directAnswer.option + ". " : ""}${data.directAnswer.text || ""}`.trim()
      : String(data.directAnswer || data.ownSolution || "");

    // Format Option Analysis
    let optionsHtml = "";
    if (Array.isArray(data.optionAnalysis) && data.optionAnalysis.length > 0) {
      optionsHtml = `
        <div class="examai-label">Option Analysis (${data.optionAnalysis.length} Choices)</div>
        <ul class="examai-options-list">
          ${data.optionAnalysis.map(opt => {
            const isCorrect = opt.correct !== undefined ? opt.correct : (opt.isCorrect !== undefined ? opt.isCorrect : false);
            const optLetter = opt.option || "";
            const optText = opt.text || "";
            const label = optLetter && optText ? `${optLetter}. ${optText}` : (optText || optLetter || "Option");
            const reason = opt.reason || opt.analysis || "";
            return `
            <li class="examai-option-item ${isCorrect ? "recommended" : ""}">
              <div class="examai-opt-head">
                <span>${esc(label)}</span>
                <span class="examai-option-badge" style="background:${isCorrect ? "#10b981" : "#475569"}">
                  ${isCorrect ? "✓ Correct" : "Distractor"}
                </span>
              </div>
              <div class="examai-opt-analysis">${esc(reason)}</div>
            </li>`;
          }).join("")}
        </ul>`;
    }

    // Format Reasoning Steps
    let stepsHtml = "";
    if (Array.isArray(data.reasoningSteps) && data.reasoningSteps.length > 0) {
      stepsHtml = `
        <div class="examai-label">Step-by-Step Reasoning</div>
        <ol class="examai-steps-list">
          ${data.reasoningSteps.map(step => `<li>${esc(step)}</li>`).join("")}
        </ol>`;
    }

    // Format Sources
    const sources = (data.sources || []).map((s, idx) => `
      <div class="examai-source-card">
        <a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">
          [${idx + 1}] ${esc(s.title || s.domain)}
        </a>
        <div class="examai-source-meta">
          <span>${esc(s.domain || "web")}</span>
          <span class="examai-source-score">${s.authority || 80}/100</span>
        </div>
      </div>
    `).join("");

    // Conflict Alert
    let conflictHtml = "";
    if (data.verification?.conflicting?.length > 0) {
      conflictHtml = `
        <div class="examai-conflict-alert">
          <strong>⚠️ Disagreement in Retrieved Evidence</strong>
          ${esc(data.verification.conflicting.join(". "))}
        </div>`;
    }

    // History info
    const historyText = sessionHistory.length > 1
      ? `<small style="color:#64748b">(${currentHistoryIndex + 1} of ${sessionHistory.length})</small>`
      : "";

    panel.innerHTML = `
      <div class="examai-head">
        <div class="examai-title-wrap">
          <strong>ExamAssist AI</strong>
          <span id="examai-mode-toggle" class="examai-mode-badge ${modeClass}" title="Click to toggle mode">${esc(currentMode)}</span>
          ${data.questionType ? `<span class="examai-tag">${esc(data.questionType)}</span>` : ""}
          ${data.subject ? `<span class="examai-tag" style="background:#1e3a8a;color:#bfdbfe;">${esc(data.subject)}</span>` : ""}
        </div>
        <div class="examai-actions">
          <button class="examai-btn-icon" id="examai-theme-toggle" title="Toggle Dark/Light Theme">🌓</button>
          <button class="examai-btn-icon" id="examai-min" title="Minimize">_</button>
          <button class="examai-btn-icon" id="examai-close" title="Close">✕</button>
        </div>
      </div>
      <div class="examai-body">
        <div class="examai-label">
          <span>Question ${historyText}</span>
          ${data.difficulty ? `<small style="color:#94a3b8">${esc(data.difficulty)}</small>` : ""}
        </div>
        <div class="examai-question">${esc(data.question || captured.question)}</div>

        <div class="examai-direct-card">
          <div class="examai-direct-title">Direct Answer</div>
          <div class="examai-direct-text">${esc(directAnswerText)}</div>
        </div>

        <div class="examai-label" style="margin-top:12px;">
          <span>Confidence & Verification</span>
          <span class="examai-confidence-badge ${confClass}">● ${esc(confLevel)}</span>
        </div>
        <div class="examai-notes-box">${esc(data.confidenceReason || "Verified against retrieved academic documentation.")}</div>

        ${conflictHtml}
        ${optionsHtml}
        ${stepsHtml}

        ${data.explanation ? `
          <div class="examai-label">Academic Explanation</div>
          <div class="examai-explanation">${esc(data.explanation)}</div>
        ` : ""}

        <div class="examai-label">Authoritative Sources (${(data.sources || []).length})</div>
        <div class="examai-sources-grid">
          ${sources || `<div style="font-size:12px;color:#94a3b8;">No external sources required or returned.</div>`}
        </div>
      </div>
      <div class="examai-footer-bar">
        <button id="examai-copy-ans" class="examai-btn-action">📋 Copy Answer</button>
        <button id="examai-copy-expl" class="examai-btn-action">📋 Copy Explanation</button>
        <button id="examai-open-sources" class="examai-btn-action">🔗 Open Sources</button>
        <button id="examai-reanalyze" class="examai-btn-action">🔄 Re-Analyze</button>
      </div>`;

    makeDraggable(panel, panel.querySelector(".examai-head"));
    bindHeaderControls(panel, captured);

    // Bind action buttons
    panel.querySelector("#examai-copy-ans").onclick = () => {
      navigator.clipboard.writeText(directAnswerText).then(() => {
        const btn = panel.querySelector("#examai-copy-ans");
        btn.textContent = "✓ Copied";
        setTimeout(() => { btn.textContent = "📋 Copy Answer"; }, 1500);
      });
    };

    panel.querySelector("#examai-copy-expl").onclick = () => {
      const fullExpl = `${directAnswerText}\n\nExplanation:\n${data.explanation}`;
      navigator.clipboard.writeText(fullExpl).then(() => {
        const btn = panel.querySelector("#examai-copy-expl");
        btn.textContent = "✓ Copied";
        setTimeout(() => { btn.textContent = "📋 Copy Explanation"; }, 1500);
      });
    };

    panel.querySelector("#examai-open-sources").onclick = () => {
      (data.sources || []).forEach(s => {
        if (s.url) window.open(s.url, "_blank");
      });
    };

    panel.querySelector("#examai-reanalyze").onclick = () => {
      executeAnalyze(captured);
    };
  }

  /**
   * Dispatches the question to the backend /api/assessment/analyze endpoint
   */
  async function executeAnalyze(captured) {
    if (!captured) return;
    const questionText = (captured.question || captured.text || "").trim();
    if (questionText.length < 3) return;
    renderLoading(captured);

    try {
      const cfg = await chrome.storage.local.get({
        apiBase: "http://localhost:8787",
        theme: "dark",
        mode: "Practice Mode"
      });

      if (cfg.theme) currentTheme = cfg.theme;

      // Ensure options are clean strings, avoiding [object Object]
      const safeOptions = (captured.options || []).map(o => {
        if (typeof o === "string") return o.trim();
        return (o.text || o.option || JSON.stringify(o)).trim();
      });

      const res = await fetch(`${cfg.apiBase}/api/assessment/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          options: safeOptions,
          codeSnippet: captured.codeSnippet || "",
          tableData: captured.tableData || "",
          mathFormula: captured.mathFormula || "",
          mode: currentMode
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Failed to analyze question");

      // Push to session history
      sessionHistory.push({ data, captured });
      currentHistoryIndex = sessionHistory.length - 1;

      renderResult(data, captured);
    } catch (err) {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.querySelector(".examai-body").innerHTML = `
          <div style="padding:16px;background:#451a1a;border:1px solid #7f1d1d;border-radius:8px;color:#fecaca;font-size:12.5px;">
            <strong style="display:block;margin-bottom:4px;color:#f87171;">Assessment Error:</strong>
            ${esc(err.message)}
            <div style="margin-top:8px;font-size:11.5px;color:#fca5a5;">
              Ensure the backend is running at <code>http://localhost:8787</code> and reachable.
            </div>
          </div>`;
      }
    }
  }

  // --- TRIGGER 1: User Text Selection ---
  document.addEventListener("mouseup", async () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      removeFloatingBtn();
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 5) {
      removeFloatingBtn();
      return;
    }

    const cfg = await chrome.storage.local.get({ showFloatingButton: true });
    if (!cfg.showFloatingButton) return;

    const manager = getExtractionManager();
    const captured = manager ? manager.extractFromSelection(sel) : { question: text, options: [] };

    if (captured && captured.question) {
      showFloatingButton(sel.getRangeAt(0), captured);
    }
  });

  // --- TRIGGER 2: User Copy Action ---
  document.addEventListener("copy", async () => {
    const sel = window.getSelection();
    const text = sel?.toString()?.trim();
    const cfg = await chrome.storage.local.get({ autoAnswerOnCopy: true });

    if (cfg.autoAnswerOnCopy && text && text.length >= 5) {
      removeFloatingBtn();
      const manager = getExtractionManager();
      const captured = manager ? manager.extractFromSelection(sel) : { question: text, options: [] };
      if (captured && captured.question) {
        executeAnalyze(captured);
      }
    }
  });

  // --- TRIGGER 3: Extension Messages (Context Menu & Popup) ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "RESEARCH_SELECTION") {
      removeFloatingBtn();
      const sel = window.getSelection();
      const manager = getExtractionManager();
      const captured = manager ? manager.extractFromSelection(sel) : { question: msg.text, options: [] };
      executeAnalyze(captured);
    } else if (msg.type === "TRIGGER_EXAM_ASSIST") {
      removeFloatingBtn();
      const manager = getExtractionManager();
      const sel = window.getSelection();
      let captured = null;
      if (sel && sel.toString().trim().length >= 5) {
        captured = manager ? manager.extractFromSelection(sel) : { question: sel.toString().trim(), options: [] };
      } else {
        captured = manager ? manager.extract(document.activeElement) : null;
      }
      if (captured && captured.question) {
        executeAnalyze(captured);
      }
    } else if (msg.type === "ASK") {
      removeFloatingBtn();
      executeAnalyze({ question: msg.question, options: [] });
    }
  });

  // --- TRIGGER 4: In-page Keyboard Shortcut (Ctrl+Shift+E / Cmd+Shift+E) ---
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "E" || e.key === "e")) {
      e.preventDefault();
      removeFloatingBtn();
      const manager = getExtractionManager();
      const sel = window.getSelection();
      let captured = null;
      if (sel && sel.toString().trim().length >= 5) {
        captured = manager ? manager.extractFromSelection(sel) : { question: sel.toString().trim(), options: [] };
      } else {
        captured = manager ? manager.extract(document.activeElement) : null;
      }
      if (captured && captured.question) {
        executeAnalyze(captured);
      }
    }
  });

  // Load preferences
  chrome.storage.local.get({ theme: "dark" }).then(res => {
    if (res.theme) currentTheme = res.theme;
  });
})();