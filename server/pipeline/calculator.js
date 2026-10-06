/**
 * ExamAssist AI - Deterministic Mathematical Calculator
 * Uses mathjs to compute and verify numerical questions with absolute precision.
 */

import { evaluate, round } from "mathjs";

/**
 * Safely evaluates a mathematical expression using mathjs
 */
export function safeMathEvaluate(expr) {
  if (!expr || typeof expr !== "string") return null;

  // Clean expression: remove trailing punctuation, currency, unit suffixes if safe
  let clean = expr.trim()
    .replace(/[;=]$/, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\^/g, "^");

  try {
    const result = evaluate(clean);
    if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
      return round(result, 6);
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Extracts and calculates arithmetic from numerical problem stems
 */
export function evaluateNumericalContext(question, formula = "", options = []) {
  const calculations = [];

  // 1. Try explicit formula if provided
  if (formula) {
    const val = safeMathEvaluate(formula);
    if (val !== null) {
      calculations.push({ expression: formula, result: val });
    }
  }

  // 2. Scan question for explicit algebraic/arithmetic assignments (e.g. "E = 0.5 * 4.0 * 15^2")
  const exprMatches = question.match(/(?:[a-zA-Z_]\s*=\s*)?([0-9\.\(\)\+\-\*\/\^\s]{3,})/g) || [];
  for (const m of exprMatches) {
    const trimmed = m.replace(/^[a-zA-Z_]\s*=\s*/, "").trim();
    // Only evaluate if it contains operators
    if (/[\+\-\*\/\^]/.test(trimmed) && /[0-9]/.test(trimmed)) {
      const val = safeMathEvaluate(trimmed);
      if (val !== null && typeof val === "number") {
        calculations.push({ expression: trimmed, result: val });
      }
    }
  }

  // 3. Match calculated results against numerical options
  const optionMatches = [];
  if (Array.isArray(options) && options.length > 0 && calculations.length > 0) {
    for (const opt of options) {
      const optLetter = typeof opt === "object" ? (opt.option || "") : "";
      const optText = typeof opt === "object" ? (opt.text || "") : opt;
      const optStr = typeof opt === "string" ? opt : `${optLetter ? optLetter + ") " : ""}${optText}`;

      // Extract numbers from option
      const numMatches = optStr.match(/-?\d+(?:\.\d+)?/g) || [];
      for (const num of numMatches) {
        const numVal = parseFloat(num);
        for (const calc of calculations) {
          if (Math.abs(calc.result - numVal) < 1e-4) {
            optionMatches.push({
              option: optLetter || optStr,
              optionText: optText,
              matchedCalculation: calc,
              value: numVal
            });
          }
        }
      }
    }
  }

  return {
    calculations,
    optionMatches
  };
}
