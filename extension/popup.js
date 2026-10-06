/**
 * ExamAssist AI - Popup Script
 * Checks server health, reports AI configuration, manages site allow-list,
 * and coordinates on-page assessment analysis.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("server-status");
  const aiWarningEl = document.getElementById("ai-warning");
  const siteDomainEl = document.getElementById("siteDomain");
  const siteToggleBtn = document.getElementById("siteToggleBtn");
  const floatingToggle = document.getElementById("floatingToggle");
  const allSitesToggle = document.getElementById("allSitesToggle");
  const autoCopyToggle = document.getElementById("autoCopyToggle");
  const questionInput = document.getElementById("questionInput");
  const askBtn = document.getElementById("askBtn");
  const optionsBtn = document.getElementById("optionsBtn");

  // Load preferences
  const config = await chrome.storage.local.get({
    apiBase: "http://localhost:8787",
    autoAnswerOnCopy: false,
    showFloatingButton: true,
    enableAllSites: false,
    allowedSites: ["localhost", "127.0.0.1"]
  });

  if (floatingToggle) floatingToggle.checked = config.showFloatingButton;
  if (autoCopyToggle) autoCopyToggle.checked = config.autoAnswerOnCopy;
  if (allSitesToggle) allSitesToggle.checked = config.enableAllSites;

  // 1. Detect current tab and site allow-list status
  let currentHostname = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const url = new URL(tab.url);
      currentHostname = url.hostname;
      siteDomainEl.textContent = currentHostname;

      const isAllowed = config.enableAllSites || config.allowedSites.includes(currentHostname);
      updateSiteBtn(isAllowed);
    } else {
      siteDomainEl.textContent = "No active page";
      siteToggleBtn.style.display = "none";
    }
  } catch {
    siteDomainEl.textContent = "Unknown site";
  }

  function updateSiteBtn(isAllowed) {
    if (isAllowed) {
      siteToggleBtn.textContent = "✓ Enabled on site";
      siteToggleBtn.className = "btn-toggle-site enabled";
    } else {
      siteToggleBtn.textContent = "+ Enable on site";
      siteToggleBtn.className = "btn-toggle-site";
    }
  }

  // Handle site toggle
  siteToggleBtn.addEventListener("click", async () => {
    if (!currentHostname) return;
    const currentList = Array.isArray(config.allowedSites) ? [...config.allowedSites] : [];
    const idx = currentList.indexOf(currentHostname);
    let newState = false;

    if (idx >= 0) {
      currentList.splice(idx, 1);
      newState = false;
    } else {
      currentList.push(currentHostname);
      newState = true;
    }

    config.allowedSites = currentList;
    await chrome.storage.local.set({ allowedSites: currentList });
    updateSiteBtn(newState || config.enableAllSites);
  });

  // 2. Check Backend Server Health & AI Configuration
  try {
    const res = await fetch(`${config.apiBase}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      statusEl.textContent = "● Online";
      statusEl.className = "status-pill status-online";
      statusEl.title = `Model: ${data.model || "gpt-4o"} | Search: ${data.searchProvider || "none"}`;

      if (data.aiConfigured === false) {
        aiWarningEl.style.display = "block";
      } else {
        aiWarningEl.style.display = "none";
      }
    } else {
      statusEl.textContent = "● Error";
      statusEl.className = "status-pill status-error";
    }
  } catch {
    statusEl.textContent = "● Offline";
    statusEl.className = "status-pill status-error";
  }

  // 3. Handle Preferences Toggles
  if (floatingToggle) {
    floatingToggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ showFloatingButton: floatingToggle.checked });
    });
  }

  if (allSitesToggle) {
    allSitesToggle.addEventListener("change", async () => {
      config.enableAllSites = allSitesToggle.checked;
      await chrome.storage.local.set({ enableAllSites: allSitesToggle.checked });
      const isAllowed = allSitesToggle.checked || config.allowedSites.includes(currentHostname);
      updateSiteBtn(isAllowed);
    });
  }

  if (autoCopyToggle) {
    autoCopyToggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ autoAnswerOnCopy: autoCopyToggle.checked });
    });
  }

  // 4. Dispatch Question Analysis to Active Tab
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

  // 5. Open Options Page
  if (optionsBtn) {
    optionsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  }
});