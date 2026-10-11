/**
 * ExamAssist AI - Platform-Aware Coding Problem Adapters
 * Supports:
 * 1. GenericCodingAdapter (tried first / baseline)
 * 2. HackerRankAdapter
 * 3. LeetCodeAdapter
 * 4. GeeksforGeeksAdapter
 * 5. MoodleCodingAdapter / CanvasCodingAdapter
 * 6. CustomPortalCodingAdapter
 *
 * Extracts: title, statement, constraints, inputFormat, outputFormat,
 * sampleTests, starterCode, language, failingOutput, and questionSubType.
 * Includes debounced MutationObserver for SPA route/DOM updates.
 */

window.ExamAssist = window.ExamAssist || {};

function detectCodingSubType({ statement = "", code = "", failingOutput = "", options = [] }) {
  const lower = `${statement}\n${code}`.toLowerCase();
  if (/\b(select\s+.*from|create\s+table|group\s+by|inner\s+join|left\s+join|sql\s+query)\b/i.test(lower)) {
    return "sql_query";
  }
  if (failingOutput || /\b(debug|find the bug|fix the bug|fix the error|why does this fail|runtime error|compile error)\b/i.test(lower)) {
    return "debug_my_code";
  }
  if (/\b(what is the output|predict the output|what does the following .* print|trace the output)\b/i.test(lower)) {
    return "predict_the_output";
  }
  if (/\b(time complexity|space complexity|big-o|asymptotic complexity|order of growth)\b/i.test(lower)) {
    return "complexity_question";
  }
  if (/\b(fill in the blank|complete the missing line|__+|\/\*+\s*todo\s*\*+\/|#\s*todo)\b/i.test(lower)) {
    return "fill_in_the_code";
  }
  if (options.length >= 2) {
    return "code_mcq";
  }
  return "coding_problem";
}

function parseSampleTestsFromText(text = "") {
  const samples = [];
  const raw = String(text || "");

  // Pattern 1: Input: ... Output: ...
  const regex = /(?:sample\s+input|input|example\s*\d*\s*:?\s*input)\s*[:\n]\s*([\s\S]*?)\s*(?:sample\s+output|output|expected\s+output)\s*[:\n]\s*([^\n\r]+(?:\n(?!\s*(?:explanation|example|input|constraints|note)\b)[^\n\r]+)*)/gi;
  for (const match of raw.matchAll(regex)) {
    const stdin = (match[1] || "").trim();
    const expectedOutput = (match[2] || "").trim();
    if (stdin || expectedOutput) {
      samples.push({ stdin, expectedOutput, explanation: "" });
    }
  }
  return samples.slice(0, 8);
}

function extractSectionsFromText(text = "") {
  const raw = String(text || "");
  const constraintsMatch = raw.match(/constraints\s*[:\n]([\s\S]*?)(?:\n\s*(?:sample|example|input format|output format|note)|$)/i);
  const inputMatch = raw.match(/input\s+format\s*[:\n]([\s\S]*?)(?:\n\s*(?:output format|constraints|sample|example)|$)/i);
  const outputMatch = raw.match(/output\s+format\s*[:\n]([\s\S]*?)(?:\n\s*(?:constraints|sample|example)|$)/i);

  return {
    constraints: constraintsMatch ? constraintsMatch[1].trim() : "",
    inputFormat: inputMatch ? inputMatch[1].trim() : "",
    outputFormat: outputMatch ? outputMatch[1].trim() : ""
  };
}

class HackerRankAdapter {
  constructor() {
    this.name = "HackerRankAdapter";
    this.platform = "HackerRank";
  }

  canHandle(doc = document) {
    return Boolean(
      doc.querySelector(".hr-challenge-body, .challenge-body-html, .problem-statement, [data-analytics='ChallengeView']")
    );
  }

  extract(doc = document) {
    const title = (doc.querySelector(".challenge-view h1, .hr-challenge-title, .page-label")?.textContent || "").trim();
    const bodyEl = doc.querySelector(".challenge-body-html, .hr-challenge-body, .problem-statement");
    const statement = (bodyEl?.innerText || bodyEl?.textContent || "").trim();
    const constraintsEl = doc.querySelector(".challenge_constraints, .constraints");
    const inputFormatEl = doc.querySelector(".challenge_input_format, .input-format");
    const outputFormatEl = doc.querySelector(".challenge_output_format, .output-format");

    const parsedSections = extractSectionsFromText(statement);
    const sampleInputs = Array.from(doc.querySelectorAll(".challenge_sample_input pre, .sample-input pre")).map((el) => (el.innerText || el.textContent || "").trim());
    const sampleOutputs = Array.from(doc.querySelectorAll(".challenge_sample_output pre, .sample-output pre")).map((el) => (el.innerText || el.textContent || "").trim());

    const sampleTests = [];
    for (let i = 0; i < Math.max(sampleInputs.length, sampleOutputs.length); i++) {
      sampleTests.push({
        stdin: sampleInputs[i] || "",
        expectedOutput: sampleOutputs[i] || "",
        explanation: ""
      });
    }
    if (sampleTests.length === 0) {
      sampleTests.push(...parseSampleTestsFromText(statement));
    }

    const editor = window.ExamAssist.EditorAdapters?.extractEditorState(doc) || { adapter: "none", code: "", language: "python", consoleOutput: "" };
    const failingOutput = editor.consoleOutput || (doc.querySelector(".testcase-error, .compile-error")?.textContent || "").trim();

    return {
      platform: this.platform,
      questionSubType: detectCodingSubType({ statement, code: editor.code, failingOutput }),
      title,
      statement,
      constraints: (constraintsEl?.innerText || constraintsEl?.textContent || parsedSections.constraints || "").trim(),
      inputFormat: (inputFormatEl?.innerText || inputFormatEl?.textContent || parsedSections.inputFormat || "").trim(),
      outputFormat: (outputFormatEl?.innerText || outputFormatEl?.textContent || parsedSections.outputFormat || "").trim(),
      sampleTests,
      starterCode: editor.code,
      language: editor.language || "python",
      failingOutput,
      options: [],
      editor
    };
  }
}

class LeetCodeAdapter {
  constructor() {
    this.name = "LeetCodeAdapter";
    this.platform = "LeetCode";
  }

  canHandle(doc = document) {
    return Boolean(
      doc.querySelector("[data-track-load='description_content'], .elfjS, [data-cy='question-title'], .question-content__JfgR")
    );
  }

  extract(doc = document) {
    const title = (doc.querySelector("[data-cy='question-title'], .text-title-large, .question-title")?.textContent || "").trim();
    const descEl = doc.querySelector("[data-track-load='description_content'], .elfjS, .question-content__JfgR");
    const statement = (descEl?.innerText || descEl?.textContent || "").trim();
    const parsedSections = extractSectionsFromText(statement);
    const sampleTests = parseSampleTestsFromText(statement);

    const editor = window.ExamAssist.EditorAdapters?.extractEditorState(doc) || { adapter: "none", code: "", language: "python", consoleOutput: "" };
    const failingOutput = editor.consoleOutput || (doc.querySelector("[data-e2e-locator='console-result']")?.textContent || "").trim();

    return {
      platform: this.platform,
      questionSubType: detectCodingSubType({ statement, code: editor.code, failingOutput }),
      title,
      statement,
      constraints: parsedSections.constraints,
      inputFormat: parsedSections.inputFormat,
      outputFormat: parsedSections.outputFormat,
      sampleTests,
      starterCode: editor.code,
      language: editor.language || "python",
      failingOutput,
      options: [],
      editor
    };
  }
}

class GeeksforGeeksAdapter {
  constructor() {
    this.name = "GeeksforGeeksAdapter";
    this.platform = "GeeksforGeeks";
  }

  canHandle(doc = document) {
    return Boolean(
      doc.querySelector(".problems_problem_content__Xm_eO, .problem-statement-gfg, #problem-statement")
    );
  }

  extract(doc = document) {
    const title = (doc.querySelector(".problems_header_content__title__L2cB2, .problem-title, h3.gfg-title")?.textContent || "").trim();
    const bodyEl = doc.querySelector(".problems_problem_content__Xm_eO, .problem-statement-gfg, #problem-statement");
    const statement = (bodyEl?.innerText || bodyEl?.textContent || "").trim();
    const parsedSections = extractSectionsFromText(statement);
    const sampleTests = parseSampleTestsFromText(statement);

    const editor = window.ExamAssist.EditorAdapters?.extractEditorState(doc) || { adapter: "none", code: "", language: "python", consoleOutput: "" };
    return {
      platform: this.platform,
      questionSubType: detectCodingSubType({ statement, code: editor.code, failingOutput: editor.consoleOutput }),
      title,
      statement,
      constraints: parsedSections.constraints,
      inputFormat: parsedSections.inputFormat,
      outputFormat: parsedSections.outputFormat,
      sampleTests,
      starterCode: editor.code,
      language: editor.language || "python",
      failingOutput: editor.consoleOutput,
      options: [],
      editor
    };
  }
}

class GenericCodingAdapter {
  constructor() {
    this.name = "GenericCodingAdapter";
    this.platform = "Generic";
  }

  canHandle(_doc = document) {
    return true;
  }

  extract(doc = document) {
    const title = (doc.querySelector("h1, h2, .problem-title, .question-title")?.textContent || "").trim();
    const container = doc.querySelector(".problem-description, .coding-question, .que.coderunner, .question_holder, main, article, body");
    const statement = (container?.innerText || container?.textContent || "").trim();
    const parsedSections = extractSectionsFromText(statement);
    const sampleTests = parseSampleTestsFromText(statement);
    const editor = window.ExamAssist.EditorAdapters?.extractEditorState(doc) || { adapter: "none", code: "", language: "python", consoleOutput: "" };

    return {
      platform: this.platform,
      questionSubType: detectCodingSubType({ statement, code: editor.code, failingOutput: editor.consoleOutput }),
      title,
      statement,
      constraints: parsedSections.constraints,
      inputFormat: parsedSections.inputFormat,
      outputFormat: parsedSections.outputFormat,
      sampleTests,
      starterCode: editor.code,
      language: editor.language || "python",
      failingOutput: editor.consoleOutput,
      options: [],
      editor
    };
  }
}

function extractCodingProblem(doc = document) {
  const specificAdapters = [
    new HackerRankAdapter(),
    new LeetCodeAdapter(),
    new GeeksforGeeksAdapter()
  ];
  for (const adapter of specificAdapters) {
    if (adapter.canHandle(doc)) {
      return adapter.extract(doc);
    }
  }
  return new GenericCodingAdapter().extract(doc);
}

/**
 * Sets up a debounced MutationObserver for SPA problem changes.
 */
function observeCodingProblemChanges(doc = document, onChange, debounceMs = 350) {
  if (typeof MutationObserver === "undefined" || !doc?.body) return () => {};
  let timer = null;
  let lastSignature = "";

  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const extracted = extractCodingProblem(doc);
      const sig = `${extracted.platform}|${extracted.title}|${extracted.statement.slice(0, 160)}|${extracted.language}`;
      if (sig !== lastSignature) {
        lastSignature = sig;
        onChange(extracted);
      }
    }, debounceMs);
  });

  observer.observe(doc.body, { childList: true, subtree: true });
  return () => {
    if (timer) clearTimeout(timer);
    observer.disconnect();
  };
}

window.ExamAssist.ProblemAdapters = {
  HackerRankAdapter,
  LeetCodeAdapter,
  GeeksforGeeksAdapter,
  GenericCodingAdapter,
  detectCodingSubType,
  parseSampleTestsFromText,
  extractSectionsFromText,
  extractCodingProblem,
  observeCodingProblemChanges
};
