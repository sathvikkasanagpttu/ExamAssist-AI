/**
 * ExamAssist AI - Read-Only Code Editor Adapters
 * Supports: MonacoAdapter, CodeMirror6Adapter, CodeMirror5Adapter, AceAdapter,
 * TextareaAdapter, and PreCodeAdapter.
 *
 * HARD RULE: Strictly READ-ONLY. Never mutates or dispatches synthetic events into page editors.
 */

window.ExamAssist = window.ExamAssist || {};

function normalizeLanguage(raw = "") {
  const s = String(raw || "").toLowerCase().trim();
  if (!s) return "";
  if (s.includes("python") || s === "py" || s === "python3") return "python";
  if (s.includes("javascript") || s === "js" || s.includes("node") || s.includes("typescript") || s === "ts") return "javascript";
  if (s.includes("c++") || s === "cpp" || s.includes("gcc") || s.includes("g++")) return "cpp";
  if (s === "c" || s.includes("ansi c")) return "c";
  if (s.includes("java")) return "java";
  if (s.includes("sql") || s.includes("mysql") || s.includes("postgres") || s.includes("sqlite")) return "sql";
  if (s.includes("go") || s.includes("golang")) return "go";
  if (s.includes("rust") || s === "rs") return "rust";
  return s;
}

function detectLanguageFromPage(doc = document) {
  const selectors = [
    "[data-cy='lang-select']",
    ".language-selector",
    "select[name*='lang' i]",
    "select[id*='lang' i]",
    "[aria-label*='Language' i]",
    ".select-language",
    ".hr-monaco-language-select"
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const val = el.value || el.getAttribute("data-lang") || el.textContent || "";
      const norm = normalizeLanguage(val);
      if (norm) return norm;
    }
  }
  return "";
}

function extractConsoleOutputFromPage(doc = document) {
  const selectors = [
    ".console-output",
    ".testcase-output",
    ".compile-error",
    ".hr-test-case-output",
    "[data-e2e-locator='console-result']",
    ".gdb-console",
    ".error-output",
    ".submission-result",
    ".output-block"
  ];
  const outputs = [];
  for (const sel of selectors) {
    const els = doc.querySelectorAll(sel);
    els.forEach((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      if (text && !outputs.includes(text)) outputs.push(text);
    });
  }
  return outputs.join("\n---\n").slice(0, 12000);
}

class MonacoAdapter {
  constructor() {
    this.name = "MonacoAdapter";
  }

  canHandle(doc = document) {
    return Boolean(doc.querySelector(".monaco-editor, [data-mode-id]"));
  }

  extract(doc = document) {
    const editorEl = doc.querySelector(".monaco-editor, [data-mode-id]");
    if (!editorEl) return null;

    const modeAttr = editorEl.getAttribute("data-mode-id") || editorEl.closest("[data-mode-id]")?.getAttribute("data-mode-id") || "";
    const lineEls = editorEl.querySelectorAll(".view-lines .view-line, .view-line");
    let code = "";
    if (lineEls.length > 0) {
      code = Array.from(lineEls)
        .map((line) => (line.innerText || line.textContent || "").replace(/\u00a0/g, " "))
        .join("\n");
    } else {
      code = (editorEl.innerText || editorEl.textContent || "").replace(/\u00a0/g, " ").trim();
    }

    const activeLineEl = editorEl.querySelector(".current-line, .active-line-number");
    const cursorLine = activeLineEl ? parseInt(activeLineEl.textContent || "1", 10) || 1 : null;

    return {
      adapter: this.name,
      code: code.trim(),
      language: normalizeLanguage(modeAttr) || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine,
      consoleOutput: extractConsoleOutputFromPage(doc)
    };
  }
}

class CodeMirror6Adapter {
  constructor() {
    this.name = "CodeMirror6Adapter";
  }

  canHandle(doc = document) {
    return Boolean(doc.querySelector(".cm-editor .cm-content, .cm-content[contenteditable]"));
  }

  extract(doc = document) {
    const contentEl = doc.querySelector(".cm-editor .cm-content, .cm-content[contenteditable]");
    if (!contentEl) return null;

    const lineEls = contentEl.querySelectorAll(".cm-line");
    let code = "";
    if (lineEls.length > 0) {
      code = Array.from(lineEls).map((l) => l.innerText || l.textContent || "").join("\n");
    } else {
      code = (contentEl.innerText || contentEl.textContent || "").trim();
    }

    const langAttr = contentEl.getAttribute("data-language") || contentEl.closest(".cm-editor")?.getAttribute("data-language") || "";
    return {
      adapter: this.name,
      code: code.trim(),
      language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    };
  }
}

class CodeMirror5Adapter {
  constructor() {
    this.name = "CodeMirror5Adapter";
  }

  canHandle(doc = document) {
    return Boolean(doc.querySelector(".CodeMirror"));
  }

  extract(doc = document) {
    const cmEl = doc.querySelector(".CodeMirror");
    if (!cmEl) return null;

    const lineEls = cmEl.querySelectorAll(".CodeMirror-line");
    let code = "";
    if (lineEls.length > 0) {
      code = Array.from(lineEls)
        .map((l) => (l.innerText || l.textContent || "").replace(/\u200b/g, ""))
        .join("\n");
    } else {
      code = (cmEl.innerText || cmEl.textContent || "").trim();
    }

    const langAttr = cmEl.getAttribute("data-mode") || "";
    return {
      adapter: this.name,
      code: code.trim(),
      language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    };
  }
}

class AceAdapter {
  constructor() {
    this.name = "AceAdapter";
  }

  canHandle(doc = document) {
    return Boolean(doc.querySelector(".ace_editor"));
  }

  extract(doc = document) {
    const aceEl = doc.querySelector(".ace_editor");
    if (!aceEl) return null;

    const lineEls = aceEl.querySelectorAll(".ace_line");
    let code = "";
    if (lineEls.length > 0) {
      code = Array.from(lineEls).map((l) => l.innerText || l.textContent || "").join("\n");
    } else {
      code = (aceEl.innerText || aceEl.textContent || "").trim();
    }

    return {
      adapter: this.name,
      code: code.trim(),
      language: detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    };
  }
}

class TextareaAdapter {
  constructor() {
    this.name = "TextareaAdapter";
  }

  canHandle(doc = document) {
    return Boolean(doc.querySelector("textarea.code-editor, textarea[name*='code' i], textarea[id*='code' i], textarea[data-code-editor]"));
  }

  extract(doc = document) {
    const ta = doc.querySelector("textarea.code-editor, textarea[name*='code' i], textarea[id*='code' i], textarea[data-code-editor]");
    if (!ta) return null;

    const code = (ta.value !== undefined ? ta.value : ta.textContent) || "";
    const langAttr = ta.getAttribute("data-language") || ta.getAttribute("data-lang") || "";
    return {
      adapter: this.name,
      code: String(code).trim(),
      language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    };
  }
}

class PreCodeAdapter {
  constructor() {
    this.name = "PreCodeAdapter";
  }

  canHandle(doc = document) {
    return Boolean(doc.querySelector("pre code, pre.code-block, .highlight pre"));
  }

  extract(doc = document) {
    const el = doc.querySelector("pre code, pre.code-block, .highlight pre");
    if (!el) return null;

    const cls = el.className || el.parentElement?.className || "";
    const langMatch = cls.match(/language-([a-z0-9_+]+)/i) || cls.match(/lang-([a-z0-9_+]+)/i);
    const code = (el.innerText || el.textContent || "").trim();

    return {
      adapter: this.name,
      code,
      language: normalizeLanguage(langMatch ? langMatch[1] : "") || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    };
  }
}

window.ExamAssist.EditorAdapters = {
  MonacoAdapter,
  CodeMirror6Adapter,
  CodeMirror5Adapter,
  AceAdapter,
  TextareaAdapter,
  PreCodeAdapter,
  extractEditorState(doc = document) {
    const adapters = [
      new MonacoAdapter(),
      new CodeMirror6Adapter(),
      new CodeMirror5Adapter(),
      new AceAdapter(),
      new TextareaAdapter(),
      new PreCodeAdapter()
    ];
    for (const adapter of adapters) {
      if (adapter.canHandle(doc)) {
        const res = adapter.extract(doc);
        if (res && res.code) return res;
      }
    }
    return {
      adapter: "none",
      code: "",
      language: detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    };
  }
};
