import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuestion } from "../pipeline/classifier.js";
import { normalizeOptionsList, validateOptionIntegrity, generateReasonedAnswer } from "../pipeline/reasoningEngine.js";
import { evaluateNumericalContext } from "../pipeline/calculator.js";
import { runSandboxedCode } from "../pipeline/sandboxRunner.js";
import { defaultAIClient } from "../aiClient.js";

// ==========================================
// 20 MCQ QUESTIONS (SHUFFLED CORRECT OPTIONS)
// ==========================================

const shuffledMCQs = [
  {
    q: "In Python, which keyword is used to define a function?\nA) def\nB) func\nC) fn\nD) define",
    correctOpt: "A",
    correctText: "def",
    subject: "Computer Science"
  },
  {
    q: "Which organelle generates ATP via cellular respiration?\nA) Ribosome\nB) Mitochondria\nC) Golgi apparatus\nD) Lysosome",
    correctOpt: "B",
    correctText: "Mitochondria",
    subject: "Biology"
  },
  {
    q: "What is the capital city of Australia?\nA) Sydney\nB) Melbourne\nC) Canberra\nD) Brisbane",
    correctOpt: "C",
    correctText: "Canberra",
    subject: "General Academic"
  },
  {
    q: "What is the approximate speed of light in a vacuum?\nA) 1.5 x 10^8 m/s\nB) 3.0 x 10^6 m/s\nC) 9.8 m/s^2\nD) 3.0 x 10^8 m/s",
    correctOpt: "D",
    correctText: "3.0 x 10^8 m/s",
    subject: "Physics"
  },
  {
    q: "What is the chemical symbol for Gold?\nA) Au\nB) Ag\nC) Fe\nD) Gd",
    correctOpt: "A",
    correctText: "Au",
    subject: "Chemistry"
  },
  {
    q: "Which data structure operates on a Last-In-First-Out (LIFO) basis?\nA) Queue\nB) Stack\nC) Linked List\nD) Hash Table",
    correctOpt: "B",
    correctText: "Stack",
    subject: "Computer Science"
  },
  {
    q: "In what year was the Treaty of Versailles signed?\nA) 1914\nB) 1939\nC) 1919\nD) 1945",
    correctOpt: "C",
    correctText: "1919",
    subject: "History"
  },
  {
    q: "What is the derivative of cos(x) with respect to x?\nA) sin(x)\nB) tan(x)\nC) -sec(x)\nD) -sin(x)",
    correctOpt: "D",
    correctText: "-sin(x)",
    subject: "Mathematics"
  },
  {
    q: "Which economic market structure features a single dominant supplier?\nA) Monopoly\nB) Oligopoly\nC) Monopsony\nD) Perfect Competition",
    correctOpt: "A",
    correctText: "Monopoly",
    subject: "Economics & Finance"
  },
  {
    q: "Who is the playwright of Hamlet?\nA) John Milton\nB) Geoffrey Chaucer\nC) William Shakespeare\nD) Christopher Marlowe",
    correctOpt: "C",
    correctText: "William Shakespeare",
    subject: "Literature"
  },
  {
    q: "What is the SI unit of electrical current?\nA) Volt\nB) Ampere\nC) Ohm\nD) Joule",
    correctOpt: "B",
    correctText: "Ampere",
    subject: "Physics"
  },
  {
    q: "Which primary enzyme synthesizes new DNA strands during replication?\nA) RNA Ligase\nB) Amylase\nC) Protease\nD) DNA Polymerase",
    correctOpt: "D",
    correctText: "DNA Polymerase",
    subject: "Biology"
  },
  {
    q: "Which standard HTTP response status code indicates 'Not Found'?\nA) 404\nB) 500\nC) 200\nD) 301",
    correctOpt: "A",
    correctText: "404",
    subject: "Computer Science"
  },
  {
    q: "Which subatomic particle possesses a positive charge?\nA) Electron\nB) Neutron\nC) Proton\nD) Photon",
    correctOpt: "C",
    correctText: "Proton",
    subject: "Physics"
  },
  {
    q: "What is the lightest element on the periodic table?\nA) Helium\nB) Hydrogen\nC) Lithium\nD) Carbon",
    correctOpt: "B",
    correctText: "Hydrogen",
    subject: "Chemistry"
  },
  {
    q: "What is the average time complexity of element access in an indexed array?\nA) O(1)\nB) O(n)\nC) O(log n)\nD) O(n^2)",
    correctOpt: "A",
    correctText: "O(1)",
    subject: "Computer Science"
  },
  {
    q: "Which gas comprises approximately 78% of Earth's atmosphere?\nA) Oxygen\nB) Carbon Dioxide\nC) Argon\nD) Nitrogen",
    correctOpt: "D",
    correctText: "Nitrogen",
    subject: "General Academic"
  },
  {
    q: "Which law of physics is expressed by the formula F = ma?\nA) Newton's First Law\nB) Newton's Second Law\nC) Newton's Third Law\nD) Universal Gravitation",
    correctOpt: "B",
    correctText: "Newton's Second Law",
    subject: "Physics"
  },
  {
    q: "What is the primary organic acid present in lemons?\nA) Acetic acid\nB) Lactic acid\nC) Citric acid\nD) Formic acid",
    correctOpt: "C",
    correctText: "Citric acid",
    subject: "Chemistry"
  },
  {
    q: "What biological process converts light energy into chemical energy?\nA) Photosynthesis\nB) Glycolysis\nC) Cellular Respiration\nD) Fermentation",
    correctOpt: "A",
    correctText: "Photosynthesis",
    subject: "Biology"
  }
];

test("Academic Suite: 20 MCQs with Shuffled Option Positions", async () => {
  const lettersCount = { A: 0, B: 0, C: 0, D: 0 };

  for (let i = 0; i < shuffledMCQs.length; i++) {
    const item = shuffledMCQs[i];
    lettersCount[item.correctOpt] = (lettersCount[item.correctOpt] || 0) + 1;

    // 1. Classification check
    const classification = classifyQuestion(item.q);
    assert.equal(classification.questionType, "MCQ", `Q${i + 1} must be classified as MCQ`);
    assert.equal(classification.options.length, 4, `Q${i + 1} must extract 4 options`);

    // 2. Normalized options check
    const normalized = normalizeOptionsList(classification.options);
    assert.equal(normalized.length, 4);

    // 3. Option integrity check for correct answer
    const integrity = validateOptionIntegrity(
      { option: item.correctOpt, text: item.correctText },
      normalized
    );
    assert.equal(integrity.valid, true, `Q${i + 1} option integrity must be valid for ${item.correctOpt}`);
    assert.equal(integrity.option, item.correctOpt);

    // 4. Validate that a wrong letter fails integrity check
    const badOpt = item.correctOpt === "A" ? "B" : "A";
    const invalidIntegrity = validateOptionIntegrity(
      { option: badOpt, text: item.correctText },
      normalized
    );
    assert.equal(invalidIntegrity.valid, false, `Mismatched letter ${badOpt} with text ${item.correctText} must be detected as invalid`);
  }

  // Confirm distributed positions (not always B)
  assert.ok(lettersCount.A >= 3, "Answer A must appear multiple times");
  assert.ok(lettersCount.B >= 3, "Answer B must appear multiple times");
  assert.ok(lettersCount.C >= 3, "Answer C must appear multiple times");
  assert.ok(lettersCount.D >= 3, "Answer D must appear multiple times");
});

// ==========================================
// 10 NUMERICAL PROBLEMS (MATHJS FORMULA + STEPS)
// ==========================================

const numericalTestCases = [
  {
    name: "Arithmetic Operator Precedence",
    q: "Calculate the value of 4 * (12 - 3) + 5^2.",
    formula: "4 * (12 - 3) + 5^2",
    expectedResult: 61,
    options: ["A) 55", "B) 61", "C) 72", "D) 81"],
    expectedOption: "B"
  },
  {
    name: "Kinetic Energy Physics Formula",
    q: "Calculate kinetic energy KE = 0.5 * m * v^2 for m = 4 kg and v = 3 m/s.",
    formula: "0.5 * 4 * 3^2",
    expectedResult: 18,
    options: ["A) 12 J", "B) 36 J", "C) 18 J", "D) 24 J"],
    expectedOption: "C"
  },
  {
    name: "Newton's Second Law Force",
    q: "Find force F = m * a when m = 1500 kg and a = 3 m/s^2.",
    formula: "1500 * 3",
    expectedResult: 4500,
    options: ["A) 4500 N", "B) 500 N", "C) 1503 N", "D) 3000 N"],
    expectedOption: "A"
  },
  {
    name: "Fraction and Arithmetic",
    q: "Evaluate (25 * 4) / 10 + 7.",
    formula: "(25 * 4) / 10 + 7",
    expectedResult: 17,
    options: ["A) 10", "B) 14", "C) 20", "D) 17"],
    expectedOption: "D"
  },
  {
    name: "Simple Financial Interest",
    q: "Calculate simple interest I = P * r * t for P = 1000, r = 0.05, and t = 3 years.",
    formula: "1000 * 0.05 * 3",
    expectedResult: 150,
    options: ["A) $150", "B) $105", "C) $300", "D) $50"],
    expectedOption: "A"
  },
  {
    name: "Pythagorean Theorem Hypotenuse",
    q: "Compute the hypotenuse c = sqrt(a^2 + b^2) for a right triangle with legs a = 6 and b = 8.",
    formula: "sqrt(6^2 + 8^2)",
    expectedResult: 10,
    options: ["A) 14", "B) 10", "C) 12", "D) 100"],
    expectedOption: "B"
  },
  {
    name: "Powers of Two and Subtraction",
    q: "Evaluate 2^8 - 56.",
    formula: "2^8 - 56",
    expectedResult: 200,
    options: ["A) 256", "B) 128", "C) 200", "D) 196"],
    expectedOption: "C"
  },
  {
    name: "Quadratic Discriminant",
    q: "Compute the discriminant b^2 - 4*a*c for coefficients a = 1, b = -5, c = 6.",
    formula: "(-5)^2 - 4 * 1 * 6",
    expectedResult: 1,
    options: ["A) 0", "B) -1", "C) 25", "D) 1"],
    expectedOption: "D"
  },
  {
    name: "Percentage Calculation",
    q: "Calculate a 15% tip on an $80 restaurant bill.",
    formula: "0.15 * 80",
    expectedResult: 12,
    options: ["A) $10", "B) $12", "C) $15", "D) $8"],
    expectedOption: "B"
  },
  {
    name: "Ohm's Law Voltage",
    q: "Calculate voltage V = I * R when current I = 2.5 A and resistance R = 40 Ohms.",
    formula: "2.5 * 40",
    expectedResult: 100,
    options: ["A) 100 V", "B) 42.5 V", "C) 16 V", "D) 250 V"],
    expectedOption: "A"
  }
];

test("Academic Suite: 10 Numerical Problems using mathjs Deterministic Calculator", () => {
  for (const item of numericalTestCases) {
    const normalizedOpts = normalizeOptionsList(item.options);
    const calcResult = evaluateNumericalContext(item.q, item.formula, normalizedOpts);

    assert.ok(calcResult.calculations.length > 0, `${item.name}: Must produce calculation steps`);
    const match = calcResult.calculations.find(c => Math.abs(c.result - item.expectedResult) < 0.001);
    assert.ok(match, `${item.name}: Calculation result must equal ${item.expectedResult}`);

    // Verify option matching
    assert.ok(calcResult.optionMatches.length > 0, `${item.name}: Must identify option match`);
    assert.equal(calcResult.optionMatches[0].option, item.expectedOption,
      `${item.name}: Should match Option ${item.expectedOption}`);
  }
});

// ==========================================
// 10 CODING / SQL PROBLEMS (SANDBOX TRACING & VM)
// ==========================================

const codingSandboxCases = [
  {
    name: "Case 1: Pure function return value",
    code: `function sum(a, b) { return a + b; }\nsum(15, 27);`,
    expectedReturn: 42
  },
  {
    name: "Case 2: Array filtering and transformations",
    code: `const evens = [1, 2, 3, 4, 5, 6].filter(x => x % 2 === 0);\nevens.reduce((a, b) => a + b, 0);`,
    expectedReturn: 12
  },
  {
    name: "Case 3: String palindrome check",
    code: `function isPal(s) { return s === s.split('').reverse().join(''); }\nisPal("racecar");`,
    expectedReturn: true
  },
  {
    name: "Case 4: Off-by-one loop counter tracing",
    code: `let count = 0;\nfor (let i = 0; i < 5; i++) { count += i; }\ncount;`,
    expectedReturn: 10
  },
  {
    name: "Case 5: Empty array edge case",
    code: `const arr = [];\narr.length === 0 && arr[0] === undefined;`,
    expectedReturn: true
  },
  {
    name: "Case 6: Division by zero edge case",
    code: `10 / 0;`,
    expectedReturn: Infinity
  },
  {
    name: "Case 7: Console output capture",
    code: `console.log("ExamAssist Active");`,
    expectedOutput: "ExamAssist Active"
  },
  {
    name: "Case 8: Security isolation against process/require",
    code: `typeof process;`,
    expectedReturn: "undefined"
  },
  {
    name: "Case 9: Syntax error safe recovery",
    code: `function broken( {`,
    expectError: true
  },
  {
    name: "Case 10: Infinite loop timeout protection",
    code: `while(true) {}`,
    expectTimeout: true
  }
];

test("Academic Suite: 10 Coding / Sandbox Execution Cases (Node vm)", () => {
  for (const item of codingSandboxCases) {
    const res = runSandboxedCode(item.code);

    if (item.expectError) {
      assert.equal(res.success, false, `${item.name}: Should fail execution on syntax error`);
      assert.ok(res.error, `${item.name}: Error message should be populated`);
    } else if (item.expectTimeout) {
      assert.equal(res.success, false, `${item.name}: Infinite loop should terminate`);
      assert.ok(res.error.toLowerCase().includes("timeout") || res.error.toLowerCase().includes("timed out"),
        `${item.name}: Should report timeout`);
    } else if (item.expectedOutput) {
      assert.equal(res.success, true);
      assert.ok(res.output.includes(item.expectedOutput), `${item.name}: Output should contain logged string`);
    } else {
      assert.equal(res.success, true, `${item.name}: Execution should succeed`);
      assert.equal(res.returnValue, item.expectedReturn, `${item.name}: Return value should match expected`);
    }
  }
});

// ==========================================
// 10 CONCEPTUAL / SHORT-ANSWER QUESTIONS
// ==========================================

const conceptualTestCases = [
  { q: "What is the core principle of Heisenberg's Uncertainty Principle in quantum mechanics?", subject: "Physics" },
  { q: "Explain the biological mechanism of competitive versus non-competitive enzyme inhibition.", subject: "Biology" },
  { q: "Describe the economic principle of comparative advantage in international trade.", subject: "Economics & Finance" },
  { q: "What is the difference between a priori and a posteriori knowledge in epistemology?", subject: "Philosophy & Ethics" },
  { q: "Explain how fiscal policy differs from monetary policy in macroeconomic stabilization.", subject: "Economics & Finance" },
  { q: "What causes the seasonal monsoon winds in South Asia?", subject: "Geography" },
  { q: "Describe the function of the ribosome in cellular protein synthesis.", subject: "Biology" },
  { q: "Explain the legal and constitutional doctrine of judicial review in the United States.", subject: "Political Science" },
  { q: "What is the difference between mitosis and meiosis in eukaryotic cell division?", subject: "Biology" },
  { q: "Explain the second law of thermodynamics in terms of entropy in closed systems.", subject: "Physics" }
];

test("Academic Suite: 10 Conceptual / Short Answer Reasoning Cases", async () => {
  defaultAIClient.mockHandler = async ({ systemPrompt, userPrompt }) => {
    return JSON.stringify({
      questionRestated: "Restated conceptual inquiry.",
      ownSolution: "First-principles academic explanation based on established theory.",
      explanation: "Comprehensive academic derivation with zero fabricated sources.",
      reasoningSteps: [
        "1. Identify core theoretical foundations.",
        "2. Establish definitions and boundary conditions.",
        "3. Synthesize structured answer."
      ],
      confidence: "HIGH",
      confidenceReason: "Established academic consensus."
    });
  };

  try {
    for (const item of conceptualTestCases) {
      const classification = classifyQuestion(item.q);
      assert.ok(["CONCEPTUAL", "SHORT_ANSWER"].includes(classification.questionType));

      const reasoned = await generateReasonedAnswer({
        question: item.q,
        questionType: classification.questionType,
        subject: item.subject,
        options: []
      });

      assert.ok(reasoned.questionRestated);
      assert.ok(reasoned.ownSolution);
      assert.ok(reasoned.explanation);
      assert.ok(reasoned.reasoningSteps.length >= 2);
      assert.ok(["HIGH", "MEDIUM", "LOW", "UNVERIFIED"].includes(reasoned.confidence));
    }
  } finally {
    defaultAIClient.mockHandler = null;
  }
});
