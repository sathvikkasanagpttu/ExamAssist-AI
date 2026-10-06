/**
 * ExamAssist AI - Custom Portal Adapter
 * Extracts questions from Blackboard, Google Forms, Quizlet, and custom test portals.
 */

window.ExamAssist = window.ExamAssist || {};

window.ExamAssist.CustomPortalAdapter = class CustomPortalAdapter extends window.ExamAssist.BaseExtractor {
  constructor() {
    super("CustomPortalAdapter");
  }

  canHandle(element) {
    if (!element) return false;
    return Boolean(
      element.closest('.takeQuestionDiv, [role="listitem"], .freebirdFormviewerViewNumberedItem, .assessment-item, .quiz-card')
    );
  }

  extract(selectedText, anchorElement) {
    const container = anchorElement?.closest([
      '.takeQuestionDiv',
      '[role="listitem"]',
      '.freebirdFormviewerViewNumberedItem',
      '.assessment-item',
      '.quiz-card'
    ].join(', '));

    if (!container) return null;

    // Google Forms question title
    const gTitleEl = container.querySelector('[role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle, .title');
    const question = gTitleEl ? gTitleEl.innerText.trim() : (selectedText || "");

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
};
