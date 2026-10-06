/**
 * ExamAssist AI - Generic Extractor
 * Handles standard web pages, text selections, form groups, and generic assessment cards.
 */

window.ExamAssist = window.ExamAssist || {};

window.ExamAssist.GenericExtractor = class GenericExtractor extends window.ExamAssist.BaseExtractor {
  constructor() {
    super("GenericExtractor");
  }

  canHandle(_element) {
    return true; // Fallback for all web pages
  }

  extract(selectedText, anchorElement) {
    const raw = String(selectedText || "").trim();
    let question = raw;
    let options = [];

    // Check if options are already embedded in the selected text
    const textOptions = [...raw.matchAll(/(?:^|\n|\s+)(?:\(?([A-Ha-h1-8])[\).:\-]\s+)([^\n\r]+)/g)];
    if (textOptions.length >= 2) {
      options = textOptions.map(m => `${m[1].toUpperCase()}) ${m[2].trim()}`);
      const firstOptIndex = raw.search(/(?:^|\n|\s+)(?:\(?([A-Ha-h1-8])[\).:\-]\s+)/);
      if (firstOptIndex > 5) {
        question = raw.slice(0, firstOptIndex).trim();
      }
    }

    let mathFormula = "";
    let codeSnippet = "";
    let tableData = "";

    if (anchorElement) {
      const container = anchorElement.closest([
        '.question', '.quiz_question', '.form-group', 'fieldset', 'form',
        '[role="radiogroup"]', '[role="group"]', '.card', '.assessment-question',
        '.multiple-choice-question', '.question-container', '.quiz-card', 'article', 'li'
      ].join(', ')) || anchorElement.parentElement?.parentElement;

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
};
