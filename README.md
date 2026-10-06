# ExamAssist AI — Evidence-First Study Copilot & Assessment Assistant

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Tests](https://img.shields.io/badge/Test%20Suite-29%20Suites%20%7C%2060%2B%20Cases%20Passing-brightgreen.svg)](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/server/test)
[![License](https://img.shields.io/badge/License-MIT-orange.svg)](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/LICENSE)

**ExamAssist AI** is an evidence-first academic study assistant and assessment copilot built on Chrome Manifest V3 and a dedicated Express reasoning backend.

Designed specifically for students working through practice exams, problem sets, textbook reviews, and explicitly authorized AI-assisted assessments, ExamAssist AI combines web retrieval, specialized multi-domain reasoning, claim verification, and transparent confidence calibration without requiring students to leave their page.

---

## 🌟 Key Capabilities

### 1. Extensible Adapter Extraction Pattern
- **Adapter-Driven DOM Parsing**: Uses an adapter architecture (`GenericExtractor`, `MoodleAdapter`, `CanvasAdapter`, `CustomPortalAdapter`, orchestrated by `ExtractionManager`).
- **Rich Context Capture**: Extracts questions, radio/checkbox options, multi-line code blocks, LaTeX/math expressions, and data tables.
- **Multiple User Triggers**: Text selection highlight pill, floating action button, system clipboard copy detection, or keyboard shortcuts (`Ctrl+Shift+E` / `Cmd+Shift+E`).

### 2. Multi-Domain Question Classification
Automatically classifies questions across 10 analytical types:
- `MCQ` (Multiple Choice with distractor elimination)
- `MULTI_SELECT` (Multiple selection validation)
- `TRUE_FALSE` (Factual verification)
- `FILL_BLANK` (Exact context matching)
- `NUMERICAL` (Deterministic formula derivation & unit check)
- `CODING` (Algorithm trace & complexity analysis)
- `DEBUGGING` (Error identification & patch evaluation)
- `SQL` (Relational query clauses, joins, and aggregates)
- `CONCEPTUAL` (Underlying principles & theories)
- `SHORT_ANSWER` (Structured evidence synthesis)

### 3. Multi-Angle Search Orchestration
- Generates 3–5 complementary queries per problem (Exact phrasing, Academic principles, Official documentation, Verification query, Counter-evidence query).
- Integrates with search providers (Tavily, Serper, Brave) and public academic repositories (CrossRef, Wikipedia Academic).
- Normalizes URLs, deduplicates snippets, and ranks sources using domain authority heuristics.

### 4. Specialized Domain Reasoning Engine
- **Math & Science**: Formula identification, step-by-step value substitution, independent calculation verification, and unit checks.
- **Programming & Debugging**: Code trace execution, boundary conditions, edge cases, and time/space complexity analysis.
- **SQL**: Database schema validation, aggregate conditions, and syntax validation.
- **Multiple Choice**: Comprehensive distractor analysis explaining why incorrect options are eliminated.

### 5. Independent Verification Pass & Calibrated Confidence
- Second-pass claim verification classifying statements into `SUPPORTED`, `PARTIALLY_SUPPORTED`, `INFERRED`, `CONTRADICTED`, or `UNSUPPORTED`.
- Detects genuine source conflicts without forcing false consensus.
- Replaces unwarranted 100% certainty claims with transparent confidence ratings: `HIGH`, `MEDIUM`, `LOW`, or `UNVERIFIED` with a one-line rationale.
- Fails gracefully with standard fallback: *"Unable to verify this answer because reliable evidence was not available."*

### 6. Modern Extension Copilot Interface
- **Floating & Draggable**: Draggable header, resizable handle, and responsive layout.
- **Accessible Design**: High contrast, clean typography, dark/light theme toggle, and loading skeletons.
- **Mode Selector**: Always-visible badge for **Practice Mode** and **Authorized Assessment Mode** (with affirmative confirmation modal).
- **Interactive Controls**: "Copy Answer", "Copy Explanation", "Analyze Again", and ephemeral session history.
- **Ethical Integrity**: Zero stealth mode, zero proctoring bypass, zero automated answering or submission, and zero client-side API keys.

---

## 🏗️ Architecture

```
                       STUDENT ACTION
                  (Select / Shortcut / Copy)
                             │
                             ▼
               ┌───────────────────────────┐
               │    Extraction Manager     │ ◄─── Moodle / Canvas / Generic Adapters
               └─────────────┬─────────────┘
                             │
                  POST /api/assessment/analyze
                             │
                             ▼
               ┌───────────────────────────┐
               │  Question Classification  │ ◄─── 10 Types & Subject Analyzer
               └─────────────┬─────────────┘
                             │
                             ▼
               ┌───────────────────────────┐
               │ Multi-Angle Search Engine │ ◄─── 3–5 Queries, Dedup & Authority Rank
               └─────────────┬─────────────┘
                             │
                             ▼
               ┌───────────────────────────┐
               │ Specialized Domain Reason │ ◄─── Math, Coding, SQL, MCQ Distractors
               └─────────────┬─────────────┘
                             │
                             ▼
               ┌───────────────────────────┐
               │ Independent Verification  │ ◄─── Claim Status & Conflict Detection
               └─────────────┬─────────────┘
                             │
                             ▼
               ┌───────────────────────────┐
               │ Calibrated Confidence Eng │ ◄─── HIGH / MEDIUM / LOW / UNVERIFIED
               └─────────────┬─────────────┘
                             │
                             ▼
               ┌───────────────────────────┐
               │ Floating Copilot UI Panel │ ◄─── Citations, Explanations, Modes
               └───────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Prerequisites
- Google Chrome or Chromium-based browser
- Node.js 20+ and npm

### 2. Start the Backend Server

```bash
# Navigate to the server directory
cd server

# Install dependencies
npm install

# Configure environment variables (optional: defaults run with offline academic heuristics)
cp .env.example .env

# Run the test suite (all 29 suites and 60+ test cases)
npm test

# Start the server (default port 8787)
npm start
```

### 3. Load the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** via the toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` directory from this repository.
5. Pin the **ExamAssist AI** extension to your toolbar.

### 4. Test on the Sample Assessment Portal

1. Open [`sample-assessment.html`](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/sample-assessment.html) directly in Chrome.
2. Select any question on the page.
3. Click the floating **ExamAssist** pill or press `Ctrl+Shift+E` (`Cmd+Shift+E` on Mac).
4. Review the generated answer, reasoning steps, distractor breakdown, and verified citations.

---

## 🐳 Docker Deployment

You can run the backend in a containerized environment using Docker:

```bash
# Build and run with Docker Compose
docker compose up --build -d

# Check container logs
docker compose logs -f

# Verify service health
curl http://localhost:8787/api/health
```

---

## 📡 API Reference Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status, uptime, and pipeline capabilities |
| `GET` | `/api/config` | Extension runtime configuration and allowable modes |
| `POST` | `/api/assessment/analyze` | Master orchestrator: full 11-step analysis and response |
| `POST` | `/api/question/classify` | Classifies question type, subject, topic, and search need |
| `POST` | `/api/search` | Multi-angle query generator, deduplication, and ranking |
| `POST` | `/api/evidence/verify` | Claim verification and contradiction detection pass |
| `POST` | `/api/answer/generate` | Domain-specific reasoning and answer drafting |

Full request/response schemas and example payloads are documented in [`docs/API.md`](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/docs/API.md).

---

## 🧪 Comprehensive Test Suite

ExamAssist AI includes a test suite verifying every component of the pipeline:

```bash
cd server
npm test
```

### Test Coverage Highlights:
- **20 MCQ Evaluation Cases**: Biology, Physics, Chemistry, CS, History, Literature, Economics, Psychology, Medicine, Math.
- **10 Numerical / Math Cases**: Calculus, Mechanics, Stoichiometry, Statistics, Circuits, Kinematics.
- **10 Coding & SQL Cases**: Python, JavaScript, Java, C++, SQL window functions, joins, and debugging.
- **10 Conceptual Cases**: Philosophy, Economics, Thermodynamics, Linguistics, Cognitive Science.
- **5 Contradiction Test Cases**: Validates proper detection of genuine scholarly disagreements.
- **5 Insufficient Evidence Cases**: Validates graceful fallback to `UNVERIFIED` without hallucinating facts.
- **Schema & API Validation**: Strict validation of all endpoint inputs and outputs via Zod.

---

## 📚 Documentation Index

- [System Architecture (`docs/ARCHITECTURE.md`)](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/docs/ARCHITECTURE.md)
- [Student & Copilot Workflow Guide (`docs/WORKFLOW.md`)](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/docs/WORKFLOW.md)
- [API Reference & Schemas (`docs/API.md`)](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/docs/API.md)
- [Master Prompts & Reasoning Strategies (`docs/PROMPTS.md`)](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/docs/PROMPTS.md)
- [Security, Privacy & Academic Integrity Policy (`docs/SECURITY.md`)](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/docs/SECURITY.md)

---

## 🔒 Academic Integrity & Ethical Use

ExamAssist AI is committed to honest, transparent learning:
- **No Stealth Features**: Never evades proctoring systems, never uses hidden windows or cloaked overlays.
- **No Automated Submissions**: Never clicks form inputs or submits answers automatically.
- **Honest Confidence**: Explicitly states when evidence is weak or unverified.
- **Privacy By Design**: Masks question texts in system logs and keeps ephemeral session history in memory only.
- **Zero Client Keys**: All API credentials remain protected on the backend server.
