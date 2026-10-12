/**
 * ExamAssist AI - Read-Only Code Editor Adapters (TypeScript)
 * Supports: MonacoAdapter, CodeMirror6Adapter, CodeMirror5Adapter, AceAdapter,
 * TextareaAdapter, and PreCodeAdapter.
 *
 * HARD RULE: Strictly READ-ONLY. Never mutates or dispatches synthetic events into page editors.
 */

import {
  ExtractedEditorStateSchema,
  type ExtractedEditorState
} from "@examassist/shared";

export function normalizeLanguage(raw = ""): string {
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

export function detectLanguageFromPage(doc: Document | Element = document): string {
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
    const el = doc.querySelector(sel) as HTMLSelectElement | HTMLElement | null;
    if (el) {
      const val = ("value" in el && el.value) || el.getAttribute?.("data-lang") || el.textContent || "";
      const norm = normalizeLanguage(val);
      if (norm) return norm;
    }
  }
  return "";
}

export function extractConsoleOutputFromPage(doc: Document | Element = document): string {
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
  const outputs: string[] = [];
  for (const sel of selectors) {
    const els = doc.querySelectorAll(sel);
    Array.from(els).forEach((el) => {
      const htmlEl = el as HTMLElement;
      const text = (htmlEl.innerText || htmlEl.textContent || "").trim();
      if (text && !outputs.includes(text)) outputs.push(text);
    });
  }
  return outputs.join("\n---\n").slice(0, 12000);
}

export interface ReadOnlyEditorAdapter {
  readonly name: ExtractedEditorState["adapter"];
  canHandle(doc?: Document | Element): boolean;
  extract(doc?: Document | Element): ExtractedEditorState | null;
}

export class MonacoAdapter implements ReadOnlyEditorAdapter {
  readonly name = "MonacoAdapter" as const;

  canHandle(doc: Document | Element = document): boolean {
    return Boolean(doc.querySelector(".monaco-editor, [data-mode-id]"));
  }

  extract(doc: Document | Element = document): ExtractedEditorState | null {
    const editorEl = doc.querySelector(".monaco-editor, [data-mode-id]") as HTMLElement | null;
    if (!editorEl) return null;

    const modeAttr =
      editorEl.getAttribute?.("data-mode-id") ||
      editorEl.closest?.("[data-mode-id]")?.getAttribute("data-mode-id") ||
      "";
    const lineEls = editorEl.querySelectorAll(".view-lines .view-line, .view-line");
    let code = "";
    if (lineEls.length > 0) {
      code = Array.from(lineEls)
        .map((line) => ((line as HTMLElement).innerText || line.textContent || "").replace(/\u00a0/g, " "))
        .join("\n");
    } else {
      code = (editorEl.innerText || editorEl.textContent || "").replace(/\u00a0/g, " ").trim();
    }

    const activeLineEl = editorEl.querySelector(".current-line, .active-line-number");
    const cursorLine = activeLineEl ? parseInt(activeLineEl.textContent || "1", 10) || 1 : null;

    return ExtractedEditorStateSchema.parse({
      adapter: this.name,
      code: code.trim(),
      language: normalizeLanguage(modeAttr) || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine,
      consoleOutput: extractConsoleOutputFromPage(doc)
    });
  }
}

export class CodeMirror6Adapter implements ReadOnlyEditorAdapter {
  readonly name = "CodeMirror6Adapter" as const;

  canHandle(doc: Document | Element = document): boolean {
    return Boolean(doc.querySelector(".cm-editor .cm-content, .cm-content[contenteditable]"));
  }

  extract(doc: Document | Element = document): ExtractedEditorState | null {
    const contentEl = doc.querySelector(".cm-editor .cm-content, .cm-content[contenteditable]") as HTMLElement | null;
    if (!contentEl) return null;

    const lineEls = contentEl.querySelectorAll(".cm-line");
    let code = "";
    if (lineEls.length > 0) {
      code = Array.from(lineEls)
        .map((l) => (l as HTMLElement).innerText || l.textContent || "")
        .join("\n");
    } else {
      code = (contentEl.innerText || contentEl.textContent || "").trim();
    }

    const langAttr =
      contentEl.getAttribute?.("data-language") ||
      contentEl.closest?.(".cm-editor")?.getAttribute("data-language") ||
      "";
    return ExtractedEditorStateSchema.parse({
      adapter: this.name,
      code: code.trim(),
      language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    });
  }
}

export class CodeMirror5Adapter implements ReadOnlyEditorAdapter {
  readonly name = "CodeMirror5Adapter" as const;

  canHandle(doc: Document | Element = document): boolean {
    return Boolean(doc.querySelector(".CodeMirror"));
  }

  extract(doc: Document | Element = document): ExtractedEditorState | null {
    const cmEl = doc.querySelector(".CodeMirror") as HTMLElement | null;
    if (!cmEl) return null;

    const lineEls = cmEl.querySelectorAll(".CodeMirror-line");
    let code = "";
    if (lineEls.length > 0) {
      code = Array.from(lineEls)
        .map((l) => ((l as HTMLElement).innerText || l.textContent || "").replace(/\u200b/g, ""))
        .join("\n");
    } else {
      code = (cmEl.innerText || cmEl.textContent || "").trim();
    }

    const langAttr = cmEl.getAttribute?.("data-mode") || "";
    return ExtractedEditorStateSchema.parse({
      adapter: this.name,
      code: code.trim(),
      language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    });
  }
}

export class AceAdapter implements ReadOnlyEditorAdapter {
  readonly name = "AceAdapter" as const;

  canHandle(doc: Document | Element = document): boolean {
    return Boolean(doc.querySelector(".ace_editor"));
  }

  extract(doc: Document | Element = document): ExtractedEditorState | null {
    const aceEl = doc.querySelector(".ace_editor") as HTMLElement | null;
    if (!aceEl) return null;

    const lineEls = aceEl.querySelectorAll(".ace_line");
    let code = "";
    if (lineEls.length > 0) {
      code = Array.from(lineEls)
        .map((l) => (l as HTMLElement).innerText || l.textContent || "")
        .join("\n");
    } else {
      code = (aceEl.innerText || aceEl.textContent || "").trim();
    }

    const langAttr = aceEl.getAttribute?.("data-mode") || aceEl.getAttribute?.("data-language") || "";
    return ExtractedEditorStateSchema.parse({
      adapter: this.name,
      code: code.trim(),
      language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    });
  }
}

export class TextareaAdapter implements ReadOnlyEditorAdapter {
  readonly name = "TextareaAdapter" as const;

  canHandle(doc: Document | Element = document): boolean {
    return Boolean(
      doc.querySelector("textarea.code-editor, textarea[name*='code' i], textarea[id*='code' i], textarea[data-code-editor]")
    );
  }

  extract(doc: Document | Element = document): ExtractedEditorState | null {
    const ta = doc.querySelector(
      "textarea.code-editor, textarea[name*='code' i], textarea[id*='code' i], textarea[data-code-editor]"
    ) as HTMLTextAreaElement | null;
    if (!ta) return null;

    const code = (ta.value !== undefined ? ta.value : ta.textContent) || "";
    const langAttr = ta.getAttribute?.("data-language") || ta.getAttribute?.("data-lang") || "";
    return ExtractedEditorStateSchema.parse({
      adapter: this.name,
      code: String(code).trim(),
      language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    });
  }
}

export class PreCodeAdapter implements ReadOnlyEditorAdapter {
  readonly name = "PreCodeAdapter" as const;

  canHandle(doc: Document | Element = document): boolean {
    return Boolean(doc.querySelector("pre code, pre.code-block, .highlight pre"));
  }

  extract(doc: Document | Element = document): ExtractedEditorState | null {
    const el = doc.querySelector("pre code, pre.code-block, .highlight pre") as HTMLElement | null;
    if (!el) return null;

    const cls = el.className || el.parentElement?.className || "";
    const langMatch = cls.match(/language-([a-z0-9_+]+)/i) || cls.match(/lang-([a-z0-9_+]+)/i);
    const code = (el.innerText || el.textContent || "").trim();

    return ExtractedEditorStateSchema.parse({
      adapter: this.name,
      code,
      language: normalizeLanguage(langMatch ? langMatch[1] : "") || detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    });
  }
}

export function extractEditorState(doc: Document | Element = document): ExtractedEditorState {
  const adapters: ReadOnlyEditorAdapter[] = [
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
  return ExtractedEditorStateSchema.parse({
    adapter: "none",
    code: "",
    language: detectLanguageFromPage(doc) || "python",
    selectedText: "",
    cursorLine: null,
    consoleOutput: extractConsoleOutputFromPage(doc)
  });
}

export const EditorAdapters = {
  MonacoAdapter,
  CodeMirror6Adapter,
  CodeMirror5Adapter,
  AceAdapter,
  TextareaAdapter,
  PreCodeAdapter,
  extractEditorState,
  normalizeLanguage,
  detectLanguageFromPage,
  extractConsoleOutputFromPage
};

if (typeof window !== "undefined") {
  const w = window as unknown as { ExamAssist?: Record<string, unknown> };
  w.ExamAssist = w.ExamAssist || {};
  w.ExamAssist.EditorAdapters = EditorAdapters;
}
