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

if (typeof chrome !== "undefined" && chrome.runtime?.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "examai-stream-assessment") {
      let abortController: AbortController | null = new AbortController();

      port.onDisconnect.addListener(() => {
        abortController?.abort();
        abortController = null;
      });

      port.onMessage.addListener(async (msg: {
        type?: string;
        request?: unknown;
        apiBase?: string;
        localUserId?: string;
      }) => {
        if (msg?.type === "START_STREAM" && msg.request) {
          try {
            const apiBase = (msg.apiBase || "http://localhost:8787").replace(/\/+$/, "");
            const res = await fetch(`${apiBase}/api/assessment/analyze/stream`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Local-User-Id": msg.localUserId || ""
              },
              signal: abortController?.signal,
              body: JSON.stringify(msg.request)
            });

            if (!res.ok) {
              let errPayload: Record<string, unknown> = {};
              try {
                errPayload = (await res.json()) as Record<string, unknown>;
              } catch {}
              port.postMessage({
                type: "ERROR",
                error: {
                  message: String(errPayload.error || `Streaming request failed (${res.status})`),
                  code: typeof errPayload.code === "string" ? errPayload.code : undefined
                }
              });
              return;
            }

            const reader = res.body?.getReader();
            if (!reader) {
              port.postMessage({
                type: "ERROR",
                error: { message: "Streaming response body is unavailable." }
              });
              return;
            }

            const decoder = new TextDecoder();
            let buffer = "";
            let finalResult: Record<string, unknown> | null = null;

            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const events = buffer.split("\n\n");
              buffer = events.pop() || "";

              for (const rawEvent of events) {
                const lines = rawEvent.split(/\r?\n/);
                const eventType = lines
                  .find((line) => line.startsWith("event:"))
                  ?.slice(6)
                  .trim();
                const dataLine = lines
                  .filter((line) => line.startsWith("data:"))
                  .map((line) => line.slice(5).trim())
                  .join("\n");
                if (!dataLine) continue;

                try {
                  const payload = JSON.parse(dataLine) as Record<string, unknown>;
                  port.postMessage({
                    type: "EVENT",
                    eventType,
                    payload
                  });
                  if (eventType === "done") {
                    finalResult =
                      payload.response && typeof payload.response === "object"
                        ? (payload.response as Record<string, unknown>)
                        : payload;
                  }
                } catch {}
              }
            }

            port.postMessage({
              type: "COMPLETE",
              result: finalResult
            });
          } catch (err) {
            const e = err as Error & { code?: string };
            if (e.name !== "AbortError") {
              port.postMessage({
                type: "ERROR",
                error: {
                  message: e.message || "Request failed",
                  code: e.code
                }
              });
            }
          }
        }
      });
    }
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
