/**
 * ExamAssist AI - Content Script (Manifest V3)
 * Provides on-page assessment assistance with evidence-first reasoning,
 * domain allow-list checking, option integrity, and transparent confidence ratings.
 */

(() => {
  const PANEL_ID = "examai-panel";
  const FLOAT_BTN_ID = "examai-floating-btn";

  let extractionManager = null;
  let currentTheme = "dark"; // "dark" or "light"
  let currentMode = "Practice Mode"; // "Practice Mode" or "Authorized Assessment Mode"
  let authorizedModeConfirmed = false;
  let isMinimized = false;
  let activeAnalyzeController = null;

  // Session History (cleared on close by default)
  const sessionHistory = [];
  let currentHistoryIndex = -1;

  const alive = () => {
    try {
      return Boolean(window.chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  };

  async function getCfg(defaults) {
    if (!alive()) return { ...defaults };
    try {
      return await chrome.storage.local.get(defaults);
    } catch (err) {
      console.warn("[ExamAssist] Storage get error or invalidated context:", err);
      return { ...defaults };
    }
  }

  async function setCfg(items) {
    if (!alive()) return;
    try {
      await chrome.storage.local.set(items);
    } catch (err) {
      console.warn("[ExamAssist] Storage set error or invalidated context:", err);
    }
  }

  async function isSiteAllowed() {
    const cfg = await getCfg({
      enableAllSites: true,
      allowedSites: ["localhost", "127.0.0.1"]
    });
    if (cfg.enableAllSites) return true;
    const host = window.location.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    return (cfg.allowedSites || []).some(s => host === s.toLowerCase() || host.endsWith("." + s.toLowerCase()));
  }

  function showInvalidatedBanner() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }
    panel.className = currentTheme === "light" ? "examai-theme-light" : "";
    panel.innerHTML = `
      <div class="examai-head">
        <div class="examai-title-wrap">
          <strong>ExamAssist AI</strong>
        </div>
        <div class="examai-actions">
          <button class="examai-btn-icon" id="examai-close" title="Close">✕</button>
        </div>
      </div>
      <div class="examai-body" style="padding:16px;">
        <div style="padding:14px;background:#1e293b;border:1px solid #3b82f6;border-radius:8px;color:#f8fafc;font-size:13px;line-height:1.5;">
          <strong style="display:block;margin-bottom:6px;color:#60a5fa;">Extension Updated</strong>
          The extension was updated or reloaded in Chrome. Please refresh this page (<strong>F5</strong> or <strong>Cmd+R</strong>) and try again.
        </div>
      </div>`;
    panel.querySelector("#examai-close").onclick = removePanel;
  }

  /**
   * Fallback parser for extracting question text and options (A-H, 1-8)
   * from raw text when options are not captured separately in DOM containers.
   */
  function parseQuestionAndOptions(raw) {
    if (!raw || typeof raw !== "string") {
      return { question: "", options: [] };
    }
    const text = raw.trim();

    // 1. Line-by-line strategy
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const optionRegex = /^(?:\(?([A-Ha-h0-9])[\.\)\:\-\]]|\[([A-Ha-h0-9])\])\s+(.+)$/;

    const rawMatches = [];
    const questionLines = [];
    let foundFirstOption = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(optionRegex);
      if (match) {
        const key = (match[1] || match[2] || "").toUpperCase();
        const isDigit = /^\d+$/.test(key);
        const hasQuestionMark = line.includes("?");
        const laterHasLetters = lines.slice(i + 1).some(l => /^(?:\(?[A-Da-d][\.\)\:\-\]]|\[[A-Da-d]\])/.test(l));

        if (isDigit && (hasQuestionMark || laterHasLetters)) {
          questionLines.push(line);
          continue;
        }

        foundFirstOption = true;
        const optText = match[3].trim();
        rawMatches.push({ letter: key, text: optText });
      } else {
        if (!foundFirstOption) {
          questionLines.push(line);
        } else {
          if (rawMatches.length > 0) {
            rawMatches[rawMatches.length - 1].text += " " + line;
          } else {
            questionLines.push(line);
          }
        }
      }
    }

    if (rawMatches.length >= 2) {
      const q = questionLines.join("\n").trim();
      return {
        question: q.length >= 3 ? q : text,
        options: rawMatches.map(m => `${m.letter}) ${m.text}`)
      };
    }

    // 2. Inline strategy
    const markerRegex = /(?:^|\s+)(?:\(?([A-Ha-h1-8])[\.\)\:\-]|\[([A-Ha-h1-8])\])(?=\s+)/g;
    const matches = [...text.matchAll(markerRegex)];
    if (matches.length >= 2) {
      const keys = matches.map(m => (m[1] || m[2]).toUpperCase());
      const isAlphaSeq = keys[0] === "A" && keys[1] === "B";
      const isNumSeq = keys[0] === "1" && keys[1] === "2";
      const uniqueKeys = new Set(keys);
      if (isAlphaSeq || isNumSeq || uniqueKeys.size === keys.length) {
        const q = text.slice(0, matches[0].index).trim();
        const inlineOpts = [];
        for (let i = 0; i < matches.length; i++) {
          const key = keys[i];
          const start = matches[i].index + matches[i][0].length;
          const end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
          const optBody = text.slice(start, end).trim();
          if (optBody) {
            inlineOpts.push(`${key}) ${optBody}`);
          }
        }
        if (inlineOpts.length >= 2) {
          return {
            question: q.length >= 3 ? q : text,
            options: inlineOpts
          };
        }
      }
    }

    return {
      question: text,
      options: []
    };
  }

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
      if (e.target.closest("button") || e.target.closest(".examai-mode-badge") || e.target.closest("input") || e.target.closest("textarea")) return;
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
   * Renders the loading skeleton and prompt preview
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
    const optionsCount = (captured.options || []).length;
    const looksLikeMCQ = /\?|\bwhich of the following\b|\bchoose\b/i.test(captured.question || "");

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
        <div class="examai-disclaimer-notice">
          <span>⚠️ AI can be wrong, verify before you submit.</span>
        </div>

        <div class="examai-label">Question Detected</div>
        <div class="examai-question">${esc(captured.question)}</div>
        <div style="font-size:11px;color:#94a3b8;margin:6px 0;">Sent to AI: ${optionsCount} option(s) detected</div>

        ${looksLikeMCQ && optionsCount < 2 ? `
          <div class="examai-mcq-warning">
            ⚠️ MCQ detected but fewer than 2 options found. Select options with the question or edit them below.
          </div>
        ` : ""}

        <details class="examai-edit-box">
          <summary style="cursor:pointer;font-size:12px;color:#93c5fd;font-weight:600;">✏️ Edit before sending</summary>
          <div style="margin-top:8px;">
            <label style="font-size:11px;color:#94a3b8;display:block;">Question Prompt:</label>
            <textarea id="examai-edit-q" class="examai-edit-textarea">${esc(captured.question)}</textarea>
            <label style="font-size:11px;color:#94a3b8;display:block;margin-top:6px;">Options (one per line):</label>
            <textarea id="examai-edit-opts" class="examai-edit-textarea" placeholder="A. Option 1&#10;B. Option 2">${esc((captured.options || []).join("\n"))}</textarea>
            <button id="examai-submit-edit" class="examai-btn-action" style="margin-top:8px;background:#2563eb;border-color:#3b82f6;">Re-Analyze with Edits</button>
          </div>
        </details>

        <div class="examai-skeleton-container" style="margin-top:14px;">
          <div class="examai-skeleton-bar" style="width: 85%;"></div>
          <div class="examai-skeleton-bar" style="width: 100%;"></div>
          <div class="examai-skeleton-bar" style="width: 70%;"></div>
          <div style="text-align:center;color:#60a5fa;font-size:12px;margin-top:14px;">
            Solving from first principles, verifying sources & checking option integrity…
          </div>
          <ol id="examai-progress" class="examai-progress-list"><li data-step="classified">Waiting to classify</li><li data-step="searching">Waiting to search</li><li data-step="retrieved">Waiting for evidence</li><li data-step="solving">Waiting to solve</li><li data-step="verifying">Waiting to verify</li></ol>
          <button id="examai-cancel" class="examai-btn-action examai-cancel-btn">Cancel</button>
        </div>
      </div>`;

    makeDraggable(panel, panel.querySelector(".examai-head"));
    bindHeaderControls(panel, captured);
    bindEditBox(panel);
    panel.querySelector("#examai-cancel")?.addEventListener("click", () => activeAnalyzeController?.abort());
  }

  function updateStreamingProgress(event, data = {}) {
    const panel = document.getElementById(PANEL_ID);
    const item = panel?.querySelector(`#examai-progress [data-step="${event}"]`);
    if (!item) return;
    item.classList.add("examai-progress-complete");
    if (event === "retrieved") item.textContent = `Retrieved ${Number(data.count || 0)} source(s)`;
    else item.textContent = event.charAt(0).toUpperCase() + event.slice(1);
  }

  async function readAssessmentStream(response) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Streaming is not supported by this browser response.");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop();
      for (const block of blocks) {
        const event = block.match(/^event:\s*(.+)$/m)?.[1];
        const raw = block.match(/^data:\s*(.+)$/m)?.[1];
        if (!event || !raw) continue;
        const data = JSON.parse(raw);
        if (event === "error") {
          const error = new Error(data.message || "Analysis failed");
          error.code = data.code;
          throw error;
        }
        if (event === "done") return data.response;
        updateStreamingProgress(event, data);
      }
      if (done) break;
    }
    throw new Error("Analysis stream ended without a result.");
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
      setCfg({ theme: currentTheme });
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

  function bindEditBox(panel) {
    const editBtn = panel.querySelector("#examai-submit-edit");
    if (!editBtn) return;
    editBtn.onclick = () => {
      const qInput = panel.querySelector("#examai-edit-q");
      const optsInput = panel.querySelector("#examai-edit-opts");
      const newQ = (qInput?.value || "").trim();
      const rawOpts = (optsInput?.value || "").trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      if (newQ) {
        executeAnalyze({
          question: newQ,
          options: rawOpts
        });
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
    const quality = data.questionQuality || { status: "clear", reason: "", missing: "" };
    const needsQuestionEdit = quality.status && quality.status !== "clear";

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
    const sources = (data.sources || []).map((s, idx) => s.type === "course_notes" ? `
      <div class="examai-source-card">
        <strong>Matched your notes: ${esc(s.file || "Course note")}${s.page == null ? "" : ` p.${esc(s.page)}`}</strong>
        ${s.snippet ? `<p>${esc(s.snippet)}</p>` : ""}
      </div>
    ` : `
      <div class="examai-source-card">
        <a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">
          [${idx + 1}] ${esc(s.title || s.domain)}
        </a>
        <div class="examai-source-meta">
          <span>${esc(s.domain || "web")}</span>
          ${s.relevanceTier ? `<span class="examai-source-score">Relevance: ${esc(s.relevanceTier)}</span>` : ""}
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

    // Verification Status Badge
    const vStatus = data.verification?.status || "UNVERIFIED";
    const toolRecords = data.toolEvidence || [];
    const toolNames = { mathjs: "calculator", SymPy: "calculator", sandbox: "sandbox run", sqlite: "SQL execution" };
    const toolEvidenceHtml = toolRecords.length ? `
      <div class="examai-label">Tool verification</div>
      <div class="examai-tool-evidence">
        ${toolRecords.map(tool => `
          ${tool.executed && tool.success ? `<span class="examai-tool-badge">Verified by: ${esc(toolNames[tool.tool] || tool.tool)}</span>` : `<span class="examai-tool-failed">${esc(toolNames[tool.tool] || tool.tool)}: not verified</span>`}
          <details><summary>View tool output</summary><pre>${esc(tool.output || "No output")}</pre></details>
        `).join("")}
      </div>` : "";

    const safeOptionsCount = Array.isArray(captured?.options) && captured.options.length > 0
      ? captured.options.length
      : (Array.isArray(data.options) ? data.options.length : (Array.isArray(data.optionAnalysis) ? data.optionAnalysis.length : 0));

    const qualityWarningHtml = needsQuestionEdit ? `
      <div class="examai-quality-warning" role="alert">
        <strong>⚠️ Question needs revision: ${esc(String(quality.status).replace(/_/g, " "))}</strong>
        <span>${esc(quality.reason || "The visible prompt cannot support a reliable answer.")}</span>
        ${quality.missing ? `<span><strong>Please add:</strong> ${esc(quality.missing)}</span>` : ""}
      </div>` : "";

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
        <div class="examai-disclaimer-notice">
          <span>⚠️ AI can be wrong, verify before you submit.</span>
        </div>

        <div class="examai-label">
          <span>Question Prompt</span>
          ${data.difficulty ? `<small style="color:#94a3b8">${esc(data.difficulty)}</small>` : ""}
        </div>
        <div class="examai-question">${esc(data.question || captured.question)}</div>
        <div style="font-size:11px;color:#94a3b8;margin:6px 0;">Sent to AI: ${safeOptionsCount} option(s) detected</div>

        ${qualityWarningHtml}

        <div class="examai-direct-card">
          <div class="examai-direct-title">Direct Answer</div>
          <div class="examai-direct-text">${esc(directAnswerText)}</div>
        </div>

        <div class="examai-label" style="margin-top:12px;">
          <span>Confidence & Verification</span>
          <span class="examai-confidence-badge ${confClass}">● ${esc(confLevel)} (${esc(vStatus)})</span>
        </div>
        <div class="examai-notes-box">${esc(data.confidenceReason || "Verified against academic principles.")}</div>
        ${toolEvidenceHtml}

        ${conflictHtml}
        ${optionsHtml}
        ${stepsHtml}

        ${data.explanation ? `
          <div class="examai-label">Academic Explanation</div>
          <div class="examai-explanation">${esc(data.explanation)}</div>
        ` : ""}

        <div class="examai-label">Supporting Evidence (${(data.sources || []).length})</div>
        <div class="examai-sources-grid">
          ${sources || `<div style="font-size:12px;color:#94a3b8;">No web evidence retrieved or required for this question type.</div>`}
        </div>

        <details class="examai-edit-box" ${needsQuestionEdit ? "open" : ""}>
          <summary style="cursor:pointer;font-size:12px;color:#93c5fd;font-weight:600;">✏️ Edit question or options before re-analyzing</summary>
          <div style="margin-top:8px;">
            <label style="font-size:11px;color:#94a3b8;display:block;">Question Prompt:</label>
            <textarea id="examai-edit-q" class="examai-edit-textarea">${esc(data.question || captured.question)}</textarea>
            <label style="font-size:11px;color:#94a3b8;display:block;margin-top:6px;">Options (one per line):</label>
            <textarea id="examai-edit-opts" class="examai-edit-textarea">${esc((captured.options || []).join("\n"))}</textarea>
            <button id="examai-submit-edit" class="examai-btn-action" style="margin-top:8px;background:#2563eb;border-color:#3b82f6;">Re-Analyze with Edits</button>
          </div>
        </details>
      </div>
      <div class="examai-footer-bar">
        <button id="examai-copy-ans" class="examai-btn-action">📋 Copy Answer</button>
        <button id="examai-copy-expl" class="examai-btn-action">📋 Copy Explanation</button>
        <button id="examai-open-sources" class="examai-btn-action">🔗 Open Sources</button>
        <button id="examai-reanalyze" class="examai-btn-action">🔄 Re-Analyze</button>
      </div>`;

    makeDraggable(panel, panel.querySelector(".examai-head"));
    bindHeaderControls(panel, captured);
    bindEditBox(panel);
    if (needsQuestionEdit) {
      setTimeout(() => panel.querySelector("#examai-edit-q")?.focus(), 0);
    }

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
    if (!alive()) {
      showInvalidatedBanner();
      return;
    }

    if (!captured) return;
    let questionText = (captured.question || captured.text || "").trim();
    if (questionText.length < 3) return;

    // Ensure options are clean strings, avoiding [object Object]
    let safeOptions = (captured.options || []).map(o => {
      if (typeof o === "string") return o.trim();
      return (o.text || o.option || JSON.stringify(o)).trim();
    }).filter(Boolean);

    // Fallback: If no options detected from DOM containers, parse question text for embedded options
    if (safeOptions.length === 0) {
      const parsed = parseQuestionAndOptions(questionText);
      if (parsed.options.length >= 2) {
        questionText = parsed.question;
        safeOptions = parsed.options;
        captured.question = parsed.question;
        captured.options = parsed.options;
      }
    }

    console.log("EXAMASSIST SENDING:", {
      question: questionText,
      optionsCount: safeOptions.length,
      options: safeOptions
    });

    renderLoading(captured);

    try {
      const cfg = await getCfg({
        apiBase: "http://localhost:8787",
        theme: "dark",
        mode: "Practice Mode"
      });

      if (cfg.theme) currentTheme = cfg.theme;

      const identity = await chrome.storage.local.get({ localUserId: "" });
      if (!identity.localUserId) {
        identity.localUserId = crypto.randomUUID();
        await chrome.storage.local.set({ localUserId: identity.localUserId });
      }
      activeAnalyzeController?.abort();
      activeAnalyzeController = new AbortController();
      const res = await fetch(`${cfg.apiBase}/api/assessment/analyze/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-User-Id": identity.localUserId },
        signal: activeAnalyzeController.signal,
        body: JSON.stringify({
          question: questionText,
          options: safeOptions,
          codeSnippet: captured.codeSnippet || "",
          tableData: captured.tableData || "",
          mathFormula: captured.mathFormula || "",
          mode: currentMode
        })
      });

      if (!res.ok) {
        throw new Error(`Streaming request failed (${res.status})`);
      }
      const data = await readAssessmentStream(res);

      // Push to session history
      sessionHistory.push({ data, captured });
      currentHistoryIndex = sessionHistory.length - 1;

      renderResult(data, captured);
    } catch (err) {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        const isCancelled = err.name === "AbortError";
        const isNotConfigured = err.code === "AI_NOT_CONFIGURED" || String(err.message).includes("OPENAI_API_KEY");
        const isRateLimited = err.code === "AI_RATE_LIMITED" || String(err.message).includes("429") || String(err.message).includes("quota");
        panel.querySelector(".examai-body").innerHTML = `
          ${isCancelled ? `<div class="examai-config-banner"><strong>Analysis cancelled</strong> No answer was generated. Edit the visible question and re-analyze when ready.</div>` : isNotConfigured ? `
            <div class="examai-config-banner">
              <strong>⚠️ AI Key Not Configured</strong>
              Please add <code>OPENAI_API_KEY</code> in <code>server/.env</code> and restart the backend server to enable AI analysis.
            </div>
          ` : isRateLimited ? `
            <div style="padding:16px;background:#451a03;border:1px solid #b45309;border-radius:8px;color:#fef3c7;font-size:12.5px;">
              <strong style="display:block;margin-bottom:4px;color:#f59e0b;">⏳ AI Provider Rate Limit (429)</strong>
              Google Gemini rate limit or quota reached on the active model. The server rotates through backup models automatically.
              <div style="margin-top:8px;font-size:11.5px;color:#fde68a;">
                Please wait a moment and click <strong>🔄 Re-Analyze</strong>.
              </div>
            </div>
          ` : `
            <div style="padding:16px;background:#451a1a;border:1px solid #7f1d1d;border-radius:8px;color:#fecaca;font-size:12.5px;">
              <strong style="display:block;margin-bottom:4px;color:#f87171;">Assessment Error:</strong>
              ${esc(err.message)}
              <div style="margin-top:8px;font-size:11.5px;color:#fca5a5;">
                Ensure the backend is running at <code>http://localhost:8787</code> and reachable.
              </div>
            </div>
          `}`;
      }
    } finally {
      activeAnalyzeController = null;
    }
  }

  // --- TRIGGER 1: User Text Selection ---
  document.addEventListener("mouseup", async (e) => {
    if (!alive()) return;
    if (e.target.closest && e.target.closest(`#${PANEL_ID}`)) return;

    const allowed = await isSiteAllowed();
    if (!allowed) return;

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

    const cfg = await getCfg({ showFloatingButton: true });
    if (!cfg.showFloatingButton) return;

    const manager = getExtractionManager();
    const captured = manager ? manager.extractFromSelection(sel) : { question: text, options: [] };

    if (!captured.options || captured.options.length === 0) {
      const parsed = parseQuestionAndOptions(text);
      if (parsed.options.length >= 2) {
        captured.question = parsed.question;
        captured.options = parsed.options;
      }
    }

    if (captured && captured.question) {
      showFloatingButton(sel.getRangeAt(0), captured);
    }
  });

  // --- TRIGGER 2: User Copy Action (disabled by default) ---
  document.addEventListener("copy", async () => {
    if (!alive()) return;
    const allowed = await isSiteAllowed();
    if (!allowed) return;

    const sel = window.getSelection();
    const text = sel?.toString()?.trim();
    const cfg = await getCfg({ autoAnswerOnCopy: false });

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
  if (alive()) {
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (!alive()) return;
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
    } catch (e) {
      console.warn("[ExamAssist] Could not register onMessage listener:", e);
    }
  }

  // --- TRIGGER 4: In-page Keyboard Shortcut (Ctrl+Shift+E / Cmd+Shift+E) ---
  document.addEventListener("keydown", async (e) => {
    if (!alive()) return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "E" || e.key === "e")) {
      e.preventDefault();
      removeFloatingBtn();

      const allowed = await isSiteAllowed();
      if (!allowed) return;

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
  getCfg({ theme: "dark" }).then(res => {
    if (res && res.theme) currentTheme = res.theme;
  });
})();
