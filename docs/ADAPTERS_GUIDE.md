# ExamAssist AI — Editor & Problem Adapters Guide

ExamAssist AI uses strictly **read-only** DOM adapters in `extension/src/extractors/` (`adapters.ts`) to extract code, problem statements, constraints, sample tests, and multiple-choice options from learning platforms and code editors.

---

## 1. Hard Read-Only Guarantee

- **Zero Host-Page Mutation**: Adapters never call `.setValue()`, `.dispatchEvent(new KeyboardEvent(...))`, `document.execCommand("insertText")`, or mutate host editor DOM nodes.
- **User-Applied Output Only**: Solutions, repaired code, and diffs are rendered exclusively inside ExamAssist AI's isolated Shadow DOM (`#examai-shadow-host`) or Chrome Side Panel. Code leaves the panel **only** when the user explicitly clicks **Copy Code** or **Copy Diff**.

---

## 2. Supported Code Editor Adapters (`EditorAdapters`)

| Adapter | Target Editor | Detection Selector | Read-Only Extraction Strategy |
|---|---|---|---|
| **Monaco** | VS Code Web / LeetCode / HackerRank | `.monaco-editor` | Reads visible `.view-lines .view-line` text lines in DOM order |
| **CodeMirror 6** | Modern web IDEs | `.cm-editor .cm-content` | Reads `.cm-line` elements or `cm-content` textContent |
| **CodeMirror 5** | Classic web IDEs | `.CodeMirror` | Reads `.CodeMirror-line` elements in DOM order |
| **Ace Editor** | Cloud9 / GeeksforGeeks | `.ace_editor` | Reads `.ace_line` elements in `.ace_text-layer` |
| **Plain Textarea** | Standard HTML forms | `textarea` | Reads `.value` or `.textContent` |
| **Pre / Code Block** | Static code listings | `pre code, pre` | Reads `.textContent` and detects language from `language-*` class |

---

## 3. Supported Assessment & Coding Platform Adapters (`ProblemAdapters`)

| Platform Adapter | Target Portal | Extracted Fields |
|---|---|---|
| **MoodleAdapter** | Moodle LMS (`.que`, `.formulation`, `.qtext`) | Question stem, `.answer` options (`A–D`), embedded `<pre><code>` blocks |
| **CanvasAdapter** | Instructure Canvas (`.question_holder`, `.question_text`) | Question text, `.answer_label` choices, embedded code/math |
| **LeetCodeAdapter** | `[data-track-load="description_content"]` / `.elfjS` | Problem title, description, constraints, `Input:` / `Output:` sample test pairs |
| **HackerRankAdapter** | `.challenge-body-html` / `.problem-statement` | Problem statement, input/output format, constraints, sample stdin/stdout |
| **GeeksforGeeksAdapter** | `.problems_problem_content` | Problem body, examples, constraints |
| **GenericExtractor** | Any user-authorized page | User text selection, nearest question container, radio/checkbox labels |

---

## 4. Testing Adapters

- **Unit Tests (Vitest + jsdom)**: `extension/test/adapters.test.ts` tests Monaco, CodeMirror 5/6, Ace, textarea, pre/code, Moodle, HackerRank, LeetCode, and GeeksforGeeks fixtures, and verifies the read-only source guard.
- **End-to-End Tests (Playwright)**: `extension/e2e/extension.spec.ts` runs against local fixture pages (`extension/e2e/fixtures/`) for Monaco, CodeMirror, plain textarea, and Moodle quiz workflows.
