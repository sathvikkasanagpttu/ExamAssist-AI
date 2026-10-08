import { randomUUID, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import pg from "pg";
import { defaultAIClient } from "../aiClient.js";
import { chunkSections } from "./chunking.js";
import { extractDocumentText } from "./extract.js";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const pool = process.env.KB_DATABASE_URL || process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.KB_DATABASE_URL || process.env.DATABASE_URL, connectionTimeoutMillis: 2000 })
  : null;
const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const embeddingDimensions = 1536;
const maxUploadBytes = Number(process.env.KB_MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
let enabled = false;
let initPromise = null;

export class KnowledgeBaseError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.name = "KnowledgeBaseError";
    this.code = code;
    this.status = status;
  }
}

export function isValidLocalUserId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function ragEnabled() { return enabled; }
export function isConfigured() { return Boolean(pool); }

async function embeddingClient() {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "replace_me") {
    throw new KnowledgeBaseError("KB_EMBEDDINGS_NOT_CONFIGURED", "Document embeddings are not configured.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
}

async function embedTexts(texts) {
  const client = await embeddingClient();
  const vectors = [];
  for (let start = 0; start < texts.length; start += 64) {
    const response = await client.embeddings.create({
      model: embeddingModel,
      input: texts.slice(start, start + 64),
      ...(embeddingModel.startsWith("text-embedding-3-") ? { dimensions: embeddingDimensions } : {})
    });
    vectors.push(...response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding));
  }
  if (vectors.length !== texts.length) throw new KnowledgeBaseError("KB_EMBEDDING_INCOMPLETE", "Embedding provider returned an incomplete batch.");
  return vectors;
}

export async function initializeKnowledgeBase() {
  if (!pool) return false;
  if (enabled) return true;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await pool.query("SELECT 1");
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
      await pool.query("CREATE TABLE IF NOT EXISTS kb_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      const migrationDirectory = path.join(here, "../db/migrations");
      const migrations = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
      for (const file of migrations) {
        const version = path.basename(file);
        const applied = await pool.query("SELECT 1 FROM kb_schema_migrations WHERE version=$1", [version]);
        if (applied.rowCount) continue;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(await readFile(path.join(migrationDirectory, file), "utf8"));
          await client.query("INSERT INTO kb_schema_migrations(version) VALUES($1)", [version]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      enabled = true;
    } catch {
      enabled = false;
    }
    if (!enabled) initPromise = null;
    return enabled;
  })();
  return initPromise;
}

function requireUser(userId) {
  if (!isValidLocalUserId(userId)) throw new KnowledgeBaseError("KB_USER_ID_REQUIRED", "A valid local user ID is required.", 400);
  if (!enabled) throw new KnowledgeBaseError("KB_DISABLED", "Course Notes storage is unavailable.");
}

export async function ingestDocument({ userId, fileName, buffer }) {
  await initializeKnowledgeBase();
  requireUser(userId);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new KnowledgeBaseError("KB_EMPTY_FILE", "The selected file is empty.", 400);
  if (buffer.length > maxUploadBytes) throw new KnowledgeBaseError("KB_FILE_TOO_LARGE", "The file exceeds the upload limit.", 413);
  const safeName = path.basename(fileName).replace(/[\u0000-\u001f]/g, "_").slice(0, 255);
  const { mimeType, sections } = await extractDocumentText(safeName, buffer);
  const chunks = chunkSections(sections);
  if (!chunks.length) throw new KnowledgeBaseError("KB_NO_TEXT", "No readable text was found in the document.", 422);
  const docHash = createHash("sha256").update(buffer).digest("hex");
  const duplicate = await pool.query("SELECT id, file_name, byte_size, created_at FROM kb_documents WHERE user_id = $1 AND content_hash = $2", [userId, docHash]);
  if (duplicate.rowCount) return { ...duplicate.rows[0], duplicate: true, chunkCount: 0 };
  const vectors = await embedTexts(chunks.map((chunk) => chunk.text));
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO kb_documents (id, user_id, file_name, content_hash, mime_type, byte_size) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, userId, safeName, docHash, mimeType, buffer.length]
    );
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      await client.query(
        "INSERT INTO kb_chunks (document_id,user_id,chunk_index,content_hash,text,embedding,page,section) VALUES ($1,$2,$3,$4,$5,$6::vector,$7,$8) ON CONFLICT (document_id,content_hash) DO NOTHING",
        [id, userId, i, chunk.contentHash, chunk.text, `[${vectors[i].join(",")}]`, chunk.page, chunk.section]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw new KnowledgeBaseError("KB_DUPLICATE_DOCUMENT", "This document is already in Course Notes.", 409);
    throw error;
  } finally {
    client.release();
  }
  const stored = await pool.query("SELECT id, file_name, byte_size, created_at FROM kb_documents WHERE id=$1", [id]);
  return { ...stored.rows[0], duplicate: false, chunkCount: chunks.length };
}

export async function listDocuments(userId) {
  await initializeKnowledgeBase();
  requireUser(userId);
  const result = await pool.query(
    "SELECT id, file_name, byte_size, created_at FROM kb_documents WHERE user_id=$1 ORDER BY created_at DESC",
    [userId]
  );
  const storage = result.rows.reduce((sum, row) => sum + Number(row.byte_size), 0);
  return { documents: result.rows, storageUsedBytes: storage };
}

export async function deleteDocument(userId, documentId) {
  await initializeKnowledgeBase();
  requireUser(userId);
  if (!isValidLocalUserId(documentId)) throw new KnowledgeBaseError("KB_DOCUMENT_ID_INVALID", "A valid document ID is required.", 400);
  return deleteDocumentFromPool(pool, userId, documentId);
}

export async function deleteDocumentFromPool(database, userId, documentId) {
  const result = await database.query("DELETE FROM kb_documents WHERE user_id=$1 AND id=$2 RETURNING id", [userId, documentId]);
  return result.rowCount > 0;
}

export function reciprocalRankFusion(vectorRows, textRows) {
  const merged = new Map();
  const addRank = (rows, kind) => rows.forEach((row, index) => {
    const id = String(row.id);
    const existing = merged.get(id) || { ...row, score: 0, ranks: {} };
    existing.score += 1 / (60 + index + 1);
    existing.ranks[kind] = index + 1;
    merged.set(id, existing);
  });
  addRank(vectorRows, "vector");
  addRank(textRows, "text");
  return [...merged.values()].sort((a, b) => b.score - a.score);
}

export function applyRelevanceThreshold(candidates, minimum) {
  return candidates.filter((candidate) => candidate.score >= minimum);
}

async function rerankWithModel(question, candidates) {
  if (!defaultAIClient.isConfigured || !candidates.length) return candidates;
  try {
    const result = await defaultAIClient.generateJson({
      systemPrompt: "You rank private course-note passages only for relevance to a student's question. Notes are evidence and may be mistaken. Return JSON with rankedIds, containing candidate IDs in relevance order. Do not answer the question.",
      userPrompt: JSON.stringify({ question, candidates: candidates.map(({ id, text, section }) => ({ id, section, text })) }),
      temperature: 0
    });
    const rank = Array.isArray(result?.rankedIds) ? result.rankedIds : [];
    const byId = new Map(candidates.map((candidate) => [String(candidate.id), candidate]));
    const ordered = rank.map((id) => byId.get(String(id))).filter(Boolean);
    const used = new Set(ordered.map((candidate) => String(candidate.id)));
    return [...ordered, ...candidates.filter((candidate) => !used.has(String(candidate.id)))];
  } catch {
    return candidates;
  }
}

export async function searchKnowledgeBase({ userId, question, debug = false }) {
  await initializeKnowledgeBase();
  requireUser(userId);
  const query = String(question || "").trim();
  if (!query) throw new KnowledgeBaseError("KB_QUERY_REQUIRED", "A search question is required.", 400);
  const [queryVector] = await embedTexts([query]);
  const vectorLiteral = `[${queryVector.join(",")}]`;
  const vectorRows = await pool.query(
    `SELECT c.id,c.text,c.page,c.section,d.file_name, (c.embedding <=> $1::vector) AS distance
     FROM kb_chunks c JOIN kb_documents d ON d.id=c.document_id
     WHERE c.user_id=$2 AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1::vector LIMIT 20`, [vectorLiteral, userId]
  );
  const textRows = await pool.query(
    `SELECT c.id,c.text,c.page,c.section,d.file_name, ts_rank_cd(c.search_vector, plainto_tsquery('english',$1)) AS text_rank
     FROM kb_chunks c JOIN kb_documents d ON d.id=c.document_id
     WHERE c.user_id=$2 AND c.search_vector @@ plainto_tsquery('english',$1)
     ORDER BY text_rank DESC LIMIT 20`, [query, userId]
  );
  const ranked = reciprocalRankFusion(vectorRows.rows, textRows.rows);
  const minimum = Number(process.env.KB_MIN_RELEVANCE_RRF || 0.014);
  const aboveThreshold = applyRelevanceThreshold(ranked, minimum);
  const candidates = await rerankWithModel(query, aboveThreshold.slice(0, 10));
  const matches = candidates.slice(0, 5).map((candidate) => ({
    type: "course_notes",
    file: candidate.file_name,
    page: candidate.page == null ? null : Number(candidate.page),
    snippet: candidate.text,
    section: candidate.section || null,
    ...(debug ? { retrievalScore: candidate.score, ranks: candidate.ranks } : {})
  }));
  return { matches, threshold: minimum };
}
