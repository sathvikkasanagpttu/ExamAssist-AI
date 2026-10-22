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

### Native tool-calling limits

The optional native agent receives only visible question data. Its web, private-note, calculator, code, and SQL calls use strict Zod argument schemas and are treated as untrusted at the model boundary. The loop permits at most six calls with individual and total time limits, a total token limit, and a configured USD budget. A missing provider-cost configuration, tool error, or budget breach uses the existing static pipeline rather than fabricating a tool result. Code execution remains isolated with network disabled, and SQL remains limited to read-only queries.

### Restricted solver execution

The assessment API never executes submitted code on its own host. Compose provides a dedicated, heavily hardened sandbox container (`examassist-sandbox`) designed for zero-trust untrusted code execution:
- **Zero Root Access**: The container drops root entirely and runs as an unprivileged user (`user: "10001:10001"` / `sandbox`), eliminating root privilege escalation risks.
- **Zero Linux Capabilities**: All capabilities are dropped (`cap_drop: [ALL]`). Specifically, `CAP_SYS_ADMIN`, `CAP_NET_ADMIN`, `CAP_SETPCAP`, and `CAP_CHOWN` are omitted entirely.
- **Default-Deny Seccomp Profile**: Uses Docker's default seccomp profile as the base with default-deny action (`"defaultAction": "SCMP_ACT_ERRNO"` with `defaultErrnoRet: 1`). Syscalls not explicitly allowlisted for basic execution (e.g. read, write, execve, exit, mmap, clone) return `EPERM`. Dangerous syscalls including `mount`, `umount`, `unshare`, `ptrace`, `bpf`, `kexec_load`, `reboot`, `pivot_root`, and `chroot` are explicitly denied.
- **Read-Only Root Filesystem**: `read_only: true` is enforced across the container. Scratch execution occurs strictly in an isolated in-memory tmpfs mount (`/tmp:rw,nosuid,size=64m`).
- **Resource & Process Ceilings**: Container enforces `pids_limit: 96`, `mem_limit: 768m`, and `cpus: 1.0`. Per-process execution sets POSIX rlimits (`RLIMIT_NPROC: 24`, `RLIMIT_AS: 256MB`, `RLIMIT_CPU: 2s`), mitigating fork bombs, memory exhaustion, and infinite loops.
- **Network Isolation**: Operates on an internal Docker network with no outbound internet access (`internal: true`).
- **SQL In-Memory Isolation**: SQL runs against a fresh in-memory SQLite database and accepts only a single read-only SELECT/CTE query with SQLite authorizers enabled.
- **Safe Fallback**: If the sandbox is missing or a tool execution fails, the response gracefully returns `UNVERIFIED` without hallucinating code output.

| Security Control | Implementation | Purpose | Proving Test / Artifact |
| :--- | :--- | :--- | :--- |
| **Non-Root & Zero-Cap Sandbox** | `user: "10001:10001"`, `cap_drop: [ALL]` in `docker-compose.yml` | Eliminates root privileges and removes `CAP_SYS_ADMIN` and `CAP_NET_ADMIN`. | [`server/test/seccomp.test.js`](../server/test/seccomp.test.js) |
| **Default-Deny Seccomp Profile** | `server/sandbox/seccomp-profile.json` (`SCMP_ACT_ERRNO`) | Blocks `mount`, `unshare`, `ptrace`, `bpf`, `kexec_load`, `reboot`. | [`server/test/seccomp.test.js`](../server/test/seccomp.test.js) |
| **Read-Only Filesystem & Tmpfs** | `read_only: true`, `/tmp:rw,nosuid,size=64m` | Prevents file modification outside `/tmp` (tested with attempted write to `/etc/`). | [`server/test/seccomp.test.js`](../server/test/seccomp.test.js) |
| **Process & Memory Bomb Defense** | `pids_limit`, `mem_limit`, `RLIMIT_NPROC`, `RLIMIT_AS` | Prevents fork bombs and OOM denial-of-service attacks. | [`server/test/seccomp.test.js`](../server/test/seccomp.test.js) |
| **Network Egress Isolation** | `networks.backend.internal: true` in Compose | Blocks outbound internet access from executing code. | [`server/test/seccomp.test.js`](../server/test/seccomp.test.js) |
| **Sliding Window Rate Limiter** | `server/rateLimiter.js` (120 req/min/IP) | Prevents denial-of-service and downstream API quota exhaustion. | [`server/test/network-hardening.test.js`](../server/test/network-hardening.test.js) |
| **Strict Schema Validation** | `zod` runtime schemas (`server/schemas.js`) | Rejects malformed payloads, injection attempts, and excessive lengths. | [`server/test/api-validation.test.js`](../server/test/api-validation.test.js) |
| **Strict Payload Caps** | `express.json({ limit: "64kb" })` | Blocks buffer overflow and resource exhaustion attacks. | [`server/test/api-validation.test.js`](../server/test/api-validation.test.js) |
| **CORS Filtering & Host Binding** | Explicit `ALLOWED_ORIGINS` in `server/server.js` | Restricts cross-origin calls and binds to 127.0.0.1 by default. | [`server/test/network-hardening.test.js`](../server/test/network-hardening.test.js) |
| **Telemetry & Content Redaction** | `server/pipeline/observabilityAndSafety.js` | Redacts code and questions in OTLP and Langfuse spans. | [`server/test/otlp-langfuse-export.test.js`](../server/test/otlp-langfuse-export.test.js) |
| **Extension Update Settings Safety** | `extension/src/service-worker.ts` | Preserves custom `apiBase` and user settings across extension updates. | [`extension/test/settings-migration.test.ts`](../extension/test/settings-migration.test.ts) |
| **Manifest V3 Content Security Policy** | `script-src 'self'` in `extension/manifest.json` | Eliminates remote script evaluation and code injection in extension pages. | [`extension/e2e/load-extension.spec.ts`](../extension/e2e/load-extension.spec.ts) |
