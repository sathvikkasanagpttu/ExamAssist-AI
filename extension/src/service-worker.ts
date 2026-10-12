/**
 * ExamAssist AI - Service Worker (Manifest V3, TypeScript)
 * Handles extension lifecycle, storage initialization, and validated message dispatch.
 */

import { validateExtensionMessage } from "./messaging";
import { DEFAULT_ALLOWED_SITES } from "./trigger";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    apiBase: "http://localhost:8787",
    autoAnswerOnCopy: false,
    showFloatingButton: true,
    enableAllSites: false,
    allowedSites: DEFAULT_ALLOWED_SITES,
    autoDetectOptions: true
  });
  const { localUserId } = await chrome.storage.local.get("localUserId");
  if (!localUserId) {
    await chrome.storage.local.set({ localUserId: crypto.randomUUID() });
  }

  chrome.contextMenus.create({
    id: "examai-research-question",
    title: "Research Question with ExamAI",
    contexts: ["selection"]
  });
});

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
