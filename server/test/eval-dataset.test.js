import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(path.join(here, "../eval/dataset.jsonl"), "utf8")
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

test("evaluation dataset has 150+ valid, diverse practice questions", () => {
  assert.ok(rows.length >= 150);
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
});

test("every needsReview dataset row is listed in REVIEW.md", () => {
  const review = readFileSync(path.join(here, "../eval/REVIEW.md"), "utf8");
  for (const row of rows.filter((item) => item.needsReview)) assert.match(review, new RegExp(row.id));
});
