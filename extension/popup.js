/**
 * ExamAI Study Assistant - Popup Script
 * Checks server health, handles toggles, and allows instant research dispatches.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("server-status");
  const floatingToggle = document.getElementById("floatingToggle");
  const autoCopyToggle = document.getElementById("autoCopyToggle");
  const questionInput = document.getElementById("questionInput");
  const askBtn = document.getElementById("askBtn");
  const optionsBtn = document.getElementById("optionsBtn");

  // Load preferences
  const config = await chrome.storage.local.get({
    apiBase: "http://localhost:8787",
    autoAnswerOnCopy: true,
    showFloatingButton: true
  });

  if (floatingToggle) floatingToggle.checked = config.showFloatingButton;
  if (autoCopyToggle) autoCopyToggle.checked = config.autoAnswerOnCopy;

  // Check Backend Server Health
  try {
    const res = await fetch(`${config.apiBase}/health`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      statusEl.textContent = "● Online";
      statusEl.className = "status-pill status-online";
    } else {
      statusEl.textContent = "● Error";
    }
  } catch {
    statusEl.textContent = "● Offline";
  }

  // Handle toggles
  if (floatingToggle) {
    floatingToggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ showFloatingButton: floatingToggle.checked });
    });
  }

  if (autoCopyToggle) {
    autoCopyToggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ autoAnswerOnCopy: autoCopyToggle.checked });
    });
  }

  // Dispatch question research to active tab
  if (askBtn) {
    askBtn.addEventListener("click", async () => {
      const question = (questionInput.value || "").trim();
      if (!question) return;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "ASK",
            question
          });
          window.close();
        } catch {
          alert("Please open or refresh a web page to view the on-page assessment assistant.");
        }
      }
    });
  }

  // Open Options Page
  if (optionsBtn) {
    optionsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  }
});