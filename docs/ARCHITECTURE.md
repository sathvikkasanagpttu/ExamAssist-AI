# ExamAssist AI — System Architecture

ExamAssist AI is a production-grade, evidence-first academic study assistant and assessment copilot built on Chrome Manifest V3 and an Express-based reasoning engine.

Unlike simple wrapper extensions that forward raw prompts to an LLM, ExamAssist AI implements an **11-stage evidentiary pipeline** that decomposes academic questions, executes multi-angle search queries across verified sources, evaluates claims independently, eliminates distractors, and calculates calibrated confidence scores.

---

## 1. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Browser ["Chrome Browser (Manifest V3)"]
        Page["Assessment Web Page (Moodle / Canvas / Custom)"]
        EM["Extraction Manager"]
        Adapters["Adapters: Generic | Moodle | Canvas | Custom"]
        UI["Floating Resizable Copilot Panel"]
        CS["Content Script Controller"]
    end

    subgraph Backend ["ExamAssist Node.js Backend"]
        Gate["Express Gateway (CORS, Rate Limiter, Zod)"]
        Classifier["Question Classifier & Subject Analyzer"]
        SearchOrch["Search Orchestrator (Multi-Angle)"]
        Providers["Search Providers: Tavily | Serper | Brave | Academic"]
        ReasoningEng["Specialized Domain Reasoning Engine"]
        Verifier["Claim Verification Pass & Conflict Detector"]
        ConfEng["Calibrated Confidence Engine"]
        Cache["TTL Memory Cache"]
    end

    Page -->|User Selects / Copies| EM
    EM --> Adapters
    Adapters -->|Extracted Question + Options| CS
    CS -->|POST /api/assessment/analyze| Gate
    Gate --> Classifier
    Classifier -->|Needs Search?| SearchOrch
    SearchOrch --> Providers
    Providers -->|Ranked Deduplicated Sources| ReasoningEng
    Classifier -->|Domain Type & Context| ReasoningEng
    ReasoningEng -->|Drafted Solution| Verifier
    Verifier -->|Claim Statuses + Conflicts| ConfEng
    ConfEng -->|Structured Standard JSON| Gate
    Gate -->|JSON Response| CS
    CS -->|Render Visual Card| UI
```

---

## 2. Chrome Extension Extraction Architecture (Adapter Pattern)

The browser client uses an extensible **Adapter Pattern** to reliably extract questions, multiple-choice options, code blocks, tables, and mathematical formulas from varied web assessment platforms:

```
extension/extractors/
├── BaseExtractor.js        # Abstract contract with cleanText(), extractCode(), extractMath()
├── GenericExtractor.js     # Universal DOM extractor: user selection, active element, nearest container
├── MoodleAdapter.js        # Specialized for Moodle LMS (.que.multichoice, .formulation, .qtext)
├── CanvasAdapter.js        # Specialized for Instructure Canvas (.question_holder, .question_text)
├── CustomPortalAdapter.js  # Configurable heuristics for custom institutional quiz portals
└── ExtractionManager.js    # Tries platform-specific adapter first, cascades to generic fallback
```

### Extraction Workflow
1. User activates trigger: text selection, clipboard copy, floating button click, or keyboard shortcut (`Ctrl+Shift+E` / `Cmd+Shift+E`).
2. `ExtractionManager.extract()` inspects the document host and DOM structure:
   - If Canvas classes (`.question_holder`) exist, `CanvasAdapter` executes.
   - If Moodle classes (`.que`) exist, `MoodleAdapter` executes.
   - If Custom portal wrappers exist, `CustomPortalAdapter` executes.
   - Otherwise, `GenericExtractor` extracts selected text or inspects nearby container elements.
3. Extracted data is normalized into `{ question, options, containerElement, confidence }`.

---

## 3. Backend Evidentiary Pipeline

The backend executes an 11-step pipeline designed around academic accuracy and transparency:

```mermaid
sequenceDiagram
    autonumber
    actor User as Student
    participant Ext as Chrome Extension
    participant API as Backend Gateway
    participant Class as Classifier
    participant Search as Search Orchestrator
    participant Reason as Reasoning Engine
    participant Verif as Verifier
    participant Conf as Confidence Engine

    User->>Ext: Selects Question
    Ext->>API: POST /api/assessment/analyze
    API->>Class: classifyQuestion()
    Class-->>API: { type: "MCQ", subject: "Biology", needsSearch: true }
    API->>Search: orchestrateSearch(queries)
    Search-->>API: Deduplicated & Ranked Sources
    API->>Reason: generateReasonedAnswer(type, evidence)
    Reason-->>API: Direct Answer + Stepwise Reasoning + Distractor Analysis
    API->>Verif: runVerificationPass(draft, sources)
    Verif-->>API: Claim Breakdown (Supported, Conflicted, Unsupported)
    API->>Conf: calculateConfidence(evidence, claims, conflicts)
    Conf-->>API: { confidence: "HIGH", reason: "Multiple verified peer sources agree" }
    API-->>Ext: Standard Assessment Response JSON
    Ext-->>User: Renders Draggable Card with Citations
```

---

## 4. Question Classification Taxonomy

Questions are classified across 10 distinct analytical types:

| Question Type | Identifying Features | Reasoning Strategy |
| :--- | :--- | :--- |
| `MCQ` | Single-choice radio options | Best option selection + distractor elimination analysis |
| `MULTI_SELECT` | Checkbox options, "select all that apply" | Individual evaluation of each claim's validity |
| `TRUE_FALSE` | Binary truth statements | Evidence verification for factual correctness |
| `FILL_BLANK` | Blank indicators (`___`), missing keywords | Exact term retrieval and context matching |
| `NUMERICAL` | Formulas, variables, numerical values, units | Deterministic step-by-step substitution and unit check |
| `CODING` | Code blocks, functions, algorithms | Execution trace, time/space complexity, syntax check |
| `DEBUGGING` | Code with runtime error, bug identification | Root-cause analysis, line isolation, and patch verification |
| `SQL` | Database queries, tables, schemas | Clause analysis (`SELECT`, `JOIN`, `GROUP BY`, `HAVING`) |
| `CONCEPTUAL` | Definitions, theories, principles | Foundational explanation grounded in academic sources |
| `SHORT_ANSWER` | Open-ended academic prompts | Concise, structured, evidence-supported synthesis |

---

## 5. Multi-Angle Search & Evidence Ranking

For questions requiring web retrieval, the search orchestrator formulates **3 to 5 distinct queries**:
- **Exact Formulation**: Exact query for specific problem phrasing.
- **Academic / Theoretical**: Query for core underlying principles and formulas.
- **Official Documentation**: Direct queries against official technical documentation.
- **Verification Query**: Confirmatory search testing candidate hypotheses.
- **Counter-Evidence Query**: Targeted search for alternative views or conflicting claims.

Sources are deduplicated and scored using domain authority heuristics:
- **Authority (0–100)**: Higher weights for `.edu`, `.gov`, PubMed, NCBI, IEEE, Nature, Science, Wikipedia.
- **Relevance (0–100)**: Keyword density and title/snippet alignment.
- **Recency**: Timestamps where applicable.

---

## 6. Verification Pass & Confidence Engine

Every claim in the answer draft undergoes independent claim verification:
- `SUPPORTED`: Direct factual basis in top retrieved sources.
- `PARTIALLY_SUPPORTED`: Consistent with evidence but with minor extrapolation.
- `INFERRED`: Logically deduced from stated facts.
- `CONTRADICTED`: Conflicting evidence found between independent sources.
- `UNSUPPORTED`: Zero supporting evidence found.

### Confidence Calibration Levels
- **HIGH**: Multiple authoritative sources agree; no unresolvable contradictions; all core claims supported.
- **MEDIUM**: Evidence generally supportive but indirect or from moderate-authority references.
- **LOW**: Evidence is weak, conflicting, or partial; user is alerted to verify manually.
- **UNVERIFIED**: Insufficient or absent reliable sources. Falls back to:
  > *"Unable to verify this answer because reliable evidence was not available."*

---

## 7. Extension UI Architecture

- **Floating Overlay**: Non-intrusive container injected into the host DOM with Shadow DOM or isolated namespace styling.
- **Draggable & Resizable**: Drag handle on header; resize handle on bottom-right corner.
- **Dark / Light Themes**: Instant toggle with persistent user preference in `chrome.storage.local`.
- **Mode Indicator**: Persistent visual badge displaying **Practice Mode** or **Authorized Assessment Mode**.
- **Ephemeral Session History**: Retains question queries during the active session; automatically cleared on close.
- **Safe Clipboard Actions**: "Copy Answer" and "Copy Explanation" copy formatted markdown text to the user's clipboard.
