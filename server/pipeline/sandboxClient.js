/**
 * ExamAssist AI - Sandbox Client & Multi-Dialect SQL Executor (Phase 2)
 * - Routes sandbox code execution through the bounded per-user execution queue (BullMQ + Redis / fallback)
 * - Supports Python, JavaScript, C, C++, Java execution & linting (/execute, /lint)
 * - Supports SQLite (sandbox), PostgreSQL (behind SQL_POSTGRES_ENABLED=true), and MySQL (behind SQL_MYSQL_ENABLED=true)
 * - Extracts SQL schema/seed statements from problem text and compares result sets with ordering & float tolerance rules
 */

import pg from "pg";
import mysql from "mysql2/promise";
import { enqueueSandboxExecution, getSandboxQueueStatus } from "./executionQueue.js";

const sandboxUrl = () => process.env.SANDBOX_URL || "";

export async function sandboxHealth() {
  if (!sandboxUrl()) return false;
  try {
    const response = await fetch(`${sandboxUrl()}/health`, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sandboxDetailedHealth() {
  const defaultLangs = {
    python: false,
    javascript: false,
    c: false,
    cpp: false,
    java: false,
    sql_sqlite: false,
    sql_postgres: process.env.SQL_POSTGRES_ENABLED === "true",
    sql_mysql: process.env.SQL_MYSQL_ENABLED === "true"
  };

  if (!sandboxUrl()) {
    return {
      enabled: false,
      runtime: process.env.SANDBOX_RUNTIME || "runc",
      sandboxEnabledByLanguage: defaultLangs,
      runtimeVersions: {},
      queue: getSandboxQueueStatus()
    };
  }

  try {
    const response = await fetch(`${sandboxUrl()}/health`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) {
      return {
        enabled: false,
        runtime: process.env.SANDBOX_RUNTIME || "runc",
        sandboxEnabledByLanguage: defaultLangs,
        runtimeVersions: {},
        queue: getSandboxQueueStatus()
      };
    }
    const data = await response.json();
    const byLang = data.sandboxEnabledByLanguage || {
      python: true,
      javascript: true,
      c: true,
      cpp: true,
      java: true
    };
    return {
      enabled: true,
      runtime: process.env.SANDBOX_RUNTIME || "runc",
      sandboxEnabledByLanguage: {
        ...defaultLangs,
        ...byLang,
        sql_sqlite: true
      },
      runtimeVersions: data.runtimeVersions || {},
      queue: getSandboxQueueStatus()
    };
  } catch {
    return {
      enabled: false,
      runtime: process.env.SANDBOX_RUNTIME || "runc",
      sandboxEnabledByLanguage: defaultLangs,
      runtimeVersions: {},
      queue: getSandboxQueueStatus()
    };
  }
}

async function rawPostSandbox(path, payload) {
  if (!sandboxUrl()) return { executed: false, error: "Docker sandbox is not configured" };
  try {
    const timeoutMs = Number(process.env.SANDBOX_TIMEOUT_MS || 2000) + 1500;
    const response = await fetch(`${sandboxUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const result = await response.json();
    if (!response.ok) return { executed: false, error: result.error || "Sandbox request failed" };
    return result;
  } catch {
    return { executed: false, error: "Docker sandbox unavailable; code was not executed" };
  }
}

export async function executeInSandbox(payload = {}) {
  const { userId = "anon", maxConcurrentPerUser, queueTimeoutMs, ...rest } = payload;
  return enqueueSandboxExecution({
    path: "/execute",
    payload: rest,
    userId,
    maxConcurrentPerUser,
    queueTimeoutMs,
    executor: rawPostSandbox
  });
}

export async function lintInSandbox(payload = {}) {
  return rawPostSandbox("/lint", payload);
}

export const executeSymbolic = (payload) => rawPostSandbox("/symbolic", payload);

/**
 * Extracts CREATE TABLE / INSERT INTO DDL & seed statements from problem text when not explicitly supplied.
 */
export function extractSqlSchemaAndSeed(questionText = "", providedSchema = "") {
  if (providedSchema && String(providedSchema).trim().length > 0) {
    return String(providedSchema).trim();
  }
  const text = String(questionText || "");
  const statements = [];
  const ddlRegex = /\b(?:CREATE\s+TABLE|INSERT\s+INTO)\b[\s\S]*?;/gi;
  for (const match of text.matchAll(ddlRegex)) {
    statements.push(match[0].trim());
  }
  return statements.join("\n");
}

/**
 * Compares two SQL result sets respecting ordering rules (ORDER BY vs unordered multiset) and float tolerance.
 */
export function compareSqlResultSets(actualRows = [], expectedRows = [], { query = "", floatTolerance = 1e-6 } = {}) {
  if (!Array.isArray(actualRows) || !Array.isArray(expectedRows)) {
    return { matched: false, reason: "Invalid row arrays" };
  }
  if (actualRows.length !== expectedRows.length) {
    return {
      matched: false,
      reason: `Row count mismatch: actual ${actualRows.length} vs expected ${expectedRows.length}`
    };
  }

  const normalizeCell = (v) => {
    if (v === null || v === undefined) return "NULL";
    const num = Number(v);
    if (!Number.isNaN(num) && String(v).trim() !== "") {
      return Number(num.toFixed(6));
    }
    return String(v).trim();
  };

  const normalizeRow = (row) => {
    const arr = Array.isArray(row) ? row : Object.values(row || {});
    return arr.map(normalizeCell);
  };

  const rowsEqual = (r1, r2) => {
    if (r1.length !== r2.length) return false;
    for (let i = 0; i < r1.length; i++) {
      const a = r1[i];
      const b = r2[i];
      if (typeof a === "number" && typeof b === "number") {
        if (Math.abs(a - b) > floatTolerance) return false;
      } else if (String(a) !== String(b)) {
        return false;
      }
    }
    return true;
  };

  const normActual = actualRows.map(normalizeRow);
  const normExpected = expectedRows.map(normalizeRow);
  const hasOrderBy = /\bORDER\s+BY\b/i.test(String(query || ""));

  if (hasOrderBy) {
    for (let i = 0; i < normActual.length; i++) {
      if (!rowsEqual(normActual[i], normExpected[i])) {
        return {
          matched: false,
          ordered: true,
          reason: `Row ${i + 1} mismatch under ORDER BY (${JSON.stringify(normActual[i])} vs ${JSON.stringify(normExpected[i])})`
        };
      }
    }
    return { matched: true, ordered: true, reason: "All rows matched in exact ORDER BY sequence." };
  }

  // Unordered multiset comparison
  const used = new Array(normExpected.length).fill(false);
  for (let i = 0; i < normActual.length; i++) {
    let found = false;
    for (let j = 0; j < normExpected.length; j++) {
      if (!used[j] && rowsEqual(normActual[i], normExpected[j])) {
        used[j] = true;
        found = true;
        break;
      }
    }
    if (!found) {
      return {
        matched: false,
        ordered: false,
        reason: `Row ${JSON.stringify(normActual[i])} not found in expected result set`
      };
    }
  }
  return { matched: true, ordered: false, reason: "All rows matched (unordered multiset)." };
}

async function executePostgresSql({ schema = "", query = "" }) {
  if (process.env.SQL_POSTGRES_ENABLED !== "true") {
    return { executed: false, dialect: "PostgreSQL", error: "PostgreSQL SQL sandbox is disabled (set SQL_POSTGRES_ENABLED=true)" };
  }
  const connUrl = process.env.SQL_POSTGRES_URL || process.env.KB_DATABASE_URL || "";
  if (!connUrl) {
    return { executed: false, dialect: "PostgreSQL", error: "PostgreSQL connection URL not configured" };
  }
  if (!/^\s*(?:select|with)\b/i.test(query) || query.trim().replace(/;+$/, "").includes(";")) {
    return { executed: false, dialect: "PostgreSQL", error: "Only a single SELECT/CTE query is allowed" };
  }

  const client = new pg.Client({ connectionString: connUrl, statement_timeout: 1500 });
  try {
    await client.connect();
    await client.query("BEGIN");
    if (schema.trim()) {
      await client.query(schema);
    }
    const res = await client.query({ text: query, rowMode: "array" });
    const columns = (res.fields || []).map((f) => f.name);
    const rows = (res.rows || []).slice(0, 100);
    await client.query("ROLLBACK");
    return {
      executed: true,
      success: true,
      dialect: "PostgreSQL",
      columns,
      rows
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback error
    }
    return {
      executed: true,
      success: false,
      dialect: "PostgreSQL",
      rows: [],
      error: err.message
    };
  } finally {
    try {
      await client.end();
    } catch {
      // ignore close error
    }
  }
}

async function executeMysqlSql({ schema = "", query = "" }) {
  if (process.env.SQL_MYSQL_ENABLED !== "true") {
    return { executed: false, dialect: "MySQL", error: "MySQL SQL sandbox is disabled (set SQL_MYSQL_ENABLED=true)" };
  }
  const connUrl = process.env.SQL_MYSQL_URL || "";
  if (!connUrl) {
    return { executed: false, dialect: "MySQL", error: "MySQL connection URL not configured" };
  }
  if (!/^\s*(?:select|with)\b/i.test(query) || query.trim().replace(/;+$/, "").includes(";")) {
    return { executed: false, dialect: "MySQL", error: "Only a single SELECT/CTE query is allowed" };
  }

  let connection;
  try {
    connection = await mysql.createConnection({ uri: connUrl, multipleStatements: true, rowsAsArray: true, connectTimeout: 1500 });
    await connection.beginTransaction();
    if (schema.trim()) {
      await connection.query(schema);
    }
    const [rows, fields] = await connection.query({ sql: query, rowsAsArray: true, timeout: 1500 });
    await connection.rollback();
    return {
      executed: true,
      success: true,
      dialect: "MySQL",
      columns: Array.isArray(fields) ? fields.map((f) => f.name) : [],
      rows: Array.isArray(rows) ? rows.slice(0, 100) : []
    };
  } catch (err) {
    return {
      executed: true,
      success: false,
      dialect: "MySQL",
      rows: [],
      error: err.message
    };
  } finally {
    try {
      await connection?.end();
    } catch {
      // ignore
    }
  }
}

export async function executeSqlInSandbox(payload = {}) {
  const dialect = String(payload.dialect || "SQLite").toLowerCase();
  if (dialect.includes("postgres")) {
    const pgResult = await executePostgresSql(payload);
    if (pgResult.executed) return pgResult;
  }
  if (dialect.includes("mysql")) {
    const myResult = await executeMysqlSql(payload);
    if (myResult.executed) return myResult;
  }
  return rawPostSandbox("/sql", payload);
}
