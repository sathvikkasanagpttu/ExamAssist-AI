/**
 * ExamAI Study Assistant - Service Worker (Manifest V3)
 * Handles extension lifecycle, storage initialization, and context menu actions.
 */

chrome.runtime.onInstalled.addListener(async () => {
  // Set default settings
  await chrome.storage.local.set({
    apiBase: "http://localhost:8787",
    autoAnswerOnCopy: false,
    showFloatingButton: true,
    autoDetectOptions: true
  });

  // Create context menu for selected text
  chrome.contextMenus.create({
    id: "examai-research-question",
    title: "Research Question with ExamAI",
    contexts: ["selection"]
  });
});

// Context menu click listener
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "examai-research-question" && tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "RESEARCH_SELECTION",
        text: info.selectionText || ""
      });
    } catch (err) {
      console.warn("[ExamAI Service Worker] Could not send message to tab:", err);
    }
  }
});

// Message listener from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

// Keyboard shortcut command listener
chrome.commands.onCommand.addListener((command) => {
  if (command === "analyze_question") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "TRIGGER_EXAM_ASSIST" }).catch(() => {});
      }
    });
  }
});