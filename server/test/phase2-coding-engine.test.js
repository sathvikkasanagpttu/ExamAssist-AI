import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAstWithTreeSitter,
  detectCodeLanguage
} from "../pipeline/treeSitterAnalyzer.js";
import {
  enqueueSandboxExecution,
  getSandboxQueueStatus,
  computeCodeHash
} from "../pipeline/executionQueue.js";
import {
  extractSqlSchemaAndSeed,
  compareSqlResultSets
} from "../pipeline/sandboxClient.js";
import {
  classifyExecutionFailure,
  generatePropertyTestInputs,
  generateCodeMutants,
  runMutationTesting,
  rankCandidateSolutions,
  fitLogLogRegression,
  estimateComplexity,
  runUserCodeOnSamples,
  reviewUserCode,
  translateSolutionCode,
  explainCompilerOrRuntimeError,
  inferConceptTags,
  findSimilarPracticeProblems,
  analyzeCodingProblem,
  computeSideBySideDiff
} from "../pipeline/codingEngine.js";

test("Phase 2.1: Tree-sitter WASM AST analyzer parses Python, Java, C, C++, JS, and SQL with line/column syntax errors, loops, recursion, and undefined names", async () => {
  // Python: nested loop + recursion + undefined name
  const pyCode = `def fib_sum(n):
    total = 0
    for i in range(n):
        for j in range(n):
            total += i + j
    return fib_sum(n - 1) + mystery_undeclared_var
`;
  const pyAst = await analyzeAstWithTreeSitter(pyCode, "python");
  assert.equal(pyAst.astEngine, "web-tree-sitter-wasm");
  assert.equal(pyAst.language, "python");
  assert.equal(pyAst.maxLoopDepth, 2);
  assert.equal(pyAst.hasRecursion, true);
  assert.ok(pyAst.functions.some((f) => f.name === "fib_sum" && f.isRecursive));
  assert.ok(pyAst.undefinedNames.some((u) => u.name === "mystery_undeclared_var"));
  assert.equal(pyAst.complexitySource, "static_ast_analysis");

  // Syntax error with line & column in Java
  const badJava = `public class Main {
    public static void main(String[] args) {
        int x = 10
        System.out.println(x);
    }
}`;
  const javaAst = await analyzeAstWithTreeSitter(badJava, "java");
  assert.equal(javaAst.astEngine, "web-tree-sitter-wasm");
  assert.ok(javaAst.syntaxErrors.length >= 1, "Expected Tree-sitter to report Java syntax error");
  assert.ok(javaAst.syntaxErrors[0].line >= 3);
  assert.ok(javaAst.syntaxErrors[0].column >= 1);

  // C and C++ detection and AST loop depth
  const cppCode = `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
    vector<int> a = {3, 1, 2};
    sort(a.begin(), a.end());
    for (int x : a) cout << x << endl;
    return 0;
}`;
  assert.equal(detectCodeLanguage(cppCode), "cpp");
  const cppAst = await analyzeAstWithTreeSitter(cppCode, "cpp");
  assert.equal(cppAst.astEngine, "web-tree-sitter-wasm");
  assert.equal(cppAst.maxLoopDepth, 1);
  assert.equal(cppAst.hasSorting, true);
  assert.equal(cppAst.staticTimeComplexity, "O(n log n)");

  // SQL AST analysis
  const sqlAst = await analyzeAstWithTreeSitter(
    "SELECT dept_id, COUNT(*) FROM employees GROUP BY dept_id ORDER BY COUNT(*) DESC;",
    "sql"
  );
  assert.equal(sqlAst.language, "sql");
  assert.equal(sqlAst.hasSorting, true);
  assert.equal(sqlAst.syntaxErrors.length, 0);
});

test("Phase 2.2: Execution Queue enforces per-user concurrency limits, queue timeouts, and compile-once hash caching", async () => {
  const hash1 = computeCodeHash("cpp", "int main() { return 0; }");
  const hash2 = computeCodeHash("cpp", "int main() { return 0; }");
  assert.equal(hash1, hash2);

  // Test queue timeout when user exceeds concurrency limit with slow jobs
  const slowExecutor = async () => {
    await new Promise((r) => setTimeout(r, 150));
    return { executed: true, success: true, stdout: "ok", stderr: "", exitCode: 0 };
  };

  const [r1, r2] = await Promise.all([
    enqueueSandboxExecution({
      userId: "test-user-limit",
      maxConcurrentPerUser: 1,
      queueTimeoutMs: 40,
      payload: { language: "c", code: "int main(){return 0;}" },
      executor: slowExecutor
    }),
    enqueueSandboxExecution({
      userId: "test-user-limit",
      maxConcurrentPerUser: 1,
      queueTimeoutMs: 40,
      payload: { language: "c", code: "int main(){return 0;}" },
      executor: slowExecutor
    })
  ]);

  assert.equal(r1.executed, true);
  assert.equal(r2.executed, false);
  assert.equal(r2.queueTimedOut, true);
  assert.equal(r2.code, "SANDBOX_QUEUE_TIMEOUT");

  const status = getSandboxQueueStatus();
  assert.ok(status.totalEnqueued >= 2);
  assert.ok(status.compileCacheEntries >= 1);
});

test("Phase 2.3: Property-based test generation and Mutation testing compute testStrength %", async () => {
  const propTests = generatePropertyTestInputs("array of space-separated integers", 3);
  assert.equal(propTests.length, 3);
  assert.equal(propTests[0].source, "property_fastcheck");

  const refCode = `def solve(n):
    if n < 10:
        return n + 1
    return 0`;
  const mutants = generateCodeMutants(refCode, "python");
  assert.ok(mutants.length >= 2);

  const mutReport = await runMutationTesting({
    referenceCode: refCode,
    language: "python",
    tests: [
      { stdin: "9", expectedOutput: "10" },
      { stdin: "10", expectedOutput: "0" }
    ],
    executeFn: async ({ code, stdin }) => {
      // Simulate mutant execution differences
      const n = Number(stdin);
      let out = n < 10 ? n + 1 : 0;
      if (code.includes("<=")) out = n <= 10 ? n + 1 : 0;
      else if (code.includes("- 1")) out = n < 10 ? n - 1 : 0;
      return { executed: true, success: true, stdout: String(out), stderr: "", exitCode: 0 };
    }
  });

  assert.equal(mutReport.executed, true);
  assert.ok(mutReport.totalMutants >= 2);
  assert.equal(mutReport.testStrength, 100);
});

test("Phase 2.4 & 2.5: Failure taxonomy classifies 6 failure types and Solution Ranking ranks by correctness, efficiency, and readability", () => {
  assert.equal(classifyExecutionFailure({ executed: true, timedOut: true }, "5"), "timeout");
  assert.equal(
    classifyExecutionFailure({ executed: true, compileError: true, stderr: "SyntaxError: invalid syntax" }, "5"),
    "compile"
  );
  assert.equal(
    classifyExecutionFailure({ executed: true, exitCode: 137, stderr: "MemoryError" }, "5"),
    "memory"
  );
  assert.equal(
    classifyExecutionFailure({ executed: true, exitCode: 1, stderr: "ZeroDivisionError" }, "5"),
    "runtime_error"
  );
  assert.equal(
    classifyExecutionFailure({ executed: true, exitCode: 0, stdout: "[1, 2, 3]" }, "1 2 3"),
    "format_error"
  );
  assert.equal(
    classifyExecutionFailure({ executed: true, exitCode: 0, stdout: "42" }, "99"),
    "wrong_answer"
  );

  const ranked = rankCandidateSolutions([
    {
      name: "brute_force",
      code: "for i in range(n):\n  for j in range(n):\n    pass",
      language: "python",
      timeComplexity: "O(n^2)",
      sandboxExecuted: true,
      passedTests: 4,
      totalTests: 4,
      avgRuntimeMs: 45
    },
    {
      name: "optimized",
      code: "def solve(nums):\n  seen = set(nums)\n  return len(seen)",
      language: "python",
      timeComplexity: "O(n)",
      sandboxExecuted: true,
      passedTests: 4,
      totalTests: 4,
      avgRuntimeMs: 8
    }
  ]);

  assert.equal(ranked.winner.name, "optimized");
  assert.match(ranked.winnerReason, /Selected 'optimized'/);
});

test("Phase 2.6: Dual Complexity Estimator runs >= 5 input sizes with repeats, subtracts startup overhead, fits log-log regression, and detects disagreement", async () => {
  // Code looks O(n) statically (1 loop), but simulated runtime grows quadratically O(n^2)
  const code = `def work(n):
    for i in range(n):
        pass`;

  const comp = await estimateComplexity({
    code,
    language: "python",
    measureEmpirical: true,
    sizes: [64, 128, 256, 512, 1024],
    repeats: 2,
    executeFn: async ({ stdin }) => {
      const n = Number(stdin);
      const startupMs = 10;
      const runtimeMs = n === 1 ? startupMs : startupMs + (n / 32) ** 2;
      return { executed: true, success: true, stdout: "ok", stderr: "", exitCode: 0, runtimeMs };
    }
  });

  assert.equal(comp.staticEstimate.timeComplexity, "O(n)");
  assert.equal(comp.empiricalEstimate.executed, true);
  assert.equal(comp.empiricalEstimate.measurements.length, 5);
  assert.equal(comp.empiricalEstimate.chartSeries.length, 5);
  assert.equal(comp.empiricalEstimate.timeComplexity, "O(n^2)");
  assert.equal(comp.agrees, false);
  assert.ok(comp.disagreementReason?.includes("Static AST analysis predicted O(n)"));
});

test("Phase 2.7, 2.8 & 2.9: New modes (Run on Samples, Review, Translate, Explain Error, Concept Tags, Similar Problems) & Output Prediction Override", async () => {
  const tags = inferConceptTags("Find the longest substring without repeating characters using a sliding window.", "");
  assert.ok(tags.includes("sliding window"));

  const similar = findSimilarPracticeProblems({
    question: "Given a sorted array, find target index using binary search.",
    conceptTags: ["binary search"],
    language: "python",
    limit: 3
  });
  assert.ok(similar.length >= 1);

  const sampleRes = await runUserCodeOnSamples({
    userCode: "print(int(input()) * 2)",
    language: "python",
    sampleTests: [
      { stdin: "3", expectedOutput: "6" },
      { stdin: "5", expectedOutput: "10" }
    ],
    executeFn: async ({ stdin }) => ({
      executed: true,
      success: true,
      stdout: String(Number(stdin) * 2),
      stderr: "",
      exitCode: 0,
      runtimeMs: 4.2,
      memoryKb: 4096,
      runtimeVersion: "Python 3.11"
    })
  });
  assert.equal(sampleRes.executed, true);
  assert.equal(sampleRes.passedTests, 2);
  assert.match(sampleRes.badge, /Verified by sandbox: 2\/2 tests/);

  // Output prediction override when sandbox execution disagrees with model prediction
  const mockAi = {
    generateJson: async () => ({
      parsedProblem: { inputFormat: "none", outputFormat: "int", constraints: "", edgeCases: [] },
      candidates: [
        {
          name: "optimized",
          code: "print(15)",
          timeComplexity: "O(1)",
          spaceComplexity: "O(1)",
          explanation: "Prints 15"
        }
      ],
      generatedTests: [],
      hints: { level1: "Trace loop accumulator." },
      predictedOutput: "10" // Model wrongly predicted 10, sandbox outputs 15
    })
  };

  const outPred = await analyzeCodingProblem({
    question: "What is the exact output of the following Python snippet?\n```python\nprint(15)\n```",
    questionSubType: "output_prediction",
    language: "python",
    sampleTests: [{ stdin: "", expectedOutput: "" }],
    aiClient: mockAi,
    executeFn: async () => ({
      executed: true,
      success: true,
      stdout: "15\n",
      stderr: "",
      exitCode: 0,
      runtimeMs: 3.1,
      memoryKb: 2048,
      runtimeVersion: "Python 3.11"
    })
  });

  assert.equal(outPred.outputPredictionOverride.executed, true);
  assert.equal(outPred.outputPredictionOverride.executedOutput, "15");
  assert.equal(outPred.outputPredictionOverride.modelPredictedOutput, "10");
  assert.equal(outPred.outputPredictionOverride.mismatch, true);
  assert.equal(outPred.solution.predictedOutput, "15");
  assert.equal(outPred.confidence, "MEDIUM");

  const sbs = computeSideBySideDiff("x = 1\ny = 2", "x = 1\ny = 3");
  assert.equal(sbs.length, 2);
  assert.equal(sbs[0].status, "unchanged");
  assert.equal(sbs[1].status, "modified");
});

test("Phase 2.10: SQL schema/seed extraction and result-set comparison with ordering rules", () => {
  const prompt = `Given the schema:
CREATE TABLE users (id INT, name TEXT, score FLOAT);
INSERT INTO users VALUES (1, 'Alice', 95.5), (2, 'Bob', 88.0);
Write a query to select all users.`;
  const ddl = extractSqlSchemaAndSeed(prompt, "");
  assert.ok(ddl.includes("CREATE TABLE users"));
  assert.ok(ddl.includes("INSERT INTO users"));

  // Unordered query: row order doesn't matter
  const unorderedMatch = compareSqlResultSets(
    [
      [2, "Bob", 88.0000001],
      [1, "Alice", 95.5]
    ],
    [
      [1, "Alice", 95.5],
      [2, "Bob", 88.0]
    ],
    { query: "SELECT id, name, score FROM users" }
  );
  assert.equal(unorderedMatch.matched, true);

  // Ordered query (ORDER BY): row order MUST match
  const orderedMismatch = compareSqlResultSets(
    [
      [2, "Bob", 88.0],
      [1, "Alice", 95.5]
    ],
    [
      [1, "Alice", 95.5],
      [2, "Bob", 88.0]
    ],
    { query: "SELECT id, name, score FROM users ORDER BY id ASC" }
  );
  assert.equal(orderedMismatch.matched, false);
  assert.equal(orderedMismatch.ordered, true);
});
