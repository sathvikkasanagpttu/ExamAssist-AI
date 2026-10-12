import { describe, it, expect, beforeEach } from "vitest";
import {
  MonacoAdapter,
  CodeMirror6Adapter,
  CodeMirror5Adapter,
  AceAdapter,
  TextareaAdapter,
  PreCodeAdapter,
  extractEditorState,
  extractCodingProblem,
  ExtractionManager,
  parseQuestionAndOptions
} from "../src/extractors";
import { validateRuntimeMessage } from "../src/messaging";
import { ensureShadowOverlayRoot, SHADOW_HOST_ID } from "../src/ui";

describe("Phase 1: Read-Only Editor Adapters (Vitest + jsdom)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("MonacoAdapter extracts code, language, cursorLine, and consoleOutput without mutating DOM", () => {
    const html = `
      <div class="monaco-editor" data-mode-id="python">
        <div class="view-lines">
          <div class="view-line">def two_sum(nums, target):</div>
          <div class="view-line">\u00a0\u00a0\u00a0\u00a0return [0, 1]</div>
        </div>
        <div class="active-line-number">2</div>
      </div>
      <div class="console-output">AssertionError: expected [1, 2]</div>
    `;
    document.body.innerHTML = html;
    const snapshotBefore = document.body.innerHTML;

    const adapter = new MonacoAdapter();
    expect(adapter.canHandle(document)).toBe(true);
    const state = adapter.extract(document);
    expect(state).not.toBeNull();
    expect(state?.adapter).toBe("MonacoAdapter");
    expect(state?.language).toBe("python");
    expect(state?.code).toBe("def two_sum(nums, target):\n    return [0, 1]");
    expect(state?.cursorLine).toBe(2);
    expect(state?.consoleOutput).toContain("AssertionError");
    expect(document.body.innerHTML).toBe(snapshotBefore);
  });

  it("CodeMirror6Adapter extracts .cm-line content and language attribute read-only", () => {
    document.body.innerHTML = `
      <div class="cm-editor" data-language="cpp">
        <div class="cm-content" contenteditable="true">
          <div class="cm-line">#include &lt;vector&gt;</div>
          <div class="cm-line">int solve(int n) { return n + 1; }</div>
        </div>
      </div>
    `;
    const snapshotBefore = document.body.innerHTML;
    const adapter = new CodeMirror6Adapter();
    expect(adapter.canHandle(document)).toBe(true);
    const state = adapter.extract(document);
    expect(state?.adapter).toBe("CodeMirror6Adapter");
    expect(state?.language).toBe("cpp");
    expect(state?.code).toContain("int solve(int n)");
    expect(document.body.innerHTML).toBe(snapshotBefore);
  });

  it("CodeMirror5Adapter extracts .CodeMirror-line content read-only", () => {
    document.body.innerHTML = `
      <div class="CodeMirror" data-mode="text/x-java">
        <pre class="CodeMirror-line">class Solution {\u200b</pre>
        <pre class="CodeMirror-line">  public int add(int a, int b) { return a + b; }</pre>
        <pre class="CodeMirror-line">}</pre>
      </div>
    `;
    const adapter = new CodeMirror5Adapter();
    expect(adapter.canHandle(document)).toBe(true);
    const state = adapter.extract(document);
    expect(state?.adapter).toBe("CodeMirror5Adapter");
    expect(state?.language).toBe("java");
    expect(state?.code).toContain("public int add(int a, int b)");
  });

  it("AceAdapter extracts .ace_line content read-only", () => {
    document.body.innerHTML = `
      <select class="language-selector"><option value="javascript" selected>JavaScript</option></select>
      <div class="ace_editor">
        <div class="ace_line">function fib(n) {</div>
        <div class="ace_line">  return n &lt;= 1 ? n : fib(n - 1) + fib(n - 2);</div>
        <div class="ace_line">}</div>
      </div>
    `;
    const adapter = new AceAdapter();
    expect(adapter.canHandle(document)).toBe(true);
    const state = adapter.extract(document);
    expect(state?.adapter).toBe("AceAdapter");
    expect(state?.language).toBe("javascript");
    expect(state?.code).toContain("function fib(n)");
  });

  it("TextareaAdapter and PreCodeAdapter extract code read-only without changing value", () => {
    document.body.innerHTML = `
      <textarea id="code-editor" data-language="sql">SELECT name FROM students WHERE gpa &gt;= 3.5;</textarea>
    `;
    const ta = document.getElementById("code-editor") as HTMLTextAreaElement;
    const taAdapter = new TextareaAdapter();
    expect(taAdapter.canHandle(document)).toBe(true);
    const taState = taAdapter.extract(document);
    expect(taState?.adapter).toBe("TextareaAdapter");
    expect(taState?.language).toBe("sql");
    expect(taState?.code).toBe("SELECT name FROM students WHERE gpa >= 3.5;");
    expect(ta.value).toBe("SELECT name FROM students WHERE gpa >= 3.5;");

    document.body.innerHTML = `<pre><code class="language-c">int main(void) { return 0; }</code></pre>`;
    const preAdapter = new PreCodeAdapter();
    expect(preAdapter.canHandle(document)).toBe(true);
    const preState = preAdapter.extract(document);
    expect(preState?.adapter).toBe("PreCodeAdapter");
    expect(preState?.language).toBe("c");
    expect(preState?.code).toBe("int main(void) { return 0; }");
  });

  it("ProblemAdapters and MoodleAdapter extract platform problem statements, sample tests, and quiz options", () => {
    document.body.innerHTML = `
      <div class="challenge-view">
        <h1>Shortest Path in Grid</h1>
        <div class="challenge-body-html">
          Find the shortest path in an N x M grid.
          Constraints:
          1 <= N, M <= 500
          Sample Input:
          2 2
          0 0
          0 0
          Sample Output:
          2
        </div>
        <div class="monaco-editor" data-mode-id="python">
          <div class="view-lines">
            <div class="view-line">def shortest_path(grid): pass</div>
          </div>
        </div>
      </div>
    `;
    const problem = extractCodingProblem(document);
    expect(problem.platform).toBe("HackerRank");
    expect(problem.title).toBe("Shortest Path in Grid");
    expect(problem.constraints).toContain("1 <= N, M <= 500");
    expect(problem.sampleTests.length).toBe(1);
    expect(problem.sampleTests[0].expectedOutput).toBe("2");
    expect(problem.editor?.adapter).toBe("MonacoAdapter");

    // Moodle Quiz Fixture
    document.body.innerHTML = `
      <div class="path-mod-quiz">
        <div class="que multichoice">
          <div class="formulation">
            <div class="qtext">Which sorting algorithm is stable and runs in O(n log n) worst-case time?</div>
            <div class="answer">
              <div class="r0">A. QuickSort</div>
              <div class="r1">B. MergeSort</div>
              <div class="r0">C. HeapSort</div>
              <div class="r1">D. SelectionSort</div>
            </div>
          </div>
        </div>
      </div>
    `;
    const manager = new ExtractionManager();
    const moodleRes = manager.extract(document.querySelector(".qtext"), document);
    expect(moodleRes?.success).toBe(true);
    expect(moodleRes?.sourceAdapter).toBe("MoodleAdapter");
    expect(moodleRes?.question).toContain("Which sorting algorithm is stable");
    expect(moodleRes?.options.length).toBe(4);

    const inlineParsed = parseQuestionAndOptions("What is 2 + 2?\nA) 3\nB) 4\nC) 5\nD) 6");
    expect(inlineParsed.question).toBe("What is 2 + 2?");
    expect(inlineParsed.options.length).toBe(4);
  });

  it("Validates runtime messages with shared Zod schemas and mounts UI inside Shadow DOM root", () => {
    expect(validateRuntimeMessage({ type: "TRIGGER_EXAM_ASSIST" }).valid).toBe(true);
    expect(validateRuntimeMessage({ type: "ASK", question: "Explain Dijkstra" }).valid).toBe(true);
    expect(validateRuntimeMessage({ type: "ASK", question: "" }).valid).toBe(false);
    expect(validateRuntimeMessage({ type: "UNKNOWN_TYPE" }).valid).toBe(false);

    const shadow = ensureShadowOverlayRoot(document);
    const host = document.getElementById(SHADOW_HOST_ID);
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).toBe(shadow);
    expect(shadow.querySelector("style[data-examai-shadow-styles]")).not.toBeNull();
  });
});
