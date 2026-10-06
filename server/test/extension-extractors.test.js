import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_DIR = path.resolve(__dirname, "../../extension");

// ==========================================
// MOCK DOM IMPLEMENTATION FOR NODE UNIT TESTS
// ==========================================

class MockDOMElement {
  constructor(tag = "div", attrs = {}, text = "") {
    this.tagName = tag.toUpperCase();
    this.nodeType = 1; // Node.ELEMENT_NODE
    this.attributes = { ...attrs };
    this.id = attrs.id || "";
    this.className = attrs.class || attrs.className || "";
    this.type = attrs.type || "";
    this.children = [];
    this.parentElement = null;
    this._text = text;
  }

  get classList() {
    const classes = this.className.split(/\s+/).filter(Boolean);
    return {
      contains: (cls) => classes.includes(cls),
      add: (cls) => {
        if (!classes.includes(cls)) classes.push(cls);
        this.className = classes.join(" ");
      }
    };
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === "id") this.id = String(val);
    if (name === "class") this.className = String(val);
  }

  get textContent() {
    if (this._text) return this._text;
    return this.children.map(c => c.textContent).join(" ");
  }

  set textContent(val) {
    this._text = val;
    this.children = [];
  }

  get innerText() {
    return this.textContent;
  }

  set innerText(val) {
    this.textContent = val;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  matches(selector) {
    const sel = selector.trim();
    if (sel.startsWith(".")) {
      const cls = sel.slice(1);
      return this.classList.contains(cls);
    }
    if (sel.startsWith("#")) {
      const id = sel.slice(1);
      return this.id === id;
    }
    if (sel.startsWith("[") && sel.endsWith("]")) {
      const attr = sel.slice(1, -1);
      if (attr.includes("=")) {
        const [k, v] = attr.split("=");
        const cleanV = v.replace(/['"]/g, "");
        return this.getAttribute(k) === cleanV;
      }
      return Boolean(this.getAttribute(attr));
    }
    return this.tagName.toLowerCase() === sel.toLowerCase();
  }

  closest(selector) {
    const parts = selector.split(",").map(s => s.trim());
    let curr = this;
    while (curr) {
      for (const p of parts) {
        if (curr.matches(p)) return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const selectorGroups = selector.split(",").map(s => s.trim());

    const matchesSelector = (el, selString) => {
      const parts = selString.split(/\s+/).filter(Boolean);
      let curr = el;
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (!curr) return false;
        if (i === parts.length - 1) {
          if (!curr.matches(part)) return false;
        } else {
          let ancestor = curr.parentElement;
          let foundAncestor = false;
          while (ancestor) {
            if (ancestor.matches(part)) {
              foundAncestor = true;
              curr = ancestor;
              break;
            }
            ancestor = ancestor.parentElement;
          }
          if (!foundAncestor) return false;
        }
      }
      return true;
    };

    function search(node) {
      for (const child of node.children) {
        for (const s of selectorGroups) {
          if (matchesSelector(child, s)) {
            if (!results.includes(child)) results.push(child);
            break;
          }
        }
        search(child);
      }
    }

    search(this);
    return results;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }
}

// Helper to load extension extractor scripts into a sandboxed global scope
function createExtractorEnvironment() {
  const sandbox = {
    window: {},
    document: {
      querySelector: () => null,
      querySelectorAll: () => []
    },
    Node: {
      ELEMENT_NODE: 1,
      TEXT_NODE: 3
    },
    CSS: {
      escape: (s) => s
    },
    console
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);

  const baseSrc = fs.readFileSync(path.join(EXTENSION_DIR, "extractors/BaseExtractor.js"), "utf8");
  const genericSrc = fs.readFileSync(path.join(EXTENSION_DIR, "extractors/GenericExtractor.js"), "utf8");
  const canvasSrc = fs.readFileSync(path.join(EXTENSION_DIR, "extractors/CanvasAdapter.js"), "utf8");
  const moodleSrc = fs.readFileSync(path.join(EXTENSION_DIR, "extractors/MoodleAdapter.js"), "utf8");
  const customSrc = fs.readFileSync(path.join(EXTENSION_DIR, "extractors/CustomPortalAdapter.js"), "utf8");
  const managerSrc = fs.readFileSync(path.join(EXTENSION_DIR, "extractors/ExtractionManager.js"), "utf8");

  vm.runInContext(baseSrc, context);
  vm.runInContext(genericSrc, context);
  vm.runInContext(canvasSrc, context);
  vm.runInContext(moodleSrc, context);
  vm.runInContext(customSrc, context);
  vm.runInContext(managerSrc, context);

  return sandbox.ExamAssist;
}

// Function to test parseQuestionAndOptions extracted from content.js
function parseQuestionAndOptions(raw) {
  if (!raw || typeof raw !== "string") {
    return { question: "", options: [] };
  }
  const text = raw.trim();

  // 1. Line-by-line strategy
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const optionRegex = /^(?:\(?([A-Ha-h0-9])[\.\)\:\-\]]|\[([A-Ha-h0-9])\])\s+(.+)$/;

  const rawMatches = [];
  const questionLines = [];
  let foundFirstOption = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(optionRegex);
    if (match) {
      const key = (match[1] || match[2] || "").toUpperCase();
      const isDigit = /^\d+$/.test(key);
      const hasQuestionMark = line.includes("?");
      const laterHasLetters = lines.slice(i + 1).some(l => /^(?:\(?[A-Da-d][\.\)\:\-\]]|\[[A-Da-d]\])/.test(l));

      if (isDigit && (hasQuestionMark || laterHasLetters)) {
        questionLines.push(line);
        continue;
      }

      foundFirstOption = true;
      const optText = match[3].trim();
      rawMatches.push({ letter: key, text: optText });
    } else {
      if (!foundFirstOption) {
        questionLines.push(line);
      } else {
        if (rawMatches.length > 0) {
          rawMatches[rawMatches.length - 1].text += " " + line;
        } else {
          questionLines.push(line);
        }
      }
    }
  }

  if (rawMatches.length >= 2) {
    const q = questionLines.join("\n").trim();
    return {
      question: q.length >= 3 ? q : text,
      options: rawMatches.map(m => `${m.letter}) ${m.text}`)
    };
  }

  // 2. Inline strategy
  const markerRegex = /(?:^|\s+)(?:\(?([A-Ha-h1-8])[\.\)\:\-]|\[([A-Ha-h1-8])\])(?=\s+)/g;
  const matches = [...text.matchAll(markerRegex)];
  if (matches.length >= 2) {
    const keys = matches.map(m => (m[1] || m[2]).toUpperCase());
    const isAlphaSeq = keys[0] === "A" && keys[1] === "B";
    const isNumSeq = keys[0] === "1" && keys[1] === "2";
    const uniqueKeys = new Set(keys);
    if (isAlphaSeq || isNumSeq || uniqueKeys.size === keys.length) {
      const q = text.slice(0, matches[0].index).trim();
      const inlineOpts = [];
      for (let i = 0; i < matches.length; i++) {
        const key = keys[i];
        const start = matches[i].index + matches[i][0].length;
        const end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
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

// ==========================================
// TEST SUITES
// ==========================================

test("Extension Extractor: parseQuestionAndOptions extracts multiline options", () => {
  const raw = `What is the chemical formula for water?
A) CO2
B) H2O
C) NaCl
D) O2`;

  const parsed = parseQuestionAndOptions(raw);
  assert.equal(parsed.question, "What is the chemical formula for water?");
  assert.equal(parsed.options.length, 4);
  assert.equal(parsed.options[0], "A) CO2");
  assert.equal(parsed.options[1], "B) H2O");
  assert.equal(parsed.options[2], "C) NaCl");
  assert.equal(parsed.options[3], "D) O2");
});

test("Extension Extractor: parseQuestionAndOptions extracts inline options", () => {
  const raw = "What is 2 + 2? (A) 3 (B) 4 (C) 5 (D) 6";
  const parsed = parseQuestionAndOptions(raw);

  assert.equal(parsed.question, "What is 2 + 2?");
  assert.equal(parsed.options.length, 4);
  assert.equal(parsed.options[0], "A) 3");
  assert.equal(parsed.options[1], "B) 4");
});

test("Extension Extractor: parseQuestionAndOptions preserves questions without options", () => {
  const raw = "Explain the fundamental theorem of calculus in two sentences.";
  const parsed = parseQuestionAndOptions(raw);

  assert.equal(parsed.question, raw);
  assert.equal(parsed.options.length, 0);
});

test("Extension Extractor: GenericExtractor extracts question, radio options, and code", () => {
  const ExamAssist = createExtractorEnvironment();
  const extractor = new ExamAssist.GenericExtractor();

  // Create simulated generic question card
  const container = new MockDOMElement("div", { class: "question-container card" });
  const qEl = new MockDOMElement("p", { class: "q-text" }, "What does this code output?");
  container.appendChild(qEl);

  // Add code snippet
  const codeEl = new MockDOMElement("pre", {}, "console.log(typeof NaN);");
  container.appendChild(codeEl);

  // Add options with radio inputs and labels
  const opt1 = new MockDOMElement("div", { class: "option" }, "number");
  const opt2 = new MockDOMElement("div", { class: "option" }, "undefined");
  const opt3 = new MockDOMElement("div", { class: "option" }, "object");
  container.appendChild(opt1);
  container.appendChild(opt2);
  container.appendChild(opt3);

  const result = extractor.extract("What does this code output?", qEl);

  assert.equal(result.success, true);
  assert.equal(result.question, "What does this code output?");
  assert.equal(result.options.length, 3);
  assert.ok(result.options[0].includes("number"));
  assert.ok(result.codeSnippet.includes("console.log(typeof NaN)"));
  assert.equal(result.sourceAdapter, "GenericExtractor");
});

test("Extension Extractor: CanvasAdapter extracts question and answers from Canvas quiz fixture", () => {
  const ExamAssist = createExtractorEnvironment();
  const adapter = new ExamAssist.CanvasAdapter();

  // Create Canvas quiz DOM structure
  const holder = new MockDOMElement("div", { class: "question_holder display_question" });
  const textEl = new MockDOMElement("div", { class: "question_text" }, "What is the capital of Spain?");
  holder.appendChild(textEl);

  const answersContainer = new MockDOMElement("div", { class: "answers" });
  answersContainer.appendChild(new MockDOMElement("div", { class: "answer" }, "Madrid"));
  answersContainer.appendChild(new MockDOMElement("div", { class: "answer" }, "Barcelona"));
  answersContainer.appendChild(new MockDOMElement("div", { class: "answer" }, "Valencia"));
  answersContainer.appendChild(new MockDOMElement("div", { class: "answer" }, "Seville"));
  holder.appendChild(answersContainer);

  assert.equal(adapter.canHandle(textEl), true);

  const result = adapter.extract("What is the capital of Spain?", textEl);
  assert.equal(result.success, true);
  assert.equal(result.question, "What is the capital of Spain?");
  assert.equal(result.options.length, 4);
  assert.ok(result.options.includes("Madrid"));
  assert.ok(result.options.includes("Barcelona"));
  assert.equal(result.sourceAdapter, "CanvasAdapter");
});

test("Extension Extractor: MoodleAdapter extracts question and options from Moodle quiz fixture", () => {
  const ExamAssist = createExtractorEnvironment();
  const adapter = new ExamAssist.MoodleAdapter();

  // Create Moodle quiz DOM structure
  const que = new MockDOMElement("div", { class: "que multichoice" });
  const qtext = new MockDOMElement("div", { class: "qtext" }, "Which gas do plants absorb during photosynthesis?");
  que.appendChild(qtext);

  const answerDiv = new MockDOMElement("div", { class: "answer" });
  answerDiv.appendChild(new MockDOMElement("div", { class: "r0" }, "Carbon dioxide"));
  answerDiv.appendChild(new MockDOMElement("div", { class: "r1" }, "Oxygen"));
  answerDiv.appendChild(new MockDOMElement("div", { class: "r0" }, "Nitrogen"));
  answerDiv.appendChild(new MockDOMElement("div", { class: "r1" }, "Helium"));
  que.appendChild(answerDiv);

  assert.equal(adapter.canHandle(qtext), true);

  const result = adapter.extract("Which gas do plants absorb during photosynthesis?", qtext);
  assert.equal(result.success, true);
  assert.equal(result.question, "Which gas do plants absorb during photosynthesis?");
  assert.equal(result.options.length, 4);
  assert.ok(result.options.includes("Carbon dioxide"));
  assert.ok(result.options.includes("Oxygen"));
  assert.equal(result.sourceAdapter, "MoodleAdapter");
});

test("Extension Extractor: ExtractionManager selects correct adapter in priority order", () => {
  const ExamAssist = createExtractorEnvironment();
  const manager = new ExamAssist.ExtractionManager();

  assert.equal(manager.generic.name, "GenericExtractor");
  assert.equal(manager.adapters.length, 3);
  assert.equal(manager.adapters[0].name, "MoodleAdapter");
  assert.equal(manager.adapters[1].name, "CanvasAdapter");
  assert.equal(manager.adapters[2].name, "CustomPortalAdapter");

  // 1. Canvas element should activate CanvasAdapter when generic lacks options
  const canvasEl = new MockDOMElement("div", { class: "question_holder" });
  const canvasText = new MockDOMElement("div", { class: "question_text" }, "Canvas question");
  canvasEl.appendChild(canvasText);
  const answersDiv = new MockDOMElement("div", { class: "answers" });
  answersDiv.appendChild(new MockDOMElement("div", { class: "answer" }, "Option 1"));
  answersDiv.appendChild(new MockDOMElement("div", { class: "answer" }, "Option 2"));
  canvasEl.appendChild(answersDiv);

  const mockCanvasSel = {
    toString: () => "Canvas question",
    anchorNode: canvasText
  };
  const canvasRes = manager.extractFromSelection(mockCanvasSel);
  assert.equal(canvasRes.sourceAdapter, "CanvasAdapter");
  assert.equal(canvasRes.options.length, 2);

  // 2. Moodle element should activate MoodleAdapter
  const moodleEl = new MockDOMElement("div", { class: "que" });
  const moodleText = new MockDOMElement("div", { class: "qtext" }, "Moodle question");
  moodleEl.appendChild(moodleText);
  const moodleAns = new MockDOMElement("div", { class: "answer" });
  moodleAns.appendChild(new MockDOMElement("div", { class: "r0" }, "Choice A"));
  moodleAns.appendChild(new MockDOMElement("div", { class: "r1" }, "Choice B"));
  moodleEl.appendChild(moodleAns);

  const mockMoodleSel = {
    toString: () => "Moodle question",
    anchorNode: moodleText
  };
  const moodleRes = manager.extractFromSelection(mockMoodleSel);
  assert.equal(moodleRes.sourceAdapter, "MoodleAdapter");
  assert.equal(moodleRes.options.length, 2);

  // 3. Generic element without special container returns GenericExtractor
  const genericEl = new MockDOMElement("div", { class: "generic-body" }, "Plain question text");
  const mockGenericSel = {
    toString: () => "Plain question text",
    anchorNode: genericEl
  };
  const genericRes = manager.extractFromSelection(mockGenericSel);
  assert.equal(genericRes.sourceAdapter, "GenericExtractor");
});
