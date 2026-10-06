/**
 * ExamAssist AI - Extraction Manager (Adapter Coordinator)
 * Coordinates GenericExtractor, MoodleAdapter, CanvasAdapter, and CustomPortalAdapter.
 * Follows the directive: Try generic first, then the platform adapter.
 */

window.ExamAssist = window.ExamAssist || {};

window.ExamAssist.ExtractionManager = class ExtractionManager {
  constructor() {
    this.generic = new window.ExamAssist.GenericExtractor();
    this.adapters = [
      new window.ExamAssist.MoodleAdapter(),
      new window.ExamAssist.CanvasAdapter(),
      new window.ExamAssist.CustomPortalAdapter()
    ];
  }

  extractFromSelection(selection) {
    if (!selection) return null;
    const selectedText = selection.toString()?.trim() || "";
    if (selectedText.length < 3) return null;

    let anchorElement = null;
    if (selection.anchorNode) {
      anchorElement = selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode
        : selection.anchorNode.parentElement;
    }

    // 1. Try generic first
    const genericResult = this.generic.extract(selectedText, anchorElement);

    // If generic extracted both question and options, return it
    if (genericResult && genericResult.options && genericResult.options.length >= 2) {
      return genericResult;
    }

    // 2. Try platform adapters if generic lacked options or specialized context
    for (const adapter of this.adapters) {
      if (adapter.canHandle(anchorElement)) {
        const platformResult = adapter.extract(selectedText, anchorElement);
        if (platformResult && platformResult.success) {
          // Merge generic text if platform question text was minimal
          if (genericResult?.question && genericResult.question.length > (platformResult.question?.length || 0)) {
            platformResult.question = genericResult.question;
          }
          return platformResult;
        }
      }
    }

    return genericResult;
  }
};
