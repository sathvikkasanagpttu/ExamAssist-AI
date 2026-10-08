import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(path.join(here, "../eval/dataset.jsonl"), "utf8")
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const redteamRows = readFileSync(path.join(here, "../eval/redteam.jsonl"), "utf8")
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

test("evaluation dataset has 150+ valid, diverse practice questions", () => {
  assert.ok(rows.length >= 230);
  const required = ["id", "subject", "type", "question", "options", "answer", "difficulty", "source", "notes"];
  const ids = new Set();
  for (const row of rows) {
    for (const field of required) assert.ok(field in row, `${row.id || "row"} missing ${field}`);
    assert.ok(!ids.has(row.id), `duplicate id ${row.id}`);
    ids.add(row.id);
    assert.ok(row.question.trim().length > 0);
    assert.ok(Array.isArray(row.options));
  }
  for (const subject of ["Data Structures", "Operating Systems", "DBMS", "Networks", "Python", "SQL", "Aptitude", "Mathematics"]) {
    assert.ok(rows.some((row) => row.subject === subject), `missing subject ${subject}`);
  }
  for (const type of ["MCQ", "MULTI_SELECT", "TRUE_FALSE", "NUMERICAL", "CODING", "SQL"]) {
    assert.ok(rows.some((row) => row.type === type), `missing type ${type}`);
  }
  for (const type of ["MULTI_SELECT", "TRUE_FALSE", "NUMERICAL", "CODING", "SQL"]) {
    assert.ok(rows.filter((row) => row.type === type).length >= 20, `need at least 20 ${type} questions`);
  }
});

test("evaluation dataset has no unresolved review rows", () => {
  assert.equal(rows.filter((item) => item.needsReview).length, 0);
});

test("red team set has 40 adverse cases across each required category", () => {
  assert.ok(redteamRows.length >= 40);
  const categories = ["ambiguous", "missing_info", "false_premise", "contradictory_options", "contradictory_source", "impossible_calculation", "fake_citation_bait", "prompt_injection"];
  for (const category of categories) {
    assert.ok(redteamRows.some((row) => row.category === category), `missing red-team category ${category}`);
  }
  for (const row of redteamRows) {
    assert.equal(row.expectedBehavior, "FLAG_OR_UNVERIFIED");
    assert.ok(row.question.trim().length > 0);
  }
});
