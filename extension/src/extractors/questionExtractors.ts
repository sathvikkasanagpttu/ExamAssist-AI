/**
 * ExamAssist AI - Assessment Question & Quiz Extractors (TypeScript)
 * Implements BaseExtractor, GenericExtractor, MoodleAdapter, CanvasAdapter,
 * CustomPortalAdapter, ExtractionManager, and parseQuestionAndOptions.
 *
 * HARD RULE: Strictly READ-ONLY. Never mutates or writes into page inputs.
 */

export interface ExtractedAssessmentQuestion {
  success: boolean;
  question: string;
  options: string[];
  mathFormula: string;
  codeSnippet: string;
  tableData: string;
  sourceAdapter: string;
}

function getElText(el: Element | null | undefined): string {
  if (!el) return "";
  const htmlEl = el as HTMLElement;
  return (htmlEl.innerText || htmlEl.textContent || "").trim();
}

export class BaseExtractor {
  readonly name: string;

  constructor(name = "BaseExtractor") {
    this.name = name;
  }

  extractMath(container: Element | null | undefined): string {
    if (!container) return "";
    const formulas: string[] = [];

    const katexEls = container.querySelectorAll('.katex-mathml annotation, [data-latex], script[type="math/tex"]');
    Array.from(katexEls).forEach((el) => {
      const tex = el.getAttribute("data-latex") || el.textContent?.trim();
      if (tex && !formulas.includes(tex)) formulas.push(tex);
    });

    const mathEls = container.querySelectorAll("math");
    Array.from(mathEls).forEach((el) => {
      const alt = el.getAttribute("alttext") || el.textContent?.trim();
      if (alt && !formulas.includes(alt)) formulas.push(alt);
    });

    return formulas.join("; ");
  }

  extractCode(container: Element | null | undefined): string {
    if (!container) return "";
    const codeBlocks: string[] = [];

    const preEls = container.querySelectorAll("pre, code, .highlight, .code-block, .ace_editor");
    Array.from(preEls).forEach((el) => {
      const text = getElText(el);
      if (text && text.length > 15 && !codeBlocks.includes(text)) {
        codeBlocks.push(text);
      }
    });

    return codeBlocks.join("\n\n---\n\n");
  }

  extractTables(container: Element | null | undefined): string {
    if (!container) return "";
    const tables = container.querySelectorAll("table");
    if (tables.length === 0) return "";

    const tableTexts: string[] = [];
    Array.from(tables).forEach((table) => {
      const rows: string[] = [];
      Array.from(table.querySelectorAll("tr")).forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("th, td")).map((td) => getElText(td));
        if (cells.length > 0) rows.push(cells.join(" | "));
      });
      if (rows.length > 0) tableTexts.push(rows.join("\n"));
    });

    return tableTexts.join("\n\n");
  }

  extractOptionsFromContainer(container: Element | null | undefined): string[] {
    if (!container) return [];
    const options: string[] = [];
    const seen = new Set<string>();

    const inputEls = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    Array.from(inputEls).forEach((input) => {
      let labelText = "";
      const parentLabel = input.closest("label");
      if (parentLabel) labelText = getElText(parentLabel);

      const inputId = (input as HTMLInputElement).id;
      if (!labelText && inputId) {
        const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(inputId) : inputId;
        const forLabel = container.querySelector(`label[for="${escapedId}"]`);
        if (forLabel) labelText = getElText(forLabel);
      }

      if (!labelText && input.nextElementSibling) {
        labelText = getElText(input.nextElementSibling);
      }

      if (labelText && !seen.has(labelText) && labelText.length < 300) {
        seen.add(labelText);
        options.push(labelText);
      }
    });

    if (options.length === 0) {
      const choiceEls = container.querySelectorAll(".choice, .option, .answer, .quiz-option, .form-check");
      Array.from(choiceEls).forEach((el) => {
        const text = getElText(el);
        if (text && !seen.has(text) && text.length < 300) {
          seen.add(text);
          options.push(text);
        }
      });
    }

    const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
    return options.map((opt, i) => {
      if (/^[A-H1-8][\).\s]/i.test(opt)) return opt;
      return `${letters[i] || i + 1}) ${opt}`;
    });
  }
}

export class GenericExtractor extends BaseExtractor {
  constructor() {
    super("GenericExtractor");
  }

  canHandle(_element?: Element | null): boolean {
    return true;
  }

  extract(selectedText = "", anchorElement: Element | null = null): ExtractedAssessmentQuestion {
    const raw = String(selectedText || "").trim();
    let question = raw;
    let options: string[] = [];

    const textOptions = [...raw.matchAll(/(?:^|\n|\s+)(?:\(?([A-Ha-h1-8])[\).:\-]\s+)([^\n\r]+)/g)];
    if (textOptions.length >= 2) {
      options = textOptions.map((m) => `${m[1].toUpperCase()}) ${m[2].trim()}`);
      const firstOptIndex = raw.search(/(?:^|\n|\s+)(?:\(?([A-Ha-h1-8])[\).:\-]\s+)/);
      if (firstOptIndex > 5) {
        question = raw.slice(0, firstOptIndex).trim();
      }
    }

    let mathFormula = "";
    let codeSnippet = "";
    let tableData = "";

    if (anchorElement) {
      const container =
        anchorElement.closest(
          [
            ".question",
            ".quiz_question",
            ".form-group",
            "fieldset",
            "form",
            '[role="radiogroup"]',
            '[role="group"]',
            ".card",
            ".assessment-question",
            ".multiple-choice-question",
            ".question-container",
            ".quiz-card",
            "article",
            "li"
          ].join(", ")
        ) || anchorElement.parentElement?.parentElement;

      if (container) {
        mathFormula = this.extractMath(container);
        codeSnippet = this.extractCode(container);
        tableData = this.extractTables(container);

        if (options.length === 0) {
          options = this.extractOptionsFromContainer(container);
        }
      }
    }

    return {
      success: Boolean(question && question.length >= 3),
      question,
      options,
      mathFormula,
      codeSnippet,
      tableData,
      sourceAdapter: this.name
    };
  }
}

export class MoodleAdapter extends BaseExtractor {
  constructor() {
    super("MoodleAdapter");
  }

  canHandle(element?: Element | null, doc: Document = document): boolean {
    if (!element && !doc) return false;
    return Boolean(
      element?.closest?.(".que") ||
        doc?.querySelector?.(".path-mod-quiz") ||
        doc?.querySelector?.(".que.multichoice, .que.numerical, .que.shortanswer")
    );
  }

  extract(selectedText = "", anchorElement: Element | null = null, doc: Document = document): ExtractedAssessmentQuestion | null {
    const queContainer = anchorElement?.closest?.(".que") || doc?.querySelector?.(".que");
    if (!queContainer) return null;

    const qTextEl = queContainer.querySelector(".qtext, .formulation .qtext");
    const question = qTextEl ? getElText(qTextEl) : selectedText || "";

    const options: string[] = [];
    const answerContainer = queContainer.querySelector(".answer");
    if (answerContainer) {
      const optionRows = answerContainer.querySelectorAll(".r0, .r1, div, p");
      Array.from(optionRows).forEach((row) => {
        const text = getElText(row);
        if (text && text.length < 250 && !options.includes(text)) {
          options.push(text);
        }
      });
    }

    const mathFormula = this.extractMath(queContainer);
    const codeSnippet = this.extractCode(queContainer);
    const tableData = this.extractTables(queContainer);

    return {
      success: Boolean(question && question.length >= 3),
      question,
      options: options.length > 0 ? options : this.extractOptionsFromContainer(queContainer),
      mathFormula,
      codeSnippet,
      tableData,
      sourceAdapter: this.name
    };
  }
}

export class CanvasAdapter extends BaseExtractor {
  constructor() {
    super("CanvasAdapter");
  }

  canHandle(element?: Element | null, doc: Document = document): boolean {
    if (!element && !doc) return false;
    return Boolean(
      element?.closest?.(".question_holder, .display_question, #questions.quiz_sortable") ||
        doc?.querySelector?.(".canvas-quiz, #quiz-instructions, .question_holder")
    );
  }

  extract(selectedText = "", anchorElement: Element | null = null, doc: Document = document): ExtractedAssessmentQuestion | null {
    const qHolder =
      anchorElement?.closest?.(".question_holder, .display_question, .question") || doc?.querySelector?.(".question_holder");
    if (!qHolder) return null;

    const qTextEl = qHolder.querySelector(".question_text, .original_question_text");
    const question = qTextEl ? getElText(qTextEl) : selectedText || "";

    const options: string[] = [];
    const answerEls = qHolder.querySelectorAll(".answers .answer, .answers .answer_label, .answers .select_answer");
    Array.from(answerEls).forEach((el) => {
      const text = getElText(el);
      if (text && text.length < 250 && !options.includes(text)) {
        options.push(text);
      }
    });

    const mathFormula = this.extractMath(qHolder);
    const codeSnippet = this.extractCode(qHolder);
    const tableData = this.extractTables(qHolder);

    return {
      success: Boolean(question && question.length >= 3),
      question,
      options: options.length > 0 ? options : this.extractOptionsFromContainer(qHolder),
      mathFormula,
      codeSnippet,
      tableData,
      sourceAdapter: this.name
    };
  }
}

export class CustomPortalAdapter extends BaseExtractor {
  constructor() {
    super("CustomPortalAdapter");
  }

  canHandle(element?: Element | null): boolean {
    if (!element) return false;
    return Boolean(
      element.closest?.(".takeQuestionDiv, [role=\"listitem\"], .freebirdFormviewerViewNumberedItem, .assessment-item, .quiz-card")
    );
  }

  extract(selectedText = "", anchorElement: Element | null = null): ExtractedAssessmentQuestion | null {
    const container = anchorElement?.closest?.(
      [
        ".takeQuestionDiv",
        '[role="listitem"]',
        ".freebirdFormviewerViewNumberedItem",
        ".assessment-item",
        ".quiz-card"
      ].join(", ")
    );

    if (!container) return null;

    const gTitleEl = container.querySelector('[role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle, .title');
    const question = gTitleEl ? getElText(gTitleEl) : selectedText || "";

    const options = this.extractOptionsFromContainer(container);
    const mathFormula = this.extractMath(container);
    const codeSnippet = this.extractCode(container);
    const tableData = this.extractTables(container);

    return {
      success: Boolean(question && question.length >= 3),
      question,
      options,
      mathFormula,
      codeSnippet,
      tableData,
      sourceAdapter: this.name
    };
  }
}

export class ExtractionManager {
  readonly generic: GenericExtractor;
  readonly adapters: Array<MoodleAdapter | CanvasAdapter | CustomPortalAdapter>;

  constructor() {
    this.generic = new GenericExtractor();
    this.adapters = [new MoodleAdapter(), new CanvasAdapter(), new CustomPortalAdapter()];
  }

  extractFromSelection(selection: Selection | null): ExtractedAssessmentQuestion | null {
    if (!selection) return null;
    const selectedText = selection.toString()?.trim() || "";
    if (selectedText.length < 3) return null;

    let anchorElement: Element | null = null;
    if (selection.anchorNode) {
      anchorElement =
        selection.anchorNode.nodeType === 1
          ? (selection.anchorNode as Element)
          : selection.anchorNode.parentElement;
    }

    const genericResult = this.generic.extract(selectedText, anchorElement);
    if (genericResult && genericResult.options && genericResult.options.length >= 2) {
      return genericResult;
    }

    for (const adapter of this.adapters) {
      if (adapter.canHandle(anchorElement)) {
        const platformResult = adapter.extract(selectedText, anchorElement);
        if (platformResult && platformResult.success) {
          if (genericResult?.question && genericResult.question.length > (platformResult.question?.length || 0)) {
            platformResult.question = genericResult.question;
          }
          return platformResult;
        }
      }
    }

    return genericResult;
  }

  extract(element: Element | null = null, doc: Document = document): ExtractedAssessmentQuestion | null {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(element, doc)) {
        const res = adapter.extract("", element, doc);
        if (res && res.success) return res;
      }
    }
    const text = getElText(element || doc.body);
    return this.generic.extract(text, element || doc.body);
  }
}

export function parseQuestionAndOptions(raw: string): { question: string; options: string[] } {
  if (!raw || typeof raw !== "string") {
    return { question: "", options: [] };
  }
  const text = raw.trim();

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const optionRegex = /^(?:\(?([A-Ha-h0-9])[\.\)\:\-\]]|\[([A-Ha-h0-9])\])\s+(.+)$/;

  const rawMatches: Array<{ letter: string; text: string }> = [];
  const questionLines: string[] = [];
  let foundFirstOption = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(optionRegex);
    if (match) {
      const key = (match[1] || match[2] || "").toUpperCase();
      const isDigit = /^\d+$/.test(key);
      const hasQuestionMark = line.includes("?");
      const laterHasLetters = lines.slice(i + 1).some((l) => /^(?:\(?[A-Da-d][\.\)\:\-\]]|\[[A-Da-d]\])/.test(l));

      if (isDigit && (hasQuestionMark || laterHasLetters)) {
        questionLines.push(line);
        continue;
      }

      foundFirstOption = true;
      const optText = match[3].trim();
      rawMatches.push({ letter: key, text: optText });
    } else if (!foundFirstOption) {
      questionLines.push(line);
    } else if (rawMatches.length > 0) {
      rawMatches[rawMatches.length - 1].text += " " + line;
    } else {
      questionLines.push(line);
    }
  }

  if (rawMatches.length >= 2) {
    const q = questionLines.join("\n").trim();
    return {
      question: q.length >= 3 ? q : text,
      options: rawMatches.map((m) => `${m.letter}) ${m.text}`)
    };
  }

  const markerRegex = /(?:^|\s+)(?:\(?([A-Ha-h1-8])[\.\)\:\-]|\[([A-Ha-h1-8])\])(?=\s+)/g;
  const matches = [...text.matchAll(markerRegex)];
  if (matches.length >= 2) {
    const keys = matches.map((m) => (m[1] || m[2]).toUpperCase());
    const isAlphaSeq = keys[0] === "A" && keys[1] === "B";
    const isNumSeq = keys[0] === "1" && keys[1] === "2";
    const uniqueKeys = new Set(keys);
    if (isAlphaSeq || isNumSeq || uniqueKeys.size === keys.length) {
      const q = text.slice(0, matches[0].index).trim();
      const inlineOpts: string[] = [];
      for (let i = 0; i < matches.length; i++) {
        const key = keys[i];
        const start = (matches[i].index || 0) + matches[i][0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index || text.length : text.length;
        const optBody = text.slice(start, end).trim();
        if (optBody) {
          inlineOpts.push(`${key}) ${optBody}`);
        }
      }
      if (inlineOpts.length >= 2) {
        return {
          question: q.length >= 3 ? q : text,
          options: inlineOpts
        };
      }
    }
  }

  return {
    question: text,
    options: []
  };
}

if (typeof window !== "undefined") {
  const w = window as unknown as { ExamAssist?: Record<string, unknown> };
  w.ExamAssist = w.ExamAssist || {};
  w.ExamAssist.BaseExtractor = BaseExtractor;
  w.ExamAssist.GenericExtractor = GenericExtractor;
  w.ExamAssist.MoodleAdapter = MoodleAdapter;
  w.ExamAssist.CanvasAdapter = CanvasAdapter;
  w.ExamAssist.CustomPortalAdapter = CustomPortalAdapter;
  w.ExamAssist.ExtractionManager = ExtractionManager;
}
