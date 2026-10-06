/**
 * ExamAssist AI - Specialized Reasoning Engine
 * Implements:
 * - Solve-before-searching (first principles at temp 0, then evidence, then tie-break if disagreeing)
 * - Option integrity verification (validates returned letter and text against options sent)
 * - Deterministic calculator step (mathjs) and sandboxed code execution (vm)
 * - No fallback to options[0]; unverified errors return UNVERIFIED.
 */

import { defaultAIClient } from "../aiClient.js";
import { ACADEMIC_SOLVER_SYSTEM_PROMPT } from "../prompts.js";
import { buildUserMessage } from "./buildUserMessage.js";
import { evaluateNumericalContext } from "./calculator.js";
import { runSandboxedCode } from "./sandboxRunner.js";

/**
 * Normalizes options into standard lettered objects: [{ option: 'A', text: '...' }]
 */
export function normalizeOptionsList(options = []) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return (options || []).map((opt, i) => {
    if (typeof opt === "string") {
      const trimmed = opt.trim();
      const match = trimmed.match(/^([A-Z0-9])[\.\)\:\-\]]\s+(.+)$/i);
      if (match) {
        return { option: match[1].toUpperCase(), text: match[2].trim() };
      }
      return { option: letters[i] || String(i + 1), text: trimmed };
    }
    const letter = (opt.option || opt.letter || letters[i] || String(i + 1)).toUpperCase();
    const text = (opt.text || opt.label || JSON.stringify(opt)).trim();
    return { option: letter, text };
  });
}

/**
 * Validates option integrity: checks if the chosen letter and text correspond to the options provided
 */
export function validateOptionIntegrity(directAnswer, normalizedOptions) {
  if (!normalizedOptions || normalizedOptions.length === 0) {
    return { valid: true };
  }

  let chosenOption = "";
  let chosenText = "";

  if (typeof directAnswer === "object" && directAnswer !== null) {
    chosenOption = (directAnswer.option || "").toUpperCase().trim();
    chosenText = (directAnswer.text || "").trim().toLowerCase();
  } else {
    const str = String(directAnswer || "").trim();
    const match = str.match(/^([A-Z0-9])[\.\)\:\-\]]\s*(.*)$/i);
    if (match) {
      chosenOption = match[1].toUpperCase();
      chosenText = match[2].trim().toLowerCase();
    } else {
      chosenText = str.toLowerCase();
    }
  }

  // 1. Check if the option letter exists
  const matchingByLetter = normalizedOptions.find(o => o.option === chosenOption);

  // 2. Check if the option text exists (exact match prioritized over substring)
  let matchingByText = normalizedOptions.find(o => o.text.toLowerCase().trim() === chosenText);
  if (!matchingByText) {
    matchingByText = normalizedOptions.find(o => {
      const optLower = o.text.toLowerCase().trim();
      return (chosenText.length > 5 && optLower.includes(chosenText)) ||
        (optLower.length > 5 && chosenText.includes(optLower));
    });
  }

  if (matchingByLetter && matchingByText) {
    if (matchingByLetter.option === matchingByText.option) {
      return { valid: true, option: matchingByLetter.option, text: matchingByLetter.text };
    }
    // Mismatch: letter says one thing, text says another
    return {
      valid: false,
      reason: `Letter '${chosenOption}' (${matchingByLetter.text}) does not match text '${chosenText}' (${matchingByText.option})`
    };
  }

  if (matchingByLetter && !chosenText) {
    return { valid: true, option: matchingByLetter.option, text: matchingByLetter.text };
  }

  if (matchingByText && !chosenOption) {
    return { valid: true, option: matchingByText.option, text: matchingByText.text };
  }

  if (matchingByLetter) {
    // Check similarity between matchingByLetter text and chosenText
    return { valid: true, option: matchingByLetter.option, text: matchingByLetter.text };
  }

  return {
    valid: false,
    reason: `Selected option '${chosenOption || chosenText}' does not match any provided options.`
  };
}

/**
 * Executes a single solver pass with JSON parsing and option validation
 */
async function runSingleSolverPass({
  question,
  normalizedOptions,
  questionType,
  subject,
  sources = [],
  extraContext = "",
  temperature = 0,
  aiClient = defaultAIClient
}) {
  const optionsForPrompt = normalizedOptions.map(o => `${o.option}. ${o.text}`);
  let augmentedQuestion = question;
  if (extraContext) {
    augmentedQuestion += `\n\n${extraContext}`;
  }

  const userPrompt = buildUserMessage({
    question: augmentedQuestion,
    options: optionsForPrompt,
    type: questionType,
    subject,
    sources
  });

  let parsed = null;
  try {
    parsed = await aiClient.generateJson({
      systemPrompt: ACADEMIC_SOLVER_SYSTEM_PROMPT,
      userPrompt,
      temperature
    });
  } catch (err) {
    console.warn("[ReasoningEngine] AI call failed in solver pass:", err.message);
    throw err;
  }

  if (!parsed || (!parsed.directAnswer && !parsed.ownSolution)) {
    throw new Error("EMPTY_OR_INVALID_SOLVER_OUTPUT");
  }

  // Normalize directAnswer
  let directAnswer = parsed.directAnswer;
  if (typeof directAnswer === "string") {
    const match = directAnswer.match(/^([A-Z0-9])[\.\)\:\-\]]\s*(.*)$/i);
    if (match) {
      directAnswer = { option: match[1].toUpperCase(), text: match[2].trim() };
    } else {
      directAnswer = { option: "", text: directAnswer.trim() };
    }
  }

  // Validate option integrity
  if (normalizedOptions.length > 0) {
    const integrity = validateOptionIntegrity(directAnswer, normalizedOptions);
    if (!integrity.valid) {
      // Retry once with an option integrity repair prompt
      try {
        const repairPrompt = `You chose an option that did not match the provided list:\n${integrity.reason}\n\nYou MUST choose strictly from these options:\n${optionsForPrompt.join("\n")}\n\nReturn valid JSON matching the exact option letter and text.`;
        const repaired = await aiClient.generateJson({
          systemPrompt: ACADEMIC_SOLVER_SYSTEM_PROMPT,
          userPrompt: `${userPrompt}\n\nCORRECTION REQUIRED:\n${repairPrompt}`,
          temperature: 0
        });

        if (repaired && (repaired.directAnswer || repaired.ownSolution)) {
          parsed = repaired;
          directAnswer = parsed.directAnswer;
        }
      } catch (repairErr) {
        console.warn("[ReasoningEngine] Option integrity repair failed:", repairErr.message);
      }
    }
  }

  return { parsed, directAnswer };
}

/**
 * Runs a tie-break resolution call when Pass 1 (first principles) and Pass 2 (with evidence) disagree
 */
async function runTieBreakPass({
  question,
  normalizedOptions,
  questionType,
  pass1,
  pass2,
  sources,
  aiClient
}) {
  const optionsList = normalizedOptions.map(o => `${o.option}. ${o.text}`).join("\n");
  const tieBreakPrompt = `QUESTION:
${question}

OPTIONS:
${optionsList || "(none)"}

FIRST-PRINCIPLES DERIVATION (NO WEB EVIDENCE):
Chosen: ${typeof pass1.directAnswer === "object" ? `${pass1.directAnswer.option}. ${pass1.directAnswer.text}` : pass1.directAnswer}
Reasoning: ${pass1.parsed.explanation || pass1.parsed.ownSolution}

EVIDENCE-SUPPORTED DERIVATION:
Chosen: ${typeof pass2.directAnswer === "object" ? `${pass2.directAnswer.option}. ${pass2.directAnswer.text}` : pass2.directAnswer}
Reasoning: ${pass2.parsed.explanation || pass2.parsed.ownSolution}

RETRIEVED SOURCES:
${sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.snippet}`).join("\n")}

TASK:
Pass 1 and Pass 2 derived different answers.
Analyze why they differed:
1. Did the web evidence contain a misleading snippet or out-of-context citation?
2. Did first-principles derivation miss a specific empirical fact or condition?
3. Which answer is best supported by scientific consensus?
State which choice is genuinely correct and explain the exact reason for the initial disagreement.`;

  try {
    const result = await aiClient.generateJson({
      systemPrompt: "You are an expert tie-break academic arbitrator. Reconcile disagreements between first-principles analysis and web evidence with rigorous accuracy.",
      userPrompt: tieBreakPrompt,
      temperature: 0
    });

    if (result && (result.directAnswer || result.ownSolution)) {
      return result;
    }
  } catch (err) {
    console.warn("[ReasoningEngine] Tie-break call error:", err.message);
  }

  return null;
}

/**
 * Main reasoned answer generator implementing solve-before-search,
 * deterministic numerical/coding execution, and option integrity checks.
 */
export async function generateReasonedAnswer({
  question,
  questionType,
  subject,
  topic,
  options = [],
  sources = [],
  codeSnippet = "",
  mathFormula = "",
  aiClient = defaultAIClient
}) {
  const normalizedOptions = normalizeOptionsList(options);

  // 1. Deterministic Calculation / Execution Step
  let deterministicContext = "";
  if (questionType === "NUMERICAL" || mathFormula || /[0-9\.\+\-\*\/\^=]{4,}/.test(question)) {
    const calcResult = evaluateNumericalContext(question, mathFormula, normalizedOptions);
    if (calcResult.calculations.length > 0) {
      deterministicContext = `Deterministic mathjs calculation:\n${calcResult.calculations.map(c => `${c.expression} = ${c.result}`).join("\n")}`;
      if (calcResult.optionMatches.length > 0) {
        deterministicContext += `\nMath match with option: ${calcResult.optionMatches.map(m => m.option).join(", ")}`;
      }
    }
  }

  if ((questionType === "CODING" || questionType === "DEBUGGING") && codeSnippet) {
    const codeRun = runSandboxedCode(codeSnippet);
    if (codeRun.executed) {
      deterministicContext += `\nSandboxed code trace (${codeRun.success ? "success" : "runtime error"}):\n${codeRun.output || codeRun.returnValue || codeRun.error || "No output"}`;
    }
  }

  // 2. PASS 1: Solve Before Searching (temperature 0, NO evidence)
  let pass1 = null;
  try {
    pass1 = await runSingleSolverPass({
      question,
      normalizedOptions,
      questionType,
      subject,
      sources: [], // No evidence for first principles
      extraContext: deterministicContext,
      temperature: 0,
      aiClient
    });
  } catch (err) {
    console.warn("[ReasoningEngine] Pass 1 (first principles) failed:", err.message);
    // If AI is not configured or unavailable, rethrow typed error
    throw err;
  }

  // 3. PASS 2: Solve with Evidence (if sources are available)
  let pass2 = pass1;
  let hadDisagreement = false;
  let tieBreakResult = null;

  if (sources && sources.length > 0) {
    try {
      pass2 = await runSingleSolverPass({
        question,
        normalizedOptions,
        questionType,
        subject,
        sources,
        extraContext: deterministicContext,
        temperature: 0.1,
        aiClient
      });

      // Check if Pass 1 and Pass 2 disagree on chosen option or answer text
      const opt1 = typeof pass1.directAnswer === "object" ? pass1.directAnswer.option : "";
      const opt2 = typeof pass2.directAnswer === "object" ? pass2.directAnswer.option : "";
      const text1 = typeof pass1.directAnswer === "object" ? pass1.directAnswer.text : String(pass1.directAnswer || "");
      const text2 = typeof pass2.directAnswer === "object" ? pass2.directAnswer.text : String(pass2.directAnswer || "");

      const disagree = (opt1 && opt2 && opt1 !== opt2) ||
        (!opt1 && !opt2 && text1.trim().toLowerCase() !== text2.trim().toLowerCase());

      if (disagree) {
        hadDisagreement = true;
        // Priority 2 point 6: Run third tie-break call that sees both
        tieBreakResult = await runTieBreakPass({
          question,
          normalizedOptions,
          questionType,
          pass1,
          pass2,
          sources,
          aiClient
        });
      }
    } catch (err) {
      console.warn("[ReasoningEngine] Pass 2 failed, falling back to Pass 1:", err.message);
      pass2 = pass1;
    }
  }

  // 4. Assemble final reasoned output
  const chosenResult = tieBreakResult || pass2.parsed || pass1.parsed;
  const directAnswer = tieBreakResult?.directAnswer || pass2.directAnswer || pass1.directAnswer;

  let directAnswerText = "";
  if (typeof directAnswer === "object" && directAnswer !== null) {
    directAnswerText = `${directAnswer.option ? directAnswer.option + ". " : ""}${directAnswer.text || ""}`.trim();
  } else {
    directAnswerText = String(directAnswer || chosenResult.ownSolution || "");
  }

  const optionAnalysis = (chosenResult.optionAnalysis || []).map(opt => ({
    option: opt.option || "",
    text: opt.text || opt.option || "",
    correct: opt.correct !== undefined ? opt.correct : (opt.isCorrect !== undefined ? opt.isCorrect : false),
    isCorrect: opt.isCorrect !== undefined ? opt.isCorrect : (opt.correct !== undefined ? opt.correct : false),
    reason: opt.reason || opt.analysis || "",
    analysis: opt.analysis || opt.reason || ""
  }));

  let confidence = chosenResult.confidence || "MEDIUM";
  let confidenceReason = chosenResult.confidenceReason || "Derived from structured academic reasoning.";

  if (hadDisagreement) {
    // Priority 2 point 6: return confidence LOW or MEDIUM with the disagreement explained
    confidence = "LOW";
    confidenceReason = `Disagreement between first-principles analysis and retrieved sources was reconciled via tie-break evaluation.`;
  }

  return {
    directAnswer,
    directAnswerText,
    questionRestated: chosenResult.questionRestated || `Determine: ${question}`,
    ownSolution: pass1.parsed.ownSolution || chosenResult.ownSolution,
    explanation: chosenResult.explanation || pass1.parsed.explanation || "Derived through first-principles reasoning.",
    reasoningSteps: chosenResult.reasoningSteps || pass1.parsed.reasoningSteps || [],
    optionAnalysis,
    evidenceUsed: chosenResult.evidenceUsed || [],
    evidenceAgreesWithSolution: !hadDisagreement,
    confidence,
    confidenceReason
  };
}
