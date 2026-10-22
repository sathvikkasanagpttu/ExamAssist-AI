# ExamAssist AI — Security, Sandbox Containment & Privacy Architecture

ExamAssist AI is engineered around strict ethical, security, and privacy boundaries.

---

## 1. Ethical & Anti-Evasion Hard Rules

1. **Visible and User-Triggered Only**:
   - No stealth mode, hidden UI, screen-share hiding, proctor evasion, background tab capture, auto-submit, or auto-click.
   - All in-page UI renders visibly inside `#examai-shadow-host` or the Chrome Side Panel only when triggered by the user.
2. **Read-Only Host Editors**:
   - The extension never writes into host page editors (`Monaco`, `CodeMirror`, `Ace`, `textarea`, `contenteditable`), never dispatches synthetic keystrokes, and never simulates typing.
   - Code leaves the panel only via explicit **Copy** or a visible unified diff that the user applies themselves.
3. **Practice vs. Authorized Assessment Mode Gate**:
   - In **Authorized Assessment Mode**, full code solutions and direct final answers are gated behind an explicit user click (`#examai-reveal-solution-btn`) with a visible academic-integrity notice.
   - Hints are generated **lazily one level per click** (Levels 1 → 4) so the full solution is not in the network response or DOM until Level 4 is explicitly requested.

---

## 2. Narrow Extension Permissions

- `extension/manifest.json` ships with a narrow default allow-list (`localhost`, `127.0.0.1`) and **never** declares `<all_urls>` in `content_scripts` or `host_permissions` (Verified by [`extension/e2e/load-extension.spec.ts`](../extension/e2e/load-extension.spec.ts) and [`scripts/verify-dist.mjs`](../scripts/verify-dist.mjs)).
- Per-site access is requested at runtime from the popup (`#enable-site-btn`) via `chrome.permissions.request({ origins: [origin] })` using `optional_host_permissions`.

---

## 3. Sandbox Isolation & Defense-in-Depth (`server/sandbox/`)

- **Internal-Only Container Networking**: `examassist-sandbox` in `docker-compose.yml` uses `expose: ["8790"]` on `networks: [backend]` (`internal: true`) and is **never** published to the host's ports.
- **Per-Test Process Isolation**:
  - Runs inside `bubblewrap` (`bwrap`) with `--unshare-all`, `--ro-bind` rootfs, tmpfs `/tmp` (`noexec,nosuid,size=64m`), and unprivileged user `uid 10001` (`sandbox`).
  - Enforces `pids_limit: 96`, `mem_limit: 768m`, `cpus: 1.0`, `no-new-privileges:true`, and `server/sandbox/seccomp-profile.json` blocking dangerous kernel syscalls including `ptrace`, `bpf`, `kexec_load`, and `perf_event_open` (with network isolation enforced at the Bubblewrap boundary via `--unshare-net`) (Verified by [`server/test/seccomp.test.js`](../server/test/seccomp.test.js)).
  - Supports optional `gVisor` (`runsc`) runtime via `SANDBOX_RUNTIME=runsc`.
- **BullMQ + Redis Job Queue (`server/pipeline/executionQueue.js`)**:
  - Enforces per-user concurrency limits (`SANDBOX_USER_CONCURRENCY=2`), queue timeouts, and compile-once SHA-256 artifact caching for C, C++, and Java (Verified by [`server/test/phase2-coding-engine.test.js`](../server/test/phase2-coding-engine.test.js)).

---

## 4. Untrusted Input & Prompt-Injection Defense

- Problem statements, web search snippets, OCR text, and sandbox outputs are wrapped and treated strictly as **untrusted data**, never instructions.
- `server/pipeline/observabilityAndSafety.js` (`checkUntrustedDataInjection`) detects instruction-override patterns, and `scrubSecretsAndPII` strips API keys (`sk-...`, `AIza...`, Bearer tokens), emails, and phone numbers before logging or external calls (Verified by [`server/test/phase5-observability-ci-eval.test.js`](../server/test/phase5-observability-ci-eval.test.js)).

---

## 5. Vision / OCR Privacy & OpenTelemetry Redaction

- **Zero Screenshot Persistence (`server/pipeline/visionExtractor.js`)**:
  - Enforces a 4 MB limit, MIME whitelist (`image/png`, `image/jpeg`, `image/webp`), and binary magic-byte header verification.
  - Processes images strictly in memory and returns `imagePersisted: false`; raw image bytes and base64 payloads are never written to disk or logs (Verified by [`server/test/phase3-vision.test.js`](../server/test/phase3-vision.test.js)).
- **OpenTelemetry & Langfuse Redaction (`server/pipeline/observabilityAndSafety.js`)**:
  - Code and question text are redacted by default (`OTEL_REDACT_CODE_AND_QUESTIONS=true`) into SHA-256 length digests (`[REDACTED_CONTENT len=... sha256=...]`).
  - The local trace viewer (`GET /api/traces`) is restricted to localhost (`127.0.0.1` / `::1`) via `isLocalhostRequest` (Verified by [`server/test/otlp-langfuse-export.test.js`](../server/test/otlp-langfuse-export.test.js) and [`server/test/phase5-observability-ci-eval.test.js`](../server/test/phase5-observability-ci-eval.test.js)).
