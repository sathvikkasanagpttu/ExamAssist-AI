/**
 * ExamAssist AI - Canvas LMS Assessment Adapter
 * Extracts questions and options from Canvas quiz environments.
 */

window.ExamAssist = window.ExamAssist || {};

window.ExamAssist.CanvasAdapter = class CanvasAdapter extends window.ExamAssist.BaseExtractor {
  constructor() {
    super("CanvasAdapter");
  }

  canHandle(element) {
    if (!element) return false;
    return Boolean(
      element.closest('.question_holder, .display_question, #questions.quiz_sortable') ||
      document.querySelector('.canvas-quiz, #quiz-instructions, .question_holder')
    );
  }

  extract(selectedText, anchorElement) {
    const qHolder = anchorElement?.closest('.question_holder, .display_question, .question') || document.querySelector('.question_holder');
    if (!qHolder) return null;

    const qTextEl = qHolder.querySelector('.question_text, .original_question_text');
    const question = qTextEl ? qTextEl.innerText.trim() : (selectedText || "");

    const options = [];
    const answerEls = qHolder.querySelectorAll('.answers .answer, .answers .answer_label, .answers .select_answer');
    answerEls.forEach(el => {
      const text = el.innerText?.trim();
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
};
