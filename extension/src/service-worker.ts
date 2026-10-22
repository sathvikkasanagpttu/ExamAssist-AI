/**
 * ExamAssist AI - Service Worker (Manifest V3, TypeScript)
 * Handles extension lifecycle, storage initialization, versioned settings migrations,
 * and validated message dispatch.
 */

import { validateExtensionMessage } from "./messaging";
import { DEFAULT_ALLOWED_SITES } from "./trigger";

export const SETTINGS_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  apiBase: "http://localhost:8787",
  autoAnswerOnCopy: false,
  showFloatingButton: true,
  enableAllSites: false,
  allowedSites: DEFAULT_ALLOWED_SITES,
  autoDetectOptions: true,
  settingsVersion: SETTINGS_SCHEMA_VERSION
};

export interface SettingsMigration {
  version: number;
  migrate: (settings: Record<string, unknown>) => Record<string, unknown>;
}

export const SETTINGS_MIGRATIONS: SettingsMigration[] = [
  {
    version: 1,
    migrate: (settings) => {
      // Schema version 1 baseline migration
      return {
        ...settings,
        settingsVersion: 1
      };
    }
  }
];

export function runSettingsMigrations(
  settings: Record<string, unknown>,
  targetVersion: number = SETTINGS_SCHEMA_VERSION
): Record<string, unknown> {
  let current = { ...settings };
  const currentVersion = Number(current.settingsVersion || 0);

  for (const m of SETTINGS_MIGRATIONS) {
    if (m.version > currentVersion && m.version <= targetVersion) {
      current = m.migrate(current);
    }
  }

  current.settingsVersion = targetVersion;
  return current;
}

export async function handleInstalled(details?: chrome.runtime.InstalledDetails) {
  const reason = details?.reason || "install";
  const existing = await chrome.storage.local.get(null);

  if (reason === "install") {
    const toWrite: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (existing[key] === undefined) {
        toWrite[key] = value;
      }
    }
    if (!existing.localUserId) {
      toWrite.localUserId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `usr_${Date.now()}`;
    }
    if (Object.keys(toWrite).length > 0) {
      await chrome.storage.local.set(toWrite);
    }
  } else if (reason === "update") {
    // Never overwrite apiBase, allowedSites, or any existing user settings on update!
    const migrated = runSettingsMigrations(existing, SETTINGS_SCHEMA_VERSION);
    const toWrite: Record<string, unknown> = {};

    // Only set missing default keys that the user does not already have
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (migrated[key] === undefined) {
        toWrite[key] = value;
      }
    }

    toWrite.settingsVersion = SETTINGS_SCHEMA_VERSION;
    if (!migrated.localUserId && !existing.localUserId) {
      toWrite.localUserId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `usr_${Date.now()}`;
    }

    if (Object.keys(toWrite).length > 0) {
      await chrome.storage.local.set(toWrite);
    }
  }

  // Guard contextMenus.create: removeAll first or safely catch duplicate-id errors
  setupContextMenu();
}

function setupContextMenu() {
  if (typeof chrome === "undefined" || !chrome.contextMenus) return;

  const createMenu = () => {
    try {
      chrome.contextMenus.create(
        {
          id: "examai-research-question",
          title: "Research Question with ExamAI",
          contexts: ["selection"]
        },
        () => {
          if (chrome.runtime?.lastError) {
            // Ignore duplicate ID error on reloads/updates
          }
        }
      );
    } catch {
      // Ignore duplicate error synchronously
    }
  };

  if (typeof chrome.contextMenus.removeAll === "function") {
    chrome.contextMenus.removeAll(() => {
      createMenu();
    });
  } else {
    createMenu();
  }
}

if (typeof chrome !== "undefined" && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener((details) => {
    handleInstalled(details).catch((err) => {
      console.warn("[ExamAI Service Worker] onInstalled error:", err);
    });
  });
}

if (typeof chrome !== "undefined" && chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "examai-research-question" && tab?.id) {
      try {
        const msg = validateExtensionMessage({
          type: "RESEARCH_SELECTION",
          text: info.selectionText || ""
        });
        await chrome.tabs.sendMessage(tab.id, msg);
      } catch (err) {
        console.warn("[ExamAI Service Worker] Could not send message to tab:", err);
      }
    }
  });
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: { type?: string }, sender, sendResponse) => {
    if (message?.type === "OPEN_OPTIONS") {
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === "CAPTURE_VISIBLE_TAB") {
      const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({ ok: false, error: chrome.runtime.lastError?.message || "captureVisibleTab failed" });
        } else {
          sendResponse({ ok: true, dataUrl });
        }
      });
      return true;
    }
    return false;
  });
}

if (typeof chrome !== "undefined" && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === "analyze_question") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          const msg = validateExtensionMessage({ type: "TRIGGER_EXAM_ASSIST" });
          chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
        }
      });
    }
  });
}
