import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuestion } from "../pipeline/classifier.js";

// ==========================================
// 20 MULTIPLE-CHOICE QUESTION (MCQ) CASES
// ==========================================

const mcqCases = [
  { q: "Which cellular organelle is responsible for generating ATP?\nA) Ribosome\nB) Mitochondria\nC) Golgi apparatus\nD) Lysosome", type: "MCQ", subject: "Biology" },
  { q: "What is the primary gas contributing to the greenhouse effect?\nA) Nitrogen\nB) Carbon Dioxide\nC) Oxygen\nD) Argon", type: "MCQ", subject: "General Academic" },
  { q: "Who was the first President of the United States?\nA) Thomas Jefferson\nB) George Washington\nC) John Adams\nD) Benjamin Franklin", type: "MCQ", subject: "History" },
  { q: "Which element has the chemical symbol Fe?\nA) Fluorine\nB) Francium\nC) Iron\nD) Fermium", type: "MCQ", subject: "Chemistry" },
  { q: "What is the capital city of Australia?\nA) Sydney\nB) Melbourne\nC) Canberra\nD) Brisbane", type: "MCQ", subject: "General Academic" },
  { q: "In Python, which keyword defines a function?\nA) func\nB) def\nC) function\nD) lambda", type: "MCQ", subject: "Computer Science" },
  { q: "What is the speed of light in vacuum?\nA) 3.0 x 10^8 m/s\nB) 1.5 x 10^8 m/s\nC) 3.0 x 10^6 m/s\nD) 9.8 m/s^2", type: "MCQ", subject: "Physics" },
  { q: "Which law explains planetary motion in ellipses?\nA) Newton's Law\nB) Kepler's First Law\nC) Boyle's Law\nD) Ohm's Law", type: "MCQ", subject: "Physics" },
  { q: "What is the SI unit of electrical resistance?\nA) Volt\nB) Ampere\nC) Ohm\nD) Watt", type: "MCQ", subject: "Physics" },
  { q: "Which macromolecule encodes genetic blueprints?\nA) Polysaccharides\nB) Deoxyribonucleic acid\nC) Triglycerides\nD) Cholesterol", type: "MCQ", subject: "Biology" },
  { q: "Which market structure features a single seller?\nA) Oligopoly\nB) Monopoly\nC) Monopolistic competition\nD) Perfect competition", type: "MCQ", subject: "Economics & Finance" },
  { q: "Which data structure follows LIFO order?\nA) Queue\nB) Stack\nC) Linked List\nD) Heap", type: "MCQ", subject: "Computer Science" },
  { q: "What is the derivative of sin(x)?\nA) -cos(x)\nB) cos(x)\nC) tan(x)\nD) -sin(x)", type: "MCQ", subject: "Mathematics" },
  { q: "Who authored 'The Republic'?\nA) Socrates\nB) Plato\nC) Aristotle\nD) Kant", type: "MCQ", subject: "Philosophy & Ethics" },
  { q: "Which treaty concluded World War I in 1919?\nA) Treaty of Paris\nB) Treaty of Versailles\nC) Treaty of Ghent\nD) Peace of Westphalia", type: "MCQ", subject: "History" },
  { q: "What is the pH of neutral pure water at 25°C?\nA) 5\nB) 7\nC) 9\nD) 14", type: "MCQ", subject: "Chemistry" },
  { q: "Which enzyme unzips DNA during replication?\nA) DNA Ligase\nB) DNA Helicase\nC) Polymerase\nD) Amylase", type: "MCQ", subject: "Biology" },
  { q: "What is the average runtime complexity of QuickSort?\nA) O(n)\nB) O(n log n)\nC) O(n^2)\nD) O(log n)", type: "MCQ", subject: "Computer Science" },
  { q: "Which economic indicator tracks changes in prices of goods?\nA) GDP\nB) CPI\nC) Discount Rate\nD) Gini Coefficient", type: "MCQ", subject: "Economics & Finance" },
  { q: "Which poetic device attributes human traits to inanimate objects?\nA) Simile\nB) Personification\nC) Hyperbole\nD) Onomatopoeia", type: "MCQ", subject: "Literature" }
];

test("Classification Suite: 20 Multiple Choice Questions (MCQ)", () => {
  mcqCases.forEach((item, index) => {
    const res = classifyQuestion(item.q);
    assert.equal(res.questionType, "MCQ", `Case ${index + 1} should be MCQ`);
    assert.ok(res.options.length >= 4, `Case ${index + 1} should have at least 4 options`);
  });
});

// ==========================================
// 10 NUMERICAL / MATHEMATICAL CASES
// ==========================================

const numericalCases = [
  "Calculate the derivative of f(x) = 4x^3 - 5x^2 + 2x at x = 2.",
  "Evaluate the definite integral of 3x^2 dx from x = 1 to x = 4.",
  "Solve for x in the equation 2x + 7 = 19.",
  "Compute the limit as x approaches 0 of sin(x) / x.",
  "Calculate the acceleration of a 1500 kg vehicle subjected to a net force of 4500 N.",
  "Find the molarity of a solution containing 0.5 moles of solute in 2.0 liters of solution.",
  "Compute the magnitude of vector v = (3, 4, 12).",
  "Calculate the compound interest on $1,000 at 5% annual interest compounded yearly for 3 years.",
  "Determine the probability of rolling a sum of 7 with two fair six-sided dice.",
  "Calculate the kinetic energy of a 2 kg object moving at a velocity of 6 m/s."
];

test("Classification Suite: 10 Numerical / Math Questions", () => {
  numericalCases.forEach((q, index) => {
    const res = classifyQuestion(q);
    assert.equal(res.questionType, "NUMERICAL", `Numerical Case ${index + 1} should be NUMERICAL`);
  });
});

// ==========================================
// 10 CODING, DEBUGGING & SQL CASES
// ==========================================

const codeCases = [
  { q: "Write a function in Python to determine if a binary tree is symmetric.", expected: "CODING" },
  { q: "Implement an algorithm in JavaScript to find the longest palindromic substring.", expected: "CODING" },
  { q: "Write a Python script to reverse a linked list iteratively.", expected: "CODING" },
  { q: "Implement a C++ function for binary search on a sorted array.", expected: "CODING" },
  { q: "Write a program in Java to compute the nth Fibonacci number with memoization.", expected: "CODING" },
  { q: "Find the bug in this Python snippet where an IndexError occurs on empty lists.", expected: "DEBUGGING" },
  { q: "Debug this function that produces an infinite recursion loop when n < 0.", expected: "DEBUGGING" },
  { q: "Fix the syntax error and logical flaw in the following sorting method.", expected: "DEBUGGING" },
  { q: "Write a SQL query to SELECT employee_id, salary FROM employees WHERE salary > 80000 ORDER BY salary DESC.", expected: "SQL" },
  { q: "Write a SQL statement to join customers and orders tables on customer_id and GROUP BY country.", expected: "SQL" }
];

test("Classification Suite: 10 Coding, Debugging & SQL Questions", () => {
  codeCases.forEach((item, index) => {
    const res = classifyQuestion(item.q);
    assert.equal(res.questionType, item.expected, `Code Case ${index + 1} should be ${item.expected}`);
  });
});

// ==========================================
// 10 CONCEPTUAL & SHORT ANSWER CASES
// ==========================================

const conceptualCases = [
  "Explain the core principle of Heisenberg's Uncertainty Principle.",
  "What is the philosophical distinction between a priori and a posteriori knowledge?",
  "Explain the mechanism of enzyme inhibition by competitive versus noncompetitive inhibitors.",
  "Describe the economic concept of comparative advantage.",
  "What is the primary function of the judicial branch in the United States constitutional system?",
  "Explain the significance of the Rosetta Stone in modern archaeology.",
  "What causes the oceanic phenomenon known as El Niño?",
  "Describe the difference between mitosis and meiosis in eukaryotic cell division.",
  "Explain how fiscal policy differs from monetary policy in macroeconomic stabilization.",
  "State the primary function of chlorophyll in photosynthesis."
];

test("Classification Suite: 10 Conceptual & Theoretical Questions", () => {
  conceptualCases.forEach((q, index) => {
    const res = classifyQuestion(q);
    assert.ok(["CONCEPTUAL", "SHORT_ANSWER"].includes(res.questionType), `Conceptual Case ${index + 1} should be CONCEPTUAL/SHORT_ANSWER`);
  });
});
