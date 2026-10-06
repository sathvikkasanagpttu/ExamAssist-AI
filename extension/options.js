/**
 * ExamAI Study Assistant - Options & Settings Script
 * Manifest V3 CSP-compliant external script.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const apiInput = document.getElementById("api");
  const saveBtn = document.getElementById("save");
  const testBtn = document.getElementById("test");
  const statusEl = document.getElementById("status");
  const autoCopyCheckbox = document.getElementById("autoCopy");
  const showFloatingCheckbox = document.getElementById("showFloating");
  const autoDetectCheckbox = document.getElementById("autoDetectOptions");

  // Load existing configuration from chrome.storage.local
  const config = await chrome.storage.local.get({
    apiBase: "http://localhost:8787",
    autoAnswerOnCopy: false,
    showFloatingButton: true,
    autoDetectOptions: true
  });

  if (apiInput) apiInput.value = config.apiBase;
  if (autoCopyCheckbox) autoCopyCheckbox.checked = config.autoAnswerOnCopy;
  if (showFloatingCheckbox) showFloatingCheckbox.checked = config.showFloatingButton;
  if (autoDetectCheckbox) autoDetectCheckbox.checked = config.autoDetectOptions;

  function showStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = isError ? "status-error" : "status-success";
    statusEl.style.display = "block";
    setTimeout(() => {
      statusEl.style.display = "none";
    }, 4000);
  }

  // Save Settings
  saveBtn.addEventListener("click", async () => {
    let base = (apiInput.value || "").trim().replace(/\/+$/, "");
    if (!base) {
      base = "http://localhost:8787";
      apiInput.value = base;
    }

    const autoAnswer = autoCopyCheckbox ? autoCopyCheckbox.checked : false;
    const showFloating = showFloatingCheckbox ? showFloatingCheckbox.checked : true;
    const autoDetect = autoDetectCheckbox ? autoDetectCheckbox.checked : true;

    await chrome.storage.local.set({
      apiBase: base,
      autoAnswerOnCopy: autoAnswer,
      showFloatingButton: showFloating,
      autoDetectOptions: autoDetect
    });

    showStatus("Settings saved successfully.");
  });

  // Test Server Connection
  if (testBtn) {
    testBtn.addEventListener("click", async () => {
      const base = (apiInput.value || "").trim().replace(/\/+$/, "");
      showStatus("Testing connection to " + base + "…");

      try {
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        showStatus(`✓ Connected to ${data.service || "ExamAI Server"} (${data.version || "v2.0"})`);
      } catch (err) {
        showStatus(`✗ Connection failed: ${err.message}. Is the backend running?`, true);
      }
    });
  }
});
