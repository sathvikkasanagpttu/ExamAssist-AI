# ExamAssist AI — Evidence-First Study Copilot & Assessment Assistant

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Tests](https://img.shields.io/badge/Test%20Suite-50%20Tests%20Passing-brightgreen.svg)](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/server/test)
[![License](https://img.shields.io/badge/License-MIT-orange.svg)](file:///Users/kasanagotttusathvik/Downloads/ExamAI-Study-Assistant/LICENSE)

**ExamAssist AI** is an evidence-first academic study assistant and assessment copilot built on Chrome Manifest V3 and a dedicated Express reasoning backend.

Designed for students working through practice exams, problem sets, textbook reviews, and explicitly authorized AI-assisted assessments, ExamAssist AI combines web retrieval, specialized multi-domain reasoning, claim verification, and transparent confidence calibration without requiring students to leave their page.

---

## 🌟 Core Architecture & Principles

### Priority 1: Zero Fake Answers & Calibrated Confidence
- **No Canned Fallbacks**: Deleted all hardcoded sample question branches and mock fallbacks in production.
- **Typed AI Errors**: If an AI provider is unconfigured or unavailable, the backend throws typed errors: `AI_NOT_CONFIGURED` (503), `AI_UNAVAILABLE` (503), `AI_RATE_LIMITED` (429), `AITimeoutError` (504).
- **JSON Repair Loop**: Retries malformed AI responses with a strict JSON-repair prompt before failing safely as `UNVERIFIED`.
- **Lower Confidence Selection**: Final confidence is computed as the **LOWER** of the model's self-reported confidence and the confidence engine's calculated level. Never defaults to `HIGH`.
- **Transparent Health Status**: `/api/health` reports `aiConfigured: boolean`, `searchProvider: 'tavily' | 'serper' | 'brave' | 'none'`, and `model`.

### Priority 2: Rigorous Academic Reasoning & Problem Solving
- **Solve-Before-Searching**:
  1. *Pass 1*: Solves the question from first principles at temperature 0 with **NO** web evidence.
  2. *Pass 2*: Examines retrieved sources to confirm or refine findings.
  3. *Pass 3 (Tie-Break)*: If Pass 1 and Pass 2 disagree, an arbitrator evaluates why they differed. The answer is returned with confidence capped at `LOW` or `MEDIUM` and the disagreement explained.
- **Option Integrity Verification**: Validates that the chosen letter and text strictly correspond to the options provided. Eliminates mismatched letters and distractor hallucinations.
- **Deterministic Math Engine**: Integrates `mathjs` (`evaluateNumericalContext`) to compute formulas, substitutions, and verify calculations against options.
- **Sandboxed Code Execution**: Executes JavaScript code snippets in an isolated Node `vm` context with a 1500ms timeout, memory boundary, and zero host access (`process`/`fs`/network prohibited).

### Priority 3: Multi-Angle Search & Deduplication
- **Multi-Provider Support**: Supports Tavily (`TAVILY_API_KEY`), Serper (`SERPER_API_KEY`), and Brave Search (`BRAVE_SEARCH_API_KEY` or `BRAVE_API_KEY`).
- **Free Wikipedia Fallback**: If no search API key is configured, uses Wikipedia's OpenSearch API for definitional concepts. If even Wikipedia returns nothing, returns 0 sources (never injects fake citations).
- **Relevance-First Ranking**: Ranks sources by 70% relevance to question keywords and 30% domain authority (`.gov`, `.edu`, peer-reviewed journals).
- **Search Skipping**: Pure mathematics and coding questions skip search and proceed directly to solving.

### Priority 4: User-Controlled Chrome MV3 Extension
- **Always Visible & User-Triggered**: No stealth mode, no proctor evasion, no auto-clicking, and no auto-submitting.
- **Site Allow-List**: User-controlled domain toggle ("Enable on this site" or "Enable on all websites") via extension popup.
- **Default Copy Safety**: Copying text does not automatically trigger API requests (`autoAnswerOnCopy: false` by default).
- **Prominent Disclaimers**: Displays *"⚠️ AI can be wrong, verify before you submit"* on every panel view.
- **MCQ Option Badging & Warning**: Shows detected option count badge and displays a warning banner if fewer than 2 options were captured for an MCQ.
- **Edit Before Sending**: Collapsible drawer allowing students to review or modify question and option text before querying the backend.
- **Graceful Extension Reload Handling**: Detects context invalidation gracefully and guides the user to refresh the page.

### Priority 5: Hygiene, Testing & Security
- **Strict Git Hygiene**: Untracked `.env` files via `.gitignore`. Removed legacy duplicate asset folders and `.zip` archives.
- **Zero Client Keys**: All API credentials reside securely on the backend server.
- **Comprehensive 50-Test Suite**: Covers unit tests, end-to-end pipelines, and offline mock handlers with zero network dependencies in test mode.

---

## 🏗️ Pipeline Flow

```
                      STUDENT ACTION
           (Highlight Pill / Shortcut / Ask)
                         │
                         ▼
           ┌───────────────────────────┐
           │    Extraction Manager     │ ◄─── Generic, Canvas, Moodle Adapters
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
           │ Multi-Angle Search Engine │ ◄─── Tavily / Serper / Brave / Wikipedia
           └─────────────┬─────────────┘
                         │
                         ▼
           ┌───────────────────────────┐
           │ Solve-Before-Search Pass  │ ◄─── Pass 1 (First Principles)
           │ + MathJS & Node VM Trace  │      Pass 2 (With Evidence)
           │                           │      Pass 3 (Tie-Break Disagreement)
           └─────────────┬─────────────┘
                         │
                         ▼
           ┌───────────────────────────┐
           │ Independent Verification  │ ◄─── Claim Status & Conflict Check
           └─────────────┬─────────────┘
                         │
                         ▼
           ┌───────────────────────────┐
           │ Calibrated Confidence Eng │ ◄─── Lower of Model & Engine Level
           └─────────────┬─────────────┘
                         │
                         ▼
           ┌───────────────────────────┐
           │ Chrome Floating Panel UI  │ ◄─── Option Analysis, Reasoning & Citations
           └───────────────────────────┘
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Google Chrome (or any Chromium browser)
- Node.js 20+ and npm

### 2. Configure & Start the Backend

```bash
# Navigate to the backend directory
cd server

# Install dependencies (express, mathjs, openai, zod, cors, dotenv)
npm install

# Create environment configuration
cp .env.example .env
```

Edit `server/.env` to configure your keys:

```env
# Server Port
PORT=8787

# AI Model Provider (Required for production generation)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o

# Web Search Provider (Optional: Tavily, Serper, or Brave)
TAVILY_API_KEY=your_tavily_api_key_here
# SERPER_API_KEY=your_serper_api_key_here
# BRAVE_SEARCH_API_KEY=your_brave_api_key_here
```

Start the server:

```bash
npm start
```

### 3. Verify System Health

Run a health check to confirm server configuration:

```bash
curl http://localhost:8787/api/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "ExamAssist-Backend",
  "aiConfigured": true,
  "searchProvider": "tavily",
  "model": "gpt-4o",
  "port": 8787
}
```

### 4. Load the Chrome Extension

1. Open Google Chrome and go to `chrome://extensions/`.
2. Toggle **Developer mode** in the top right.
3. Click **Load unpacked**.
4. Select the `extension/` folder in this repository.
5. Click the extension icon in your toolbar to configure settings or enable site permissions.

### 5. Test with the Interactive Practice Portal

1. Open `sample-assessment.html` directly in Chrome (`file:///path/to/sample-assessment.html` or via local server).
2. Highlight any question or options on the page.
3. Click the floating **ExamAssist AI** action button or press `Ctrl+Shift+E` (`Cmd+Shift+E` on Mac).
4. Review the generated answer, option analysis, and calibrated confidence level.

---

## 🧪 Comprehensive Test Suite (50 Tests)

Run all integration and unit tests:

```bash
cd server
npm test
```

### Test Coverage Highlights:
- **`academic-questions.test.js`**:
  - **20 MCQs with Shuffled Options**: Tests correct options across positions (A, B, C, D) across Biology, History, CS, Chemistry, Physics, Economics, Math, and Literature.
  - **10 Numerical Problems**: Tests `mathjs` deterministic evaluation (kinetic energy, force, arithmetic, compound interest, Pythagorean theorem, Ohm's law, and option value matching).
  - **10 Coding & Sandbox Cases**: Tests Node `vm` sandboxed execution, infinite loop timeout protection, syntax errors, and process boundary isolation.
  - **10 Conceptual Reasoning Cases**: Tests first-principles derivation, question restatement, and strict schema validation.
- **`extension-extractors.test.js`**:
  - Tests `GenericExtractor`, `MoodleAdapter`, `CanvasAdapter`, and `ExtractionManager` with mock DOM fixtures.
  - Tests `parseQuestionAndOptions` with multiline, inline, and numbered option formatting.
- **`ai-client-mock.test.js`**:
  - Tests `AI_NOT_CONFIGURED` error throwing when no API key is provided.
  - Tests invalid JSON repair retry behavior.
  - Tests option letter/text integrity mismatch rejection.
  - Tests tie-break downgrade to `LOW` confidence on solver disagreement.
  - Tests `UNVERIFIED` assignment when external sources are absent.
- **`classification.test.js`**:
  - Tests 20 MCQs, 10 numericals, 10 coding/SQL, and 10 conceptual classifications.
- **`verification-cases.test.js`**:
  - Tests 5 empirical contradiction cases (verifying `CONFLICTING` / `LOW` confidence).
  - Tests 5 insufficient-evidence cases (verifying `UNVERIFIED` confidence).
- **`api-validation.test.js` & `server.test.js`**:
  - Tests `/api/health`, `/api/config`, `/api/question/classify`, `/api/search`, `/api/evidence/verify`, `/api/answer/generate`, and `/api/assessment/analyze`.

---

## 📡 API Reference Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Returns service health, `aiConfigured`, `searchProvider`, and `model` |
| `GET` | `/api/config` | Returns runtime config, supported question types, and modes |
| `POST` | `/api/assessment/analyze` | Master pipeline: classification, search, solve-before-search, verification |
| `POST` | `/api/question/classify` | Classifies question into 10 types and identifies academic subject |
| `POST` | `/api/search` | Multi-angle query generator, deduplication, and 70/30 relevance ranking |
| `POST` | `/api/evidence/verify` | Claim verification and contradiction detection pass |
| `POST` | `/api/answer/generate` | Domain reasoning with solve-before-search and mathjs/sandbox trace |

## Evaluation harness

The labeled practice set lives at `server/eval/dataset.jsonl`. Run one ablation configuration or a smaller slice with:

```bash
cd server
npm run eval -- --config c_solve_tiebreak --limit 25
npm run eval:smoke
```

Configs `a_single_pass` through `e_specialized` are in `server/eval/configs/`. Each run writes a JSON result and Markdown report under `server/eval/results/`; per-question cache entries are under `server/eval/cache/`. The report breaks accuracy down by subject, question type, and difficulty, shows calibration by confidence, UNVERIFIED rate, latency percentiles, token usage, and cost when a rate is configured. `EVAL_MAX_CALLS` caps provider calls (default 200), and `EVAL_CONCURRENCY` controls live parallelism. Set `EVAL_COST_PER_1K_TOKENS_USD` to record an estimated cost using your own provider rate; without a rate, cost is reported as unavailable. Provider-reported token totals are preferred; fallback token counts are explicitly estimates. Smoke mode uses a mock AI and is only a CI plumbing check; its accuracy is not representative. Check `server/eval/REVIEW.md` and resolve `needsReview` rows before treating full-set accuracy as final.

---

## 🔒 Academic Integrity & Safety

ExamAssist AI is designed exclusively for learning, revision, homework assistance, and authorized assessments:
- **No Stealth / Proctor Evasion**: Does not conceal UI, bypass screen recording, or suppress browser events.
- **No Automated Clicking**: Never selects answers or submits assessments automatically.
- **No Hallucinated Citations**: Never invents URLs, studies, authors, or statistics.
- **Transparent Confidence**: Never claims 100% accuracy; clearly flags weak, conflicting, or unverified claims.
- **Secure Backend**: Extension code contains no API keys or secrets.
