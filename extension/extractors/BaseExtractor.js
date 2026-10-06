/**
 * ExamAssist AI - Base Extractor
 * Provides common DOM extraction utilities for math, code, tables, and options.
 */

window.ExamAssist = window.ExamAssist || {};

window.ExamAssist.BaseExtractor = class BaseExtractor {
  constructor(name = "BaseExtractor") {
    this.name = name;
  }

  /**
   * Extracts LaTeX, KaTeX, MathJax, or MathML formulas
   */
  extractMath(container) {
    if (!container) return "";
    const formulas = [];

    // KaTeX / MathJax annotation or data-latex attributes
    const katexEls = container.querySelectorAll('.katex-mathml annotation, [data-latex], script[type="math/tex"]');
    katexEls.forEach(el => {
      const tex = el.getAttribute('data-latex') || el.textContent?.trim();
      if (tex && !formulas.includes(tex)) formulas.push(tex);
    });

    // MathML elements
    const mathEls = container.querySelectorAll('math');
    mathEls.forEach(el => {
      const alt = el.getAttribute('alttext') || el.textContent?.trim();
      if (alt && !formulas.includes(alt)) formulas.push(alt);
    });

    return formulas.join("; ");
  }

  /**
   * Extracts code snippets from <pre>, <code>, or highlighted code containers
   */
  extractCode(container) {
    if (!container) return "";
    const codeBlocks = [];

    const preEls = container.querySelectorAll('pre, code, .highlight, .code-block, .ace_editor');
    preEls.forEach(el => {
      // Don't extract inline short tags like <code>x</code>
      const text = el.innerText?.trim();
      if (text && text.length > 15 && !codeBlocks.includes(text)) {
        codeBlocks.push(text);
      }
    });

    return codeBlocks.join("\n\n---\n\n");
  }

  /**
   * Extracts tabular data and formats it as readable markdown text
   */
  extractTables(container) {
    if (!container) return "";
    const tables = container.querySelectorAll('table');
    if (tables.length === 0) return "";

    const tableTexts = [];
    tables.forEach(table => {
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('th, td')).map(td => td.innerText?.trim());
        if (cells.length > 0) rows.push(cells.join(" | "));
      });
      if (rows.length > 0) tableTexts.push(rows.join("\n"));
    });

    return tableTexts.join("\n\n");
  }

  /**
   * Extracts radio buttons, checkboxes, or option labels
   */
  extractOptionsFromContainer(container) {
    if (!container) return [];
    const options = [];
    const seen = new Set();

    // Check radio and checkbox inputs with associated labels
    const inputEls = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    inputEls.forEach((input, index) => {
      let labelText = "";
      // 1. label containing the input
      const parentLabel = input.closest('label');
      if (parentLabel) labelText = parentLabel.innerText?.trim();

      // 2. label with for attribute matching input id
      if (!labelText && input.id) {
        const forLabel = container.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (forLabel) labelText = forLabel.innerText?.trim();
      }

      // 3. sibling element
      if (!labelText && input.nextElementSibling) {
        labelText = input.nextElementSibling.innerText?.trim();
      }

      if (labelText && !seen.has(labelText) && labelText.length < 300) {
        seen.add(labelText);
        options.push(labelText);
      }
    });

    // If no inputs found, check choice/option classes
    if (options.length === 0) {
      const choiceEls = container.querySelectorAll('.choice, .option, .answer, .quiz-option, .form-check');
      choiceEls.forEach(el => {
        const text = el.innerText?.trim();
        if (text && !seen.has(text) && text.length < 300) {
          seen.add(text);
          options.push(text);
        }
      });
    }

    // Format with A), B), C) prefix if not already present
    const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
    return options.map((opt, i) => {
      if (/^[A-H1-8][\).\s]/i.test(opt)) return opt;
      return `${letters[i] || i + 1}) ${opt}`;
    });
  }
};
