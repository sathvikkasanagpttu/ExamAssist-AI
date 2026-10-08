# ExamAssist AI — Backend API Reference

The ExamAssist AI backend exposes a high-performance, strictly-validated REST API powered by Express, Zod validation schemas, multi-provider search orchestration, specialized reasoning, and cross-verification passes.

**Base URL**: `http://localhost:8787` (Default)  
**Content-Type**: `application/json`  
**Rate Limit**: 120 requests/minute per client IP (sliding window)

---

## 1. System & Configuration Endpoints

### `GET /api/health` (also `GET /health`)
Returns service operational health, uptime, and available pipeline capabilities.

#### Response: `200 OK`
```json
{
  "status": "ok",
  "service": "ExamAssist AI Assessment Copilot",
  "version": "2.1.0",
  "uptimeSeconds": 1420,
  "aiConfigured": true,
  "ragEnabled": false,
  "pipelineSteps": [
    "1. Question Extraction & Analysis",
    "2. Subject & Type Classification",
    "3. Search Query Formulation",
    "4. Multi-Source Evidence Retrieval",
    "5. Domain Scoring & Ranking",
    "6. Evidence Snippet Extraction",
    "7. Specialized Domain Reasoning",
    "8. Distractor & Option Analysis",
    "9. Fact & Claim Cross-Verification",
    "10. Confidence Calibration & Error Handling",
    "11. Pedagogical Structured Response"
  ],
  "features": {
    "searchOrchestration": true,
    "verificationPass": true,
    "specializedReasoning": ["NUMERICAL", "CODING", "DEBUGGING", "SQL", "MCQ", "MULTI_SELECT"],
    "cacheEnabled": true
  }
}
```

### Course Notes endpoints

These endpoints require the locally generated profile ID in the `X-Local-User-Id` header. The ID is stored in extension local storage; it is a local profile scope, not public-server authentication. If Postgres/pgvector is not configured, the API returns `503` with `code: "KB_DISABLED"`, while the rest of the backend remains available.

| Method | Endpoint | Body / result |
|---|---|---|
| `POST` | `/api/kb/documents` | Multipart form with `file`; accepts PDF, DOCX, MD, TXT up to `KB_MAX_UPLOAD_BYTES` (10 MiB default). |
| `GET` | `/api/kb/documents` | Returns the profile's document list and `storageUsedBytes`. |
| `DELETE` | `/api/kb/documents/:id` | Deletes the document and cascades to its chunks and embeddings. |
| `POST` | `/api/kb/search` | JSON `{ "question": "..." }`; returns debug-ranked matches with score/rank diagnostics. |

Assessment responses include a source with `type: "course_notes"`, `file`, nullable `page`, and `snippet` only when retrieval passes the relevance threshold. Markdown, text, and DOCX passages have no page number unless the source format provides one; no page number is synthesized.

---

### `GET /api/config`
Retrieves public extension configuration, allowable question types, and mode definitions.

#### Response: `200 OK`
```json
{
  "version": "2.1.0",
  "supportedQuestionTypes": [
    "MCQ", "MULTI_SELECT", "TRUE_FALSE", "FILL_BLANK",
    "NUMERICAL", "CODING", "DEBUGGING", "SQL", "CONCEPTUAL", "SHORT_ANSWER"
  ],
  "defaultMode": "Practice Mode",
  "modes": ["Practice Mode", "Authorized Assessment Mode"],
  "maxQuestionLength": 25000,
  "rateLimitPerMinute": 120
}
```

---

## 2. Core Assessment Endpoints

### `POST /api/assessment/analyze`
**Master End-to-End Orchestrator**. Runs the entire 11-step pipeline from question input to classified, evidenced, and verified output.

#### Request Body:
```json
{
  "question": "Which organelle produces the majority of ATP in eukaryotic cells?",
  "options": ["Ribosome", "Mitochondria", "Endoplasmic Reticulum", "Golgi Apparatus"],
  "mode": "Practice Mode",
  "pageContext": "Introductory Cell Biology Exam #2"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `question` | `string` | **Yes** | Question prompt text (1 to 25,000 characters). |
| `options` | `string[]` | No | List of choice options (if multiple choice / select). |
| `mode` | `string` | No | `"Practice Mode"` or `"Authorized Assessment Mode"`. Default `"Practice Mode"`. |
| `pageContext` | `string` | No | Surrounding contextual snippet or page title. |

#### Response: `200 OK`
```json
{
  "question": "Which organelle produces the majority of ATP in eukaryotic cells?",
  "questionType": "MCQ",
  "subject": "Biology",
  "topic": "Cell Biology",
  "difficulty": "Intermediate",
  "directAnswer": "Mitochondria",
  "confidence": "HIGH",
  "confidenceReason": "Multiple authoritative peer-reviewed and academic sources agree.",
  "explanation": "Mitochondria generate over 90% of cellular ATP via the citric acid cycle and oxidative phosphorylation across the inner mitochondrial membrane.",
  "reasoningSteps": [
    "Step 1: Identified question type as MCQ in Biology / Cellular Respiration.",
    "Step 2: Retrieved peer-reviewed citations on ATP synthesis.",
    "Step 3: Confirmed oxidative phosphorylation occurs at the inner mitochondrial membrane.",
    "Step 4: Evaluated and rejected distractors (Ribosomes synthesize proteins; Golgi modifies macromolecules)."
  ],
  "optionAnalysis": [
    {
      "option": "Ribosome",
      "status": "ELIMINATED",
      "reason": "Ribosomes perform translation/protein synthesis, not ATP generation."
    },
    {
      "option": "Mitochondria",
      "status": "CORRECT",
      "reason": "Direct site of cellular respiration, Krebs cycle, and electron transport chain."
    },
    {
      "option": "Endoplasmic Reticulum",
      "status": "ELIMINATED",
      "reason": "Responsible for protein folding (rough) and lipid synthesis (smooth)."
    },
    {
      "option": "Golgi Apparatus",
      "status": "ELIMINATED",
      "reason": "Modifies, packages, and sorts proteins for secretion."
    }
  ],
  "verification": {
    "status": "SUPPORTED",
    "supported": [
      "Mitochondria produce the majority of ATP through oxidative phosphorylation."
    ],
    "conflicting": [],
    "unsupported": []
  },
  "sources": [
    {
      "title": "Mitochondrial Function and ATP Synthesis - NCBI Bookshelf",
      "url": "https://www.ncbi.nlm.nih.gov/books/NBK26882/",
      "domain": "ncbi.nlm.nih.gov",
      "authority": 95,
      "relevance": 92
    }
  ],
  "retrievalTimestamp": "2026-10-06T09:00:00.000Z"
}
```

---

### `POST /api/question/classify`
Classifies a raw question string into subject, topic, question type, difficulty, and whether web search is required.

#### Request Body:
```json
{
  "question": "Evaluate integral of x * exp(x) dx from 0 to 1.",
  "options": []
}
```

#### Response: `200 OK`
```json
{
  "questionType": "NUMERICAL",
  "subject": "Mathematics",
  "topic": "Calculus",
  "difficulty": "Intermediate",
  "needsSearch": false,
  "options": []
}
```

---

### `POST /api/search`
Executes multi-angle queries across search providers (Tavily, Serper, Brave, CrossRef, Wikipedia), deduplicating URLs and ranking sources by authority and relevance.

#### Request Body:
```json
{
  "queries": [
    "Heisenberg uncertainty principle exact formula",
    "delta x delta p hbar / 2 quantum mechanics derivation",
    "quantum measurement limit uncertainty relation"
  ],
  "maxResults": 5
}
```

#### Response: `200 OK`
```json
{
  "queries": [
    "Heisenberg uncertainty principle exact formula",
    "delta x delta p hbar / 2 quantum mechanics derivation"
  ],
  "count": 2,
  "sources": [
    {
      "title": "The Uncertainty Principle - Stanford Encyclopedia of Philosophy",
      "url": "https://plato.stanford.edu/entries/qt-uncertainty/",
      "domain": "plato.stanford.edu",
      "authority": 90,
      "relevance": 88,
      "snippet": "In quantum mechanics, the uncertainty principle asserts a fundamental limit to the precision with which certain pairs of physical properties can be known..."
    }
  ]
}
```

---

### `POST /api/evidence/verify`
Independent claim verification pass. Compares a proposed answer against provided sources to classify claims into `SUPPORTED`, `CONTRADICTED`, `INFERRED`, or `UNSUPPORTED`.

#### Request Body:
```json
{
  "question": "Does cellular respiration occur in plant cells?",
  "draftAnswer": "Yes, plant cells contain mitochondria and carry out cellular respiration 24 hours a day.",
  "sources": [
    {
      "title": "Plant Respiration - Nature Education",
      "url": "https://www.nature.com/scitable/topicpage/plant-respiration-140",
      "domain": "nature.com",
      "authority": 94,
      "relevance": 91,
      "snippet": "Like animals, plants respire constantly to generate ATP from stored carbohydrates."
    }
  ]
}
```

#### Response: `200 OK`
```json
{
  "status": "SUPPORTED",
  "supported": [
    "Plant cells carry out cellular respiration and have functional mitochondria."
  ],
  "conflicting": [],
  "unsupported": []
}
```

---

### `POST /api/answer/generate`
Generates a reasoned solution using specialized domain reasoning strategies (Math, Coding, Debugging, SQL, MCQ) given ranked sources.

#### Request Body:
```json
{
  "question": "What is the time complexity of merging two sorted arrays of sizes m and n?",
  "questionType": "CODING",
  "subject": "Computer Science",
  "options": ["O(m * n)", "O(m + n)", "O(log(m + n))", "O(1)"],
  "sources": []
}
```

#### Response: `200 OK`
```json
{
  "directAnswer": "O(m + n)",
  "explanation": "Using a two-pointer merge approach, each element from both arrays is examined at most once, resulting in linear O(m + n) time complexity.",
  "reasoningSteps": [
    "Step 1: Initialize pointers i = 0, j = 0 for both arrays.",
    "Step 2: Advance the pointer of the smaller current element.",
    "Step 3: Total pointer increments equal m + n, giving linear time complexity."
  ],
  "optionAnalysis": [
    { "option": "O(m + n)", "status": "CORRECT", "reason": "Linear scan across both input arrays." },
    { "option": "O(m * n)", "status": "ELIMINATED", "reason": "Quadratic time is not required for sorted inputs." }
  ]
}
```

---

## 3. Error Responses

### Tool evidence in assessment responses

Assessment responses include a `toolEvidence` array with the tool, whether it actually executed, and output. Failed requested tools leave the answer `UNVERIFIED`. The panel shows a “Verified by” badge only for entries where `executed` is true. SQL evidence identifies SQLite as the assumed dialect.

`GET /api/health` reports `aiConfigured`, `ragEnabled`, and `sandboxEnabled`. Compose publishes the sandbox test endpoint on local-only port 8791; the API uses the private Compose network.

### `400 Bad Request` (Zod Validation Failure)
```json
{
  "error": "Validation Error",
  "details": [
    "question: Question is required and cannot be empty."
  ]
}
```

### `429 Too Many Requests` (Rate Limit Exceeded)
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please wait a moment before submitting another request.",
  "retryAfterSeconds": 24
}
```

### `500 Internal Server Error` (Graceful Pipeline Fallback)
```json
{
  "error": "Assessment processing error",
  "message": "Unable to verify this answer because reliable evidence was not available."
}
```
