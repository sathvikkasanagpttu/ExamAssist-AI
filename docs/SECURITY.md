# ExamAssist AI — Security, Privacy & Integrity Policy

ExamAssist AI is engineered as an **ethical, evidence-first study copilot** for students working on practice exams, study guides, homework problem sets, and assessments where generative AI assistance has been explicitly permitted by the instructor or institution.

---

## 1. Academic Integrity & Anti-Abuse Commitments

### Absolute Prohibitions (Hard Technical Rules)
ExamAssist AI strictly adheres to the following behavioral and technical constraints:
1. **No Stealth or Proctoring Evasion**:
   - The extension will **never** employ hidden iframes, zero-opacity DOM elements, screen-share cloaking, canvas overlay tricks, or keystroke synthesis designed to hide itself from proctoring systems (e.g., Proctorio, Respondus, Honorlock).
   - The UI panel is always clearly visible, explicitly styled, movable, and collapsible by the student.
2. **No Automated Submission**:
   - The extension will **never** auto-click radio buttons, check boxes, or trigger assessment "Submit" buttons.
   - All student answers must be deliberately chosen and confirmed by the human learner.
3. **Never Claim 100% Accuracy**:
   - The system never claims infallible certainty. Answers are transparently labeled as `HIGH`, `MEDIUM`, `LOW`, or `UNVERIFIED` with clear evidence rationales.
4. **No Fabricated Sources**:
   - Hallucinated URLs, fictitious authors, and fabricated journal articles are strictly forbidden. Citations are only generated from verified upstream search results.

---

## 2. Assessment Modes & Affirmative Consent

ExamAssist AI provides two distinct operating modes:

### Practice Mode (Default)
- For personal study, open textbooks, interactive homework, and self-paced revision.
- Full access to all reasoning, distractor analysis, and source verification.

### Authorized Assessment Mode
- For examinations or quizzes where instructors have explicitly granted permission to use AI study assistants or web research.
- **Mandatory Affirmative Consent**: Upon first switching into Authorized Assessment Mode, the user is presented with a non-dismissible confirmation modal requiring explicit acknowledgment:
  > *"I confirm that my instructor or institution has explicitly authorized the use of AI assistance and web search for this assessment."*
- The active mode remains persistently visible in the floating copilot header badge at all times.

---

## 3. API Key & Credential Protection

- **Zero Client-Side Credentials**:
  No API keys (OpenAI, Tavily, Serper, Brave, Anthropic) are ever packaged into the Chrome Extension source code, `manifest.json`, background service worker, or local storage.
- **Backend-Only Custody**:
  All secrets remain strictly isolated inside the Node.js backend environment variables (`.env`). The extension communicates with the local backend over its REST endpoints; Course Notes additionally use a random local profile ID for data separation, not as a credential.

---

## 4. Privacy & PII Safeguards

- **Privacy-Preserving Structured Logger**:
  The backend logger (`server/logger.js`) strips raw question text, student inputs, and potential PII before emitting operational logs to standard streams. Logs capture only anonymous telemetry:
  ```json
  {"timestamp":"2026-10-06T09:00:00.000Z","level":"INFO","message":"Assessment processed","questionType":"MCQ","confidence":"HIGH","sourcesCount":3,"latencyMs":48}
  ```
- **Local Ephemeral Session History**:
  Question and explanation history displayed in the extension UI is stored purely in local browser memory and is automatically cleared whenever the panel session is closed or reloaded.
- **Course Notes Scope and Deletion**:
  Uploaded files, extracted passages, and embeddings are stored in Postgres under the extension profile ID. They are used only to retrieve evidence for that profile's questions. Options → Course Notes lists storage use and deletes documents; document deletion cascades to chunks and embeddings. See `docs/PRIVACY.md` for provider processing and self-hosting limits.

---

## 5. Network Hardening & Defense-in-Depth

| Security Control | Implementation | Purpose |
| :--- | :--- | :--- |
| **Sliding Window Rate Limiter** | `server/rateLimiter.js` (120 req/min/IP) | Prevents denial-of-service and downstream API quota exhaustion. |
| **Strict Schema Validation** | `zod` runtime schemas (`server/schemas.js`) | Rejects malformed payloads, injection attempts, and excessive lengths. |
| **Strict Payload Caps** | `express.json({ limit: "64kb" })` | Blocks buffer overflow and resource exhaustion attacks. |
| **CORS Filtering** | Origin whitelisting in `server/server.js` | Restricts browser-based cross-origin calls to authorized extension IDs. |
| **Manifest V3 Content Security Policy** | `script-src 'self'` | Eliminates remote script evaluation and code injection in extension pages. |
