/**
 * ExamAssist AI - Sandboxed Code Execution Runner
 * Safely executes short code snippets in an isolated V8 vm context with timeouts
 * and strict permission boundaries (no process, fs, or network access).
 */

import vm from "node:vm";

export function runSandboxedCode(codeSnippet, { timeoutMs = 1500 } = {}) {
  if (!codeSnippet || typeof codeSnippet !== "string") {
    return { executed: false, reason: "No code snippet provided" };
  }

  // Pre-filter: only attempt execution on JavaScript / ECMAScript snippets
  const cleanCode = codeSnippet.trim()
    .replace(/^```(?:javascript|js)?\s*/i, "")
    .replace(/\s*```$/, "");

  // Don't execute if code references forbidden primitives or process APIs
  if (/(process\.|require\(|import\s|child_process|eval\(|Function\()/i.test(cleanCode)) {
    return { executed: false, reason: "Code references restricted system APIs" };
  }

  const logs = [];
  const sandbox = {
    console: {
      log: (...args) => logs.push(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")),
      warn: (...args) => logs.push(args.map(a => String(a)).join(" ")),
      error: (...args) => logs.push(args.map(a => String(a)).join(" "))
    },
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite
  };

  try {
    const context = vm.createContext(sandbox);
    const script = new vm.Script(cleanCode, {
      displayErrors: true
    });

    const result = script.runInContext(context, {
      timeout: timeoutMs,
      breakOnSigint: true
    });

    return {
      executed: true,
      success: true,
      output: logs.join("\n").trim(),
      returnValue: result
    };
  } catch (err) {
    return {
      executed: true,
      success: false,
      error: err.message,
      output: logs.join("\n").trim()
    };
  }
}
