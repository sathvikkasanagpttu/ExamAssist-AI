/**
 * ExamAssist AI - Popup Controller (TypeScript)
 * Checks server health, reports AI configuration, requests per-site access at
 * runtime via chrome.permissions.request, configures deployed API base URL,
 * and dispatches Zod-validated messages.
 */

import { validateExtensionMessage } from "./messaging";
import { DEFAULT_ALLOWED_SITES } from "./trigger";

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

function isHostInAllowList(hostname: string, allowedSites: string[] = []): boolean {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  return allowedSites.some((site) => {
    const clean = String(site || "")
      .toLowerCase()
      .replace(/^\*\./, "");
    return host === clean || host.endsWith(`.${clean}`);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("server-status");
  const aiWarningEl = document.getElementById("ai-warning");
  const siteDomainEl = document.getElementById("siteDomain");
  const siteToggleBtn = document.getElementById("siteToggleBtn") as HTMLButtonElement | null;
  const floatingToggle = document.getElementById("floatingToggle") as HTMLInputElement | null;
  const allSitesToggle = document.getElementById("allSitesToggle") as HTMLInputElement | null;
  const autoCopyToggle = document.getElementById("autoCopyToggle") as HTMLInputElement | null;
  const questionInput = document.getElementById("questionInput") as HTMLTextAreaElement | null;
  const askBtn = document.getElementById("askBtn") as HTMLButtonElement | null;
  const optionsBtn = document.getElementById("optionsBtn") as HTMLButtonElement | null;
  const apiBaseInput = document.getElementById("apiBaseInput") as HTMLInputElement | null;
  const saveApiBaseBtn = document.getElementById("saveApiBaseBtn") as HTMLButtonElement | null;

  const config = (await chrome.storage.local.get({
    apiBase: "http://localhost:8787",
    autoAnswerOnCopy: false,
    showFloatingButton: true,
    enableAllSites: false,
    allowedSites: DEFAULT_ALLOWED_SITES
  })) as {
    apiBase: string;
    autoAnswerOnCopy: boolean;
    showFloatingButton: boolean;
    enableAllSites: boolean;
    allowedSites: string[];
  };

  if (floatingToggle) floatingToggle.checked = config.showFloatingButton;
  if (autoCopyToggle) autoCopyToggle.checked = config.autoAnswerOnCopy;
  if (allSitesToggle) allSitesToggle.checked = config.enableAllSites;
  if (apiBaseInput) apiBaseInput.value = config.apiBase || "http://localhost:8787";

  let activeTab: chrome.tabs.Tab | null = null;
  let currentHostname = "";
  let currentOriginPattern = "";

  function updateSiteBtn(isAllowed: boolean): void {
    if (!siteToggleBtn) return;
    if (isAllowed) {
      siteToggleBtn.textContent = "✓ Enabled on this site";
      siteToggleBtn.className = "btn-toggle-site enabled";
    } else {
      siteToggleBtn.textContent = "Enable on this site";
      siteToggleBtn.className = "btn-toggle-site";
    }
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab || null;
    if (tab?.url && /^https?:/i.test(tab.url)) {
      const url = new URL(tab.url);
      currentHostname = url.hostname;
      currentOriginPattern = `${url.protocol}//${url.hostname}/*`;
      if (siteDomainEl) siteDomainEl.textContent = currentHostname;

      const hasPerm = await chrome.permissions.contains({ origins: [currentOriginPattern] }).catch(() => false);
      const isAllowed =
        config.enableAllSites ||
        (hasPerm && isHostInAllowList(currentHostname, config.allowedSites)) ||
        isHostInAllowList(currentHostname, DEFAULT_ALLOWED_SITES);
      updateSiteBtn(isAllowed);
    } else {
      if (siteDomainEl) siteDomainEl.textContent = "No web page active";
      if (siteToggleBtn) siteToggleBtn.style.display = "none";
    }
  } catch {
    if (siteDomainEl) siteDomainEl.textContent = "Unknown site";
  }

  async function injectContentScriptsIfNeeded(tabId?: number): Promise<void> {
    if (!tabId || !chrome.scripting) return;
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] }).catch(() => {});
      await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
    } catch (err) {
      console.warn("[ExamAssist Popup] Content script injection warning:", err);
    }
  }

  siteToggleBtn?.addEventListener("click", async () => {
    if (!currentHostname || !currentOriginPattern) return;
    const currentList = Array.isArray(config.allowedSites) ? [...config.allowedSites] : [...DEFAULT_ALLOWED_SITES];
    const currentlyAllowed = isHostInAllowList(currentHostname, currentList);

    if (currentlyAllowed) {
      const filtered = currentList.filter((site) => {
        const clean = String(site || "")
          .toLowerCase()
          .replace(/^\*\./, "");
        return currentHostname.toLowerCase() !== clean && !currentHostname.toLowerCase().endsWith(`.${clean}`);
      });
      config.allowedSites = filtered;
      await chrome.storage.local.set({ allowedSites: filtered });
      if (!isHostInAllowList(currentHostname, DEFAULT_ALLOWED_SITES)) {
        await chrome.permissions.remove({ origins: [currentOriginPattern] }).catch(() => {});
      }
      updateSiteBtn(config.enableAllSites);
    } else {
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

  async function checkBackendHealth(baseUrl: string): Promise<void> {
    const cleanBase = String(baseUrl || "http://localhost:8787")
      .trim()
      .replace(/\/+$/, "");
    try {
      const res = await fetch(`${cleanBase}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = (await res.json()) as { model?: string; searchProvider?: string; aiConfigured?: boolean };
        if (statusEl) {
          statusEl.textContent = "● Online";
          statusEl.className = "status-pill status-online";
          statusEl.title = `Model: ${data.model || "gpt-4o"} | Search: ${data.searchProvider || "none"}`;
        }
        if (aiWarningEl) {
          aiWarningEl.style.display = data.aiConfigured === false ? "block" : "none";
        }
      } else if (statusEl) {
        statusEl.textContent = "● Error";
        statusEl.className = "status-pill status-error";
      }
    } catch {
      if (statusEl) {
        statusEl.textContent = "● Offline";
        statusEl.className = "status-pill status-error";
      }
    }
  }

  await checkBackendHealth(config.apiBase);

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
        setTimeout(() => {
          saveApiBaseBtn.textContent = "Save";
        }, 1500);
        await checkBackendHealth(config.apiBase);
      } catch {
        saveApiBaseBtn.textContent = "Invalid URL";
        setTimeout(() => {
          saveApiBaseBtn.textContent = "Save";
        }, 1500);
      }
    });
  }

  floatingToggle?.addEventListener("change", async () => {
    await chrome.storage.local.set({ showFloatingButton: floatingToggle.checked });
  });

  allSitesToggle?.addEventListener("change", async () => {
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

  autoCopyToggle?.addEventListener("change", async () => {
    await chrome.storage.local.set({ autoAnswerOnCopy: autoCopyToggle.checked });
  });

  askBtn?.addEventListener("click", async () => {
    const question = (questionInput?.value || "").trim();
    if (!question) return;

    const msg = validateExtensionMessage({ type: "ASK", question });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, msg);
        window.close();
      } catch {
        if (currentOriginPattern) {
          const granted = await chrome.permissions.request({ origins: [currentOriginPattern] }).catch(() => false);
          if (granted) {
            await injectContentScriptsIfNeeded(tab.id);
            await chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
            window.close();
            return;
          }
        }
        alert("Please click 'Enable on this site' first to activate the assessment assistant on this page.");
      }
    }
  });

  optionsBtn?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});
