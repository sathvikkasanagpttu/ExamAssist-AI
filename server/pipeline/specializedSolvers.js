import { safeMathEvaluate } from "./calculator.js";
import { executeInSandbox, executeSqlInSandbox, executeSymbolic } from "./sandboxClient.js";

const MATH_TYPES = new Set(["MATH", "NUMERICAL"]);
export function routeSolver(questionType) {
  const type = String(questionType || "CONCEPTUAL").toUpperCase();
  if (MATH_TYPES.has(type)) return "MATH";
  if (type === "CODING") return "CODING";
  if (type === "DEBUGGING") return "DEBUGGING";
  if (type === "SQL") return "SQL";
  return "CONCEPTUAL";
}

const EXTRACTION_SYSTEM = "Extract executable details from a practice question. Return JSON only, never solve by guessing, preserve supplied code/schema, and do not include explanations.";
const fencedCode = (text) => text.match(/```(?:python|py|javascript|js|c\+\+|cpp|c|java)?\s*([\s\S]*?)```/i)?.[1]?.trim() || "";

function numericAnswer(value) {
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
  return match ? Number(match[0]) : null;
}

function answerText(value) {
  if (value && typeof value === "object") return `${value.option ? `${value.option}. ` : ""}${value.text || ""}`.trim();
  return String(value || "");
}

export async function runSpecializedSolver({ question, questionType, options = [], codeSnippet = "", mathFormula = "", sources = [], llmResult, aiClient }) {
  const family = routeSolver(questionType);
  const toolEvidence = [];
  let directAnswer = llmResult?.directAnswer;
  let confidence = llmResult?.confidence;
  let confidenceReason = llmResult?.confidenceReason;
  let toolFailure = false;

  if (family === "MATH") {
    const extraction = await aiClient.generateJson({
      systemPrompt: `${EXTRACTION_SYSTEM} For math return {"operation":"evaluate|differentiate|integrate|solve|simplify","expression":"...","variable":"x","unit":"...","decimalPlaces":number|null}. Use a mathjs-compatible arithmetic expression when possible.`,
      userPrompt: `Extract the computable expression and stated units/rounding from this question. Question: ${question}\nExplicit formula: ${mathFormula || "none"}`,
      temperature: 0
    });
    const expression = String(extraction?.expression || mathFormula || "").trim();
    let result = null;
    let method = "mathjs";
    if (expression && ["differentiate", "integrate", "solve", "simplify"].includes(extraction.operation)) {
      method = "SymPy";
      result = await executeSymbolic({ expression, operation: extraction.operation, variable: extraction.variable || "x" });
    } else if (expression) {
      const numeric = safeMathEvaluate(expression);
      result = numeric === null ? { executed: false, error: "Expression could not be evaluated" } : { executed: true, success: true, result: numeric };
    } else result = { executed: false, error: "No computable expression was extracted" };
    const executed = Boolean(result?.executed && result.success);
    toolEvidence.push({ tool: method, executed: Boolean(result?.executed), success: executed, expression, output: executed ? String(result.result) : result?.error || "Tool failed" });
    if (!executed) toolFailure = true;
    else {
      const computed = typeof result.result === "number" ? result.result : String(result.result);
      const llmValue = numericAnswer(answerText(llmResult?.directAnswer) || llmResult?.ownSolution);
      const toolValue = numericAnswer(computed);
      const mismatch = typeof computed === "number" && llmValue !== null && Math.abs(llmValue - computed) > Math.max(1e-8, Math.abs(computed) * 1e-8);
      if (mismatch) {
        const unit = String(extraction.unit || "").trim();
        const places = Number.isInteger(extraction.decimalPlaces) ? Math.min(10, Math.max(0, extraction.decimalPlaces)) : null;
        const text = `${places === null ? computed : computed.toFixed(places)}${unit ? ` ${unit}` : ""}`;
        const matchingOption = options.find((option) => {
          const body = typeof option === "string" ? option : option.text || "";
          const value = numericAnswer(body);
          return toolValue !== null && value !== null && Math.abs(value - toolValue) <= Math.max(1e-8, Math.abs(toolValue) * 1e-8);
        });
        directAnswer = matchingOption ? (typeof matchingOption === "string" ? matchingOption : { option: matchingOption.option, text: matchingOption.text }) : { option: "", text };
        confidence = "LOW";
        confidenceReason = "The deterministic math result disagreed with the model answer; the tool result is shown for review.";
      }
    }
  } else if (family === "CODING" || family === "DEBUGGING") {
    const extract = await aiClient.generateJson({
      systemPrompt: `${EXTRACTION_SYSTEM} Return {"language":"python|javascript|c|cpp|java","code":"...","tests":[{"stdin":"...","expectedOutput":"..."}]}. If code is supplied, preserve its behavior and use stated inputs. If the question requests implementation, write a complete minimal implementation with up to 5 small test inputs.`,
      userPrompt: `Question:\n${question}\nProvided code:\n${codeSnippet || fencedCode(question) || "none"}`,
      temperature: 0
    });
    const code = String(codeSnippet || fencedCode(question) || extract?.code || "");
    const rawLanguage = String(extract?.language || "").toLowerCase();
    const language = ({ py: "python", python: "python", js: "javascript", javascript: "javascript", "c++": "cpp", cpp: "cpp", c: "c", java: "java" })[rawLanguage] || rawLanguage;
    const testInputs = Array.isArray(extract?.tests) && extract.tests.length ? extract.tests.slice(0, 5) : [{ stdin: "" }];
    const runs = code ? await Promise.all(testInputs.map((input) => executeInSandbox({ language, code, stdin: String(input?.stdin || ""), timeoutSeconds: 2 }))) : [{ executed: false, error: "No code was available to execute" }];
    const run = runs[0];
    const executed = runs.every((item) => item.executed);
    const expectedMatches = runs.every((item, index) => !testInputs[index]?.expectedOutput || item.stdout?.trim() === String(testInputs[index].expectedOutput).trim());
    const allSucceeded = executed && runs.every((item) => item.success) && expectedMatches;
    toolEvidence.push({ tool: "sandbox", executed, success: allSucceeded, language, output: runs.map((item, index) => `Test ${index + 1}: ${item.executed ? JSON.stringify({ stdout: item.stdout, stderr: item.stderr, exitCode: item.exitCode, timedOut: item.timedOut }) : item.error}`).join("\n"), expectedOutputMatches: expectedMatches });
    if (!allSucceeded) toolFailure = true;
    const explanation = await aiClient.generateJson({
      systemPrompt: "Explain observed program execution accurately. Do not claim execution if it did not happen. Return JSON with explanation and directAnswer.",
      userPrompt: `Question: ${question}\nExecution results: ${executed ? JSON.stringify(runs) : "NOT EXECUTED: " + run.error}`,
      temperature: 0
    });
    if (executed && allSucceeded) {
      llmResult = { ...llmResult, ...explanation, directAnswer: explanation?.directAnswer || llmResult?.directAnswer };
      directAnswer = llmResult.directAnswer;
    } else {
      confidence = "UNVERIFIED";
      confidenceReason = "The Docker sandbox was unavailable; the code was not executed.";
    }
  } else if (family === "SQL") {
    const extracted = await aiClient.generateJson({
      systemPrompt: `${EXTRACTION_SYSTEM} Return {"schema":"CREATE TABLE and INSERT statements only","query":"one SELECT or CTE","expectedRows":[]|null}. Put setup statements only in schema. Never put DDL/DML in query.`,
      userPrompt: `Extract schema, sample rows and candidate query from the SQL question. Preserve explicitly provided SQL and data. Question:\n${question}`,
      temperature: 0
    });
    const candidate = String(extracted?.query || "").trim();
    const run = await executeSqlInSandbox({ schema: String(extracted?.schema || ""), query: candidate });
    const executed = Boolean(run.executed && run.success);
    const expected = Array.isArray(extracted?.expectedRows) ? extracted.expectedRows : null;
    const matchesExpected = !expected || JSON.stringify(run.rows) === JSON.stringify(expected);
    toolEvidence.push({ tool: "sqlite", executed: Boolean(run.executed), success: executed, dialect: "SQLite", output: JSON.stringify(run.rows || run.error || "SQL was not executed"), matchesExpected });
    if (!executed) toolFailure = true;
    if (executed && expected && !matchesExpected) {
      confidence = "LOW";
      confidenceReason = "SQLite output did not match the expected rows provided in the question.";
    }
    if (!executed) {
      confidence = "UNVERIFIED";
      confidenceReason = run.error || "SQL execution did not complete.";
    }
    if (executed) directAnswer = { option: "", text: JSON.stringify(run.rows) };
  }

  if (toolFailure && confidence !== "UNVERIFIED") {
    confidence = "UNVERIFIED";
    confidenceReason = "The requested deterministic tool did not complete; the answer remains unverified.";
  }
  return { family, directAnswer, confidence, confidenceReason, toolEvidence, explanation: llmResult?.explanation };
}

export async function generateMCQCandidates({ question, options, sources, aiClient, toolEvidence = [] }) {
  const prompts = [0.1, 0.45, 0.8];
  const candidates = await Promise.all(prompts.map(async (temperature) => {
    try {
      return await aiClient.generateJson({
        systemPrompt: "Independently answer the MCQ using the supplied evidence and tool output. Return JSON with directAnswer, explanation, confidence. If evidence does not support an answer, say so instead of guessing.",
        userPrompt: `Question: ${question}\nOptions:\n${options.join("\n")}\nRetrieved evidence:\n${sources.map((s) => s.snippet || "").join("\n")}\nTool evidence:\n${toolEvidence.map((t) => t.output).join("\n")}`,
        temperature
      });
    } catch { return null; }
  }));
  const valid = candidates.filter((c) => c?.directAnswer);
  const answers = valid.map((c) => answerText(c.directAnswer).toLowerCase());
  const disagree = new Set(answers).size > 1 || valid.length < 3;
  const evidenceText = `${sources.map((s) => s.snippet || "").join(" ")} ${toolEvidence.map((t) => t.output || "").join(" ")}`.toLowerCase();
  const scored = valid.map((candidate) => {
    const answer = answerText(candidate.directAnswer).toLowerCase();
    const optionText = options.find((item) => String(item).toLowerCase().includes(answer) || answer.includes(String(item).toLowerCase()));
    const support = optionText && evidenceText.includes(String(optionText).toLowerCase()) ? 2 : (evidenceText.includes(answer) ? 1 : 0);
    return { candidate, support };
  }).sort((a, b) => b.support - a.support);
  const best = scored[0];
  const uniqueSupported = best?.support > 0 && scored.filter((item) => item.support === best.support).length === 1;
  return { candidate: uniqueSupported ? best.candidate : null, disagreement: disagree, count: valid.length };
}
