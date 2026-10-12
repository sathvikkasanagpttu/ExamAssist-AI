(function() {
  "use strict";
  document.addEventListener("DOMContentLoaded", async () => {
    const apiInput = document.getElementById("api");
    const saveBtn = document.getElementById("save");
    const testBtn = document.getElementById("test");
    const statusEl = document.getElementById("status");
    const autoCopyCheckbox = document.getElementById("autoCopy");
    const showFloatingCheckbox = document.getElementById("showFloating");
    const autoDetectCheckbox = document.getElementById("autoDetectOptions");
    const kbFileInput = document.getElementById("kb-file");
    const kbUploadButton = document.getElementById("kb-upload");
    const kbDocuments = document.getElementById("kb-documents");
    const kbStorage = document.getElementById("kb-storage");
    const config = await chrome.storage.local.get({
      apiBase: "http://localhost:8787",
      autoAnswerOnCopy: false,
      showFloatingButton: true,
      autoDetectOptions: true,
      localUserId: ""
    });
    if (!config.localUserId) {
      config.localUserId = crypto.randomUUID();
      await chrome.storage.local.set({ localUserId: config.localUserId });
    }
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
      }, 4e3);
    }
    const kbHeaders = { "X-Local-User-Id": config.localUserId };
    const formatBytes = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    async function loadDocuments() {
      if (!kbStorage || !kbDocuments) return;
      try {
        const response = await fetch(`${config.apiBase}/api/kb/documents`, {
          headers: kbHeaders,
          signal: AbortSignal.timeout(5e3)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        kbStorage.textContent = `Storage used: ${formatBytes(data.storageUsedBytes || 0)}`;
        kbDocuments.replaceChildren();
        if (!data.documents.length) {
          kbDocuments.textContent = "No course notes uploaded.";
          kbDocuments.className = "kb-doc-meta";
        }
        for (const item of data.documents) {
          const row = document.createElement("div");
          row.className = "kb-doc-row";
          const meta = document.createElement("div");
          meta.className = "kb-doc-meta";
          meta.textContent = `${item.file_name} · ${formatBytes(Number(item.byte_size))}`;
          const remove = document.createElement("button");
          remove.className = "kb-doc-delete";
          remove.textContent = "Delete";
          remove.addEventListener("click", async () => {
            try {
              const result = await fetch(`${config.apiBase}/api/kb/documents/${encodeURIComponent(item.id)}`, {
                method: "DELETE",
                headers: kbHeaders
              });
              const body = await result.json();
              if (!result.ok) throw new Error(body.error || `HTTP ${result.status}`);
              await loadDocuments();
              showStatus("Course note and its stored chunks were deleted.");
            } catch (error) {
              const e = error;
              showStatus(`Could not delete note: ${e.message}`, true);
            }
          });
          row.append(meta, remove);
          kbDocuments.append(row);
        }
      } catch {
        kbStorage.textContent = "Storage used: Course Notes backend unavailable";
        kbDocuments.textContent = "Start the backend with Postgres/pgvector enabled to manage notes.";
        kbDocuments.className = "kb-doc-meta";
      }
    }
    kbUploadButton == null ? void 0 : kbUploadButton.addEventListener("click", async () => {
      var _a;
      const file = (_a = kbFileInput == null ? void 0 : kbFileInput.files) == null ? void 0 : _a[0];
      if (!file) return showStatus("Choose a PDF, DOCX, Markdown, or text file first.", true);
      const form = new FormData();
      form.append("file", file);
      kbUploadButton.disabled = true;
      try {
        const response = await fetch(`${config.apiBase}/api/kb/documents`, {
          method: "POST",
          headers: kbHeaders,
          body: form
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (kbFileInput) kbFileInput.value = "";
        await loadDocuments();
        showStatus(data.document.duplicate ? "This document is already stored." : "Course notes uploaded and indexed.");
      } catch (error) {
        const e = error;
        showStatus(`Could not upload notes: ${e.message}`, true);
      } finally {
        kbUploadButton.disabled = false;
      }
    });
    void loadDocuments();
    saveBtn == null ? void 0 : saveBtn.addEventListener("click", async () => {
      var _a;
      let base = ((apiInput == null ? void 0 : apiInput.value) || "").trim().replace(/\/+$/, "");
      if (!base) {
        base = "http://localhost:8787";
        if (apiInput) apiInput.value = base;
      }
      try {
        const parsed = new URL(base);
        if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1" && ((_a = chrome.permissions) == null ? void 0 : _a.request)) {
          await chrome.permissions.request({ origins: [`${parsed.protocol}//${parsed.hostname}/*`] }).catch(() => {
          });
        }
        base = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, "")}`;
        if (apiInput) apiInput.value = base;
      } catch {
        return showStatus("Please enter a valid http:// or https:// Backend Server URL.", true);
      }
      const autoAnswer = autoCopyCheckbox ? autoCopyCheckbox.checked : false;
      const showFloating = showFloatingCheckbox ? showFloatingCheckbox.checked : true;
      const autoDetect = autoDetectCheckbox ? autoDetectCheckbox.checked : true;
      config.apiBase = base;
      await chrome.storage.local.set({
        apiBase: base,
        autoAnswerOnCopy: autoAnswer,
        showFloatingButton: showFloating,
        autoDetectOptions: autoDetect
      });
      showStatus("Settings saved successfully.");
    });
    testBtn == null ? void 0 : testBtn.addEventListener("click", async () => {
      const base = ((apiInput == null ? void 0 : apiInput.value) || "").trim().replace(/\/+$/, "");
      showStatus("Testing connection to " + base + "…");
      try {
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4e3) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        showStatus(`✓ Connected to ${data.service || "ExamAI Server"} (${data.version || "v2.0"})`);
      } catch (err) {
        const e = err;
        showStatus(`✗ Connection failed: ${e.message}. Is the backend running?`, true);
      }
    });
  });
})();
