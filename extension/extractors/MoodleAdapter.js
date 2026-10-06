/**
 * ExamAssist AI - Moodle Assessment Adapter
 * Extracts questions and options from Moodle quiz environments.
 */

window.ExamAssist = window.ExamAssist || {};

window.ExamAssist.MoodleAdapter = class MoodleAdapter extends window.ExamAssist.BaseExtractor {
  constructor() {
    super("MoodleAdapter");
  }

  canHandle(element) {
    if (!element) return false;
    return Boolean(
      element.closest('.que') ||
      document.querySelector('.path-mod-quiz') ||
      document.querySelector('.que.multichoice, .que.numerical, .que.shortanswer')
    );
  }

  extract(selectedText, anchorElement) {
    const queContainer = anchorElement?.closest('.que') || document.querySelector('.que');
    if (!queContainer) return null;

    const qTextEl = queContainer.querySelector('.qtext, .formulation .qtext');
    const question = qTextEl ? qTextEl.innerText.trim() : (selectedText || "");

    const options = [];
    const answerContainer = queContainer.querySelector('.answer');
    if (answerContainer) {
      const optionRows = answerContainer.querySelectorAll('.r0, .r1, div, p');
      optionRows.forEach(row => {
        const text = row.innerText?.trim();
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
};
