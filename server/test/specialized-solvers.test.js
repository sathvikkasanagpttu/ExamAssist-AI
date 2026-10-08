import { test } from "node:test";
import assert from "node:assert/strict";
import { safeMathEvaluate } from "../pipeline/calculator.js";
import { routeSolver, runSpecializedSolver } from "../pipeline/specializedSolvers.js";
import { executeInSandbox, executeSqlInSandbox, sandboxHealth } from "../pipeline/sandboxClient.js";

test("solver router maps the specialized question families", () => {
  assert.equal(routeSolver("NUMERICAL"), "MATH");
  assert.equal(routeSolver("MATH"), "MATH");
  assert.equal(routeSolver("CODING"), "CODING");
  assert.equal(routeSolver("DEBUGGING"), "DEBUGGING");
  assert.equal(routeSolver("SQL"), "SQL");
  assert.equal(routeSolver("MCQ"), "CONCEPTUAL");
  assert.equal(routeSolver("CONCEPTUAL"), "CONCEPTUAL");
});

test("mathjs deterministically checks ten numeric cases", () => {
  const cases = [
    ["2 + 3", 5], ["9 - 4", 5], ["6 * 7", 42], ["81 / 9", 9], ["2^5", 32],
    ["(4 + 6) / 2", 5], ["0.25 * 80", 20], ["sqrt(144)", 12], ["3 * (8 - 2)", 18], ["10^2 - 1", 99]
  ];
  for (const [expression, expected] of cases) assert.equal(safeMathEvaluate(expression), expected, expression);
});

test("math solver reports mismatch and trusts calculated result", async () => {
  const aiClient = { generateJson: async () => ({ operation: "evaluate", expression: "6 * 7", unit: "", decimalPlaces: null }) };
  const result = await runSpecializedSolver({ question: "Calculate 6 times 7", questionType: "NUMERICAL", aiClient,
    llmResult: { directAnswer: { text: "41" }, confidence: "HIGH" } });
  assert.equal(result.directAnswer.text, "42");
  assert.equal(result.confidence, "LOW");
  assert.equal(result.toolEvidence[0].executed, true);
});

test("Docker sandbox runs ten language, timeout, and isolation cases", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const cases = [
    { language: "javascript", code: "console.log('js-ok')", stdout: "js-ok" },
    { language: "python", code: "print('python-ok')", stdout: "python-ok" },
    { language: "c", code: "#include <stdio.h>\nint main(){puts(\"c-ok\");}", stdout: "c-ok" },
    { language: "cpp", code: "#include <iostream>\nint main(){std::cout << \"cpp-ok\\n\";}", stdout: "cpp-ok" },
    { language: "java", code: "public class Main { public static void main(String[] args) { System.out.println(\"java-ok\"); } }", stdout: "java-ok" },
    { language: "python", code: "while True: pass", timeout: true },
    { language: "python", code: "x = 'x' * (1024**3)", memory: true },
    { language: "python", code: "import urllib.request\ntry: urllib.request.urlopen('http://example.com', timeout=1)\nexcept Exception: print('network-blocked')", stdout: "network-blocked" },
    { language: "python", code: "from pathlib import Path\ntry: Path('/etc/examassist-block-test').write_text('x')\nexcept OSError: print('write-blocked')", stdout: "write-blocked" },
    { language: "python", code: "import sys\nprint(sys.stdin.read().strip())", stdin: "stdin-ok", stdout: "stdin-ok" }
  ];
  for (const item of cases) {
    const result = await executeInSandbox(item);
    assert.equal(result.executed, true, `${item.language}: ${result.error || "not executed"}`);
    if (item.timeout) assert.equal(result.timedOut, true);
    else if (item.memory) assert.notEqual(result.exitCode, 0);
    else { assert.equal(result.success, true, result.stderr); assert.match(result.stdout, new RegExp(item.stdout)); }
  }
});

test("SQLite sandbox executes ten read-only practice queries", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const schema = "CREATE TABLE scores(name TEXT, subject TEXT, score INTEGER); INSERT INTO scores VALUES ('Ari','DBMS',90),('Bea','DBMS',75),('Cai','OS',80);";
  const queries = [
    ["SELECT COUNT(*) FROM scores", [[3]]],
    ["SELECT MAX(score) FROM scores", [[90]]],
    ["SELECT MIN(score) FROM scores", [[75]]],
    ["SELECT AVG(score) FROM scores WHERE subject='DBMS'", [[82.5]]],
    ["SELECT name FROM scores ORDER BY score DESC LIMIT 1", [["Ari"]]],
    ["SELECT subject, COUNT(*) FROM scores GROUP BY subject ORDER BY subject", [["DBMS", 2], ["OS", 1]]],
    ["SELECT name FROM scores WHERE score >= 80 ORDER BY name", [["Ari"], ["Cai"]]],
    ["WITH best AS (SELECT * FROM scores WHERE score > 80) SELECT name FROM best", [["Ari"]]],
    ["SELECT subject, SUM(score) FROM scores GROUP BY subject ORDER BY subject", [["DBMS", 165], ["OS", 80]]],
    ["SELECT name FROM scores WHERE name LIKE 'B%'", [["Bea"]]]
  ];
  for (const [query, rows] of queries) {
    const result = await executeSqlInSandbox({ schema, query });
    assert.equal(result.executed, true, query);
    assert.equal(result.success, true, result.error);
    assert.deepEqual(result.rows, rows, query);
    assert.equal(result.dialect, "SQLite");
  }
});

test("SQLite sandbox refuses destructive statements", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const result = await executeSqlInSandbox({ schema: "CREATE TABLE t(x);", query: "DROP TABLE t" });
  assert.equal(result.executed, false);
});
