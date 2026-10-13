# ExamAssist AI — System Architecture (v2.2.0)

ExamAssist AI is a production-grade, evidence-first academic study assistant and coding copilot built on a **TypeScript + Vite + Preact + Tailwind CSS + Shadow DOM** Chrome Manifest V3 extension (`/extension`), a **Node.js / Express ESM** reasoning backend (`/server`), shared **Zod** validation contracts (`/shared`), and an isolated **Docker + Bubblewrap + Seccomp** multi-language sandbox (`/server/sandbox`).

---

## 1. End-to-End Architecture

```mermaid
flowchart TD
    subgraph Extension ["Chrome Extension (MV3 — TypeScript + Preact + Shadow DOM)"]
        Trigger["User Trigger (Selection / Shortcut / Region OCR)"]
        Adapters["Read-Only DOM Adapters (Monaco / CM5-6 / Ace / LMS)"]
        Preview["Local Canvas Crop Preview & Low-OCR Confirmation"]
        Panel["Shadow DOM Panel & Chrome Side Panel"]
    end

    subgraph Backend ["ExamAssist Node/Express ESM Backend (/server)"]
        Gateway["Express Gateway + Zod Validation (/shared)"]
        Quality["Question Quality Gate (questionQuality.js)"]
        AST["WASM Tree-Sitter Analyzer (Python/Java/C/C++/JS/SQL)"]
        CodingEng["Advanced Coding Engine (codingEngine.js)"]
        DocsRAG["Official Docs & Course Notes RAG (pgvector + RRF)"]
        Vision["In-Memory Vision + Tesseract OCR (visionExtractor.js)"]
        Agent["Bounded Tool-Calling Agent (f_agent flag, default OFF)"]
        OTel["OpenTelemetry + Langfuse + Localhost Trace Viewer"]
    end

    subgraph Execution ["Isolated Execution Layer"]
        Queue["BullMQ + Redis Job Queue & Compile-Once Hash Cache"]
        Sandbox["Docker + Bubblewrap + Seccomp Sandbox (Internal Network)"]
        SQLBox["SQLite + Optional PostgreSQL / MySQL Sandboxes"]
    end

    Trigger --> Adapters
    Trigger --> Preview
    Adapters --> Panel
    Preview -->|POST /api/vision/extract| Gateway
    Panel -->|POST /api/assessment/analyze or /api/code/*| Gateway
    Gateway --> Quality
    Gateway --> Vision
    Quality --> CodingEng
    CodingEng --> AST
    CodingEng --> DocsRAG
    CodingEng --> Queue
    Queue --> Sandbox
    CodingEng --> SQLBox
    CodingEng --> OTel
    Agent -.->|Flagged OFF by default| CodingEng
```

---

## 2. Module Breakdown

1. **`/extension` (TypeScript + Vite + Preact + Tailwind CSS)**:
   - `src/extractors/`: Read-only editor (`Monaco`, `CodeMirror 5/6`, `Ace`, `textarea`, `pre/code`) and platform (`Moodle`, `Canvas`, `LeetCode`, `HackerRank`, `GeeksforGeeks`) adapters.
   - `src/trigger/`: User-initiated selection floating button and rectangle region-capture overlay.
   - `src/messaging/`: Zod-validated runtime message bus between content script, service worker, popup, and side panel.
   - `src/ui/`: Preact + Tailwind Shadow DOM copilot card (`#examai-shadow-host`) with lazy 4-level hint ladder, unified code diff viewer, sandbox test table, log-log complexity chart, and vision preview/confirmation workflow.
2. **`/shared` & `/server/schemas.js` (Shared Zod Schemas)**:
   - Strictly validates every API request, response, and extension runtime message (`AnalyzeRequestSchema`, `CodeAnalysisRequestSchema`, `CodeHintRequestSchema`, `VisionExtractRequestSchema`, `ExtensionRuntimeMessageSchema`).
3. **`/server/pipeline/`**:
   - `treeSitterAnalyzer.js`: `web-tree-sitter` WASM AST analysis for Python, Java, C, C++, JavaScript, and SQL (syntax errors with line/column, function/loop/recursion structure, undefined identifiers, static complexity).
   - `executionQueue.js`: BullMQ + Redis execution queue with per-user concurrency limits, queue timeouts, and compile-once SHA-256 binary caching.
   - `codingEngine.js`: Candidate generation, property-based tests (`fast-check` + Python `Hypothesis`), differential testing against `brute_force`, mutation testing (`testStrength` %), 6-category failure taxonomy repair loop (`<= 3` attempts), candidate ranking, and 5-size log-log empirical complexity regression.
   - `visionExtractor.js`: 4MB size cap, MIME + magic-byte validation, in-memory Tesseract OCR + multimodal Vision LLM, `ocrConfidence` calculation, and zero image persistence (`imagePersisted: false`).
   - `observabilityAndSafety.js`: W3C OpenTelemetry stage/tool spans, default code/question redaction, OTLP & Langfuse exporters, and localhost-only trace viewer.
4. **`/server/kb/`**:
   - `officialDocsCorpus.js` & `knowledgeBase.js`: Curated official language reference chunks (Python 3, cppreference C/C++, Java SE, MDN JS) + `pgvector` user course notes with `doc` + `section` citations and strict relevance threshold (`[]` below threshold).
5. **`/server/mcp/server.js`**:
   - Optional Model Context Protocol (MCP) JSON-RPC 2.0 server exposing `run_code`, `run_tests`, and `kb_search` without accuracy claims.
