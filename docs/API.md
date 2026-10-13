# ExamAssist AI — Backend & MCP API Reference (v2.2.0)

**Base URL**: `http://localhost:8787` (Configurable in Extension Popup)  
**Validation**: Every request and response is validated with shared Zod schemas (`/shared` & `server/schemas.js`).

---

## 1. Core Assessment & Streaming Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Returns backend health, AI configuration status, RAG status, and pipeline capabilities. |
| `GET` | `/api/config` | Returns supported question types, modes (`Practice Mode`, `Authorized Assessment Mode`), and rate limits. |
| `POST` | `/api/assessment/analyze` | Master 11-stage academic & coding assessment analyzer. |
| `POST` | `/api/assessment/analyze/stream` | SSE streaming analyzer (`classified` → `searching` → `retrieved` → `solving` → `verifying` → `done`). |

---

## 2. Advanced Coding Engine Endpoints (Phase 2)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/code/analyze` | Full coding pipeline: WASM Tree-Sitter AST, candidate generation, sample + LLM edge + property tests, differential testing, mutation score (`testStrength`), taxonomy repair loop (`<= 3` attempts), ranking, and 5-size log-log empirical complexity. |
| `POST` | `/api/code/hint` | Lazy per-level hint generator (`level: 1..4`). Retries once on invalid model JSON, then returns typed error `AI_INVALID_HINT_RESPONSE` (502). |
| `POST` | `/api/code/run-samples` | Runs user/starter code against visible sample tests in the isolated sandbox without calling the LLM. |
| `POST` | `/api/code/review` | Reviews user code for correctness, complexity, style, and minimal unified diff without rewriting from scratch. |
| `POST` | `/api/code/translate` | Translates code across `python`, `cpp`, `c`, `java`, `javascript`, and `sql` and verifies target code on sample tests. |
| `POST` | `/api/code/explain-error` | Classifies compiler/runtime stderr via failure taxonomy + AST and returns a minimal repair diff. |
| `POST` | `/api/code/ast` | Runs `web-tree-sitter` WASM AST inspection (syntax errors with line/column, loop depth, recursion, undefined names). |

---

## 3. Vision + OCR Endpoint (Phase 3)

### `POST /api/vision/extract`
Extracts structured question text, options, code snippets (with line-number gutter stripping), tables, and math formulas from a user-selected region screenshot.

- **Constraints**: Max 4 MB payload; MIME whitelist (`image/png`, `image/jpeg`, `image/webp`) + binary magic-byte header check.
- **Privacy**: Processed strictly in memory (`imagePersisted: false`).
- **Low-Confidence Gate**: Returns `ocrConfidence` (`0..1`) and `requiresUserConfirmation: true` when `ocrConfidence < 0.75`.

---

## 4. Course Notes & Official Language Docs RAG Endpoints (Phase 4)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/kb/documents` | Uploads PDF, DOCX, MD, or TXT course notes (scoped by `X-Local-User-Id`). |
| `GET` | `/api/kb/documents` | Lists uploaded documents and storage usage. |
| `DELETE` | `/api/kb/documents/:id` | Deletes a document and its chunks. |
| `POST` | `/api/kb/search` | Searches official language docs (`Python`, `cppreference`, `Java SE`, `MDN`) + user notes; returns `[]` below relevance threshold and cites `doc` + `section` on every match. |

---

## 5. Observability & Optional MCP Server (Phases 4 & 5)

- **`GET /api/traces`**: Localhost-only (`127.0.0.1` / `::1`) OpenTelemetry span viewer; returns `403 TRACE_VIEWER_LOCALHOST_ONLY` for non-localhost requests. Code and question text are redacted by default (`OTEL_REDACT_CODE_AND_QUESTIONS=true`).
- **Optional MCP Server (`npm run mcp` / `server/mcp/server.js`)**: JSON-RPC 2.0 stdio/programmatic server exposing `run_code`, `run_tests`, and `kb_search` (`accuracyClaim: null`).
