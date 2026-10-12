/**
 * ExamAssist AI - Popup Script
 * Checks server health, reports AI configuration, requests per-site access at
 * runtime via chrome.permissions.request, configures deployed API base URL,
 * and coordinates on-page assessment analysis.
 */

const DEFAULT_ALLOWED_SITES = [
  "localhost",
  "127.0.0.1",
  "hackerrank.com",
  "leetcode.com",
  "geeksforgeeks.org",
  "instructure.com"
];

const CONTENT_SCRIPT_FILES = [
  "extractors/BaseExtractor.js",
  "extractors/EditorAdapters.js",
  "extractors/ProblemAdapters.js",
  "extractors/GenericExtractor.js",
  "extractors/MoodleAdapter.js",
  "extractors/CanvasAdapter.js",
  "extractors/CustomPortalAdapter.js",
  "extractors/ExtractionManager.js",
  "content.js"
];

function isHostInAllowList(hostname, allowedSites = []) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  return allowedSites.some((site) => {
    const clean = String(site || "").toLowerCase().replace(/^\*\./, "");
    return host === clean || host.endsWith(`.${clean}`);
  });
}

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
  const apiBaseInput = document.getElementById("apiBaseInput");
  const saveApiBaseBtn = document.getElementById("saveApiBaseBtn");

  // Load preferences
  const config = await chrome.storage.local.get({
    apiBase: "http://localhost:8787",
    autoAnswerOnCopy: false,
    showFloatingButton: true,
    enableAllSites: false,
    allowedSites: DEFAULT_ALLOWED_SITES
  });

  if (floatingToggle) floatingToggle.checked = config.showFloatingButton;
  if (autoCopyToggle) autoCopyToggle.checked = config.autoAnswerOnCopy;
  if (allSitesToggle) allSitesToggle.checked = config.enableAllSites;
  if (apiBaseInput) apiBaseInput.value = config.apiBase || "http://localhost:8787";

  // 1. Detect current tab and site allow-list + runtime permission status
  let activeTab = null;
  let currentHostname = "";
  let currentOriginPattern = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab || null;
    if (tab?.url && /^https?:/i.test(tab.url)) {
      const url = new URL(tab.url);
      currentHostname = url.hostname;
      currentOriginPattern = `${url.protocol}//${url.hostname}/*`;
      siteDomainEl.textContent = currentHostname;

      const hasPerm = await chrome.permissions.contains({ origins: [currentOriginPattern] }).catch(() => false);
      const isAllowed = config.enableAllSites || (hasPerm && isHostInAllowList(currentHostname, config.allowedSites)) || isHostInAllowList(currentHostname, DEFAULT_ALLOWED_SITES);
      updateSiteBtn(isAllowed);
    } else {
      siteDomainEl.textContent = "No web page active";
      siteToggleBtn.style.display = "none";
    }
  } catch {
    siteDomainEl.textContent = "Unknown site";
  }

  function updateSiteBtn(isAllowed) {
    if (isAllowed) {
      siteToggleBtn.textContent = "✓ Enabled on this site";
      siteToggleBtn.className = "btn-toggle-site enabled";
    } else {
      siteToggleBtn.textContent = "Enable on this site";
      siteToggleBtn.className = "btn-toggle-site";
    }
  }

  async function injectContentScriptsIfNeeded(tabId) {
    if (!tabId || !chrome.scripting) return;
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] }).catch(() => {});
      await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
    } catch (err) {
      console.warn("[ExamAssist Popup] Content script injection warning:", err);
    }
  }

  // Handle per-site runtime permission request ("Enable on this site")
  siteToggleBtn.addEventListener("click", async () => {
    if (!currentHostname || !currentOriginPattern) return;
    const currentList = Array.isArray(config.allowedSites) ? [...config.allowedSites] : [...DEFAULT_ALLOWED_SITES];
    const currentlyAllowed = isHostInAllowList(currentHostname, currentList);

    if (currentlyAllowed) {
      const filtered = currentList.filter((site) => {
        const clean = String(site || "").toLowerCase().replace(/^\*\./, "");
        return currentHostname.toLowerCase() !== clean && !currentHostname.toLowerCase().endsWith(`.${clean}`);
      });
      config.allowedSites = filtered;
      await chrome.storage.local.set({ allowedSites: filtered });
      if (!isHostInAllowList(currentHostname, DEFAULT_ALLOWED_SITES)) {
        await chrome.permissions.remove({ origins: [currentOriginPattern] }).catch(() => {});
      }
      updateSiteBtn(config.enableAllSites);
    } else {
      // Request per-site access at runtime directly from the user click gesture
      const granted = await chrome.permissions.request({ origins: [currentOriginPattern] }).catch(() => false);
      if (!granted) return;

      if (!currentList.includes(currentHostname)) {
        currentList.push(currentHostname);
      }
      config.allowedSites = currentList;
      await chrome.storage.local.set({ allowedSites: currentList });
      if (activeTab?.id) {
        await injectContentScriptsIfNeeded(activeTab.id);
      }
      updateSiteBtn(true);
    }
  });

  // 2. Check Backend Server Health & AI Configuration
  async function checkBackendHealth(baseUrl) {
    const cleanBase = String(baseUrl || "http://localhost:8787").trim().replace(/\/+$/, "");
    try {
      const res = await fetch(`${cleanBase}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        statusEl.textContent = "● Online";
        statusEl.className = "status-pill status-online";
        statusEl.title = `Model: ${data.model || "gpt-4o"} | Search: ${data.searchProvider || "none"}`;
        aiWarningEl.style.display = data.aiConfigured === false ? "block" : "none";
      } else {
        statusEl.textContent = "● Error";
        statusEl.className = "status-pill status-error";
      }
    } catch {
      statusEl.textContent = "● Offline";
      statusEl.className = "status-pill status-error";
    }
  }

  await checkBackendHealth(config.apiBase);

  // Save configurable API Base URL for deployed backends
  if (saveApiBaseBtn && apiBaseInput) {
    saveApiBaseBtn.addEventListener("click", async () => {
      const raw = (apiBaseInput.value || "").trim().replace(/\/+$/, "") || "http://localhost:8787";
      try {
        const parsed = new URL(raw);
        if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
          await chrome.permissions.request({ origins: [`${parsed.protocol}//${parsed.hostname}/*`] }).catch(() => {});
        }
        config.apiBase = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, "")}`;
        apiBaseInput.value = config.apiBase;
        await chrome.storage.local.set({ apiBase: config.apiBase });
        saveApiBaseBtn.textContent = "Saved";
        setTimeout(() => { saveApiBaseBtn.textContent = "Save"; }, 1500);
        await checkBackendHealth(config.apiBase);
      } catch {
        saveApiBaseBtn.textContent = "Invalid URL";
        setTimeout(() => { saveApiBaseBtn.textContent = "Save"; }, 1500);
      }
    });
  }

  // 3. Handle Preferences Toggles
  if (floatingToggle) {
    floatingToggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ showFloatingButton: floatingToggle.checked });
    });
  }

  if (allSitesToggle) {
    allSitesToggle.addEventListener("change", async () => {
      if (allSitesToggle.checked) {
        const granted = await chrome.permissions.request({ origins: ["https://*/*", "http://*/*"] }).catch(() => false);
        if (!granted) {
          allSitesToggle.checked = false;
          return;
        }
      }
      config.enableAllSites = allSitesToggle.checked;
      await chrome.storage.local.set({ enableAllSites: allSitesToggle.checked });
      const isAllowed = allSitesToggle.checked || isHostInAllowList(currentHostname, config.allowedSites);
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
          if (currentOriginPattern) {
            const granted = await chrome.permissions.request({ origins: [currentOriginPattern] }).catch(() => false);
            if (granted) {
              await injectContentScriptsIfNeeded(tab.id);
              await chrome.tabs.sendMessage(tab.id, { type: "ASK", question }).catch(() => {});
              window.close();
              return;
            }
          }
          alert("Please click 'Enable on this site' first to activate the assessment assistant on this page.");
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