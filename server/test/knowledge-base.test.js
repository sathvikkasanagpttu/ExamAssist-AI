import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chunkSections, parseHeadedText } from "../kb/chunking.js";
import { extractDocumentText } from "../kb/extract.js";
import { buildUserMessage } from "../pipeline/buildUserMessage.js";
import {
  applyRelevanceThreshold,
  deleteDocumentFromPool,
  reciprocalRankFusion
} from "../kb/knowledgeBase.js";

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url));

test("chunking preserves headings and overlaps long passages", () => {
  const chunks = chunkSections([{ text: Array.from({ length: 30 }, (_, i) => `term${i}`).join(" "), page: 2, section: "Stacks" }], { maxWords: 12, overlapWords: 3 });
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].page, 2);
  assert.equal(chunks[0].section, "Stacks");
  assert.deepEqual(chunks[0].text.split(" ").slice(-3), chunks[1].text.split(" ").slice(0, 3));
  const headed = parseHeadedText("# Data Structures\nStack is LIFO.\n## Queues\nQueue is FIFO.");
  assert.deepEqual(headed.map((section) => section.section), ["Data Structures", "Queues"]);
});

test("Markdown and sample PDF fixtures extract readable text and page metadata", async () => {
  const markdown = await extractDocumentText("course-notes.md", await fixture("course-notes.md"));
  assert.ok(markdown.sections.some((section) => section.section === "Data Structures"));
  assert.match(markdown.sections.map((section) => section.text).join(" "), /LIFO/);
  const pdf = await extractDocumentText("course-notes.pdf", await fixture("course-notes.pdf"));
  assert.match(pdf.sections[0].text, /last-in first-out/i);
  assert.equal(pdf.sections[0].page, 1);
});

test("hybrid RRF ranks passages supported by both retrieval lists first", () => {
  const vector = [{ id: 1, text: "stack LIFO" }, { id: 2, text: "unrelated" }];
  const fullText = [{ id: 2, text: "unrelated" }, { id: 1, text: "stack LIFO" }];
  const ranked = reciprocalRankFusion(vector, fullText);
  assert.equal(ranked[0].id, 1);
  assert.ok(ranked[0].ranks.vector && ranked[0].ranks.text);
});

test("minimum relevance threshold removes weak matches", () => {
  const selected = applyRelevanceThreshold([{ id: "weak", score: 0.001 }, { id: "strong", score: 0.03 }], 0.01);
  assert.deepEqual(selected.map((row) => row.id), ["strong"]);
});

test("reasoning labels course notes as evidence and never invents page numbers", () => {
  const prompt = buildUserMessage({
    question: "What does this course note say about stacks?",
    sources: [{ type: "course_notes", file: "week-1.pdf", page: null, snippet: "A stack follows LIFO." }]
  });
  assert.match(prompt, /COURSE NOTES: week-1\.pdf/);
  assert.match(prompt, /Treat course notes as user-provided evidence, not guaranteed truth/);
  assert.doesNotMatch(prompt, /page null/);
});

test("document deletion is user scoped and database cascade removes chunks and vectors", async () => {
  let queryArgs;
  const database = { query: async (...args) => { queryArgs = args; return { rowCount: 1 }; } };
  assert.equal(await deleteDocumentFromPool(database, "profile-id", "document-id"), true);
  assert.deepEqual(queryArgs, ["DELETE FROM kb_documents WHERE user_id=$1 AND id=$2 RETURNING id", ["profile-id", "document-id"]]);
  const migration = await readFile(new URL("../db/migrations/001_course_knowledge_base.sql", import.meta.url), "utf8");
  const vectorMigration = await readFile(new URL("../db/migrations/002_vector_dimensions_and_index.sql", import.meta.url), "utf8");
  assert.match(migration, /REFERENCES kb_documents\(id\) ON DELETE CASCADE/);
  assert.match(migration, /embedding vector\(1536\)/);
  assert.match(vectorMigration, /USING hnsw \(embedding vector_cosine_ops\)/);
});

test("unconfigured database keeps Course Notes disabled without blocking app startup", async () => {
  const { isConfigured, initializeKnowledgeBase, ragEnabled } = await import("../kb/knowledgeBase.js");
  if (!isConfigured()) {
    assert.equal(await initializeKnowledgeBase(), false);
    assert.equal(ragEnabled(), false);
  }
});
