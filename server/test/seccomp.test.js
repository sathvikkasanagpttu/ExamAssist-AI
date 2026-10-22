import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeInSandbox, sandboxHealth } from "../pipeline/sandboxClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const composePath = path.join(repoRoot, "docker-compose.yml");
const seccompPath = path.join(repoRoot, "server", "sandbox", "seccomp-profile.json");
const dockerfilePath = path.join(repoRoot, "server", "sandbox", "Dockerfile");

test("Seccomp & Sandbox Config: docker-compose.yml explicitly hardens sandbox container", () => {
  assert.ok(fs.existsSync(composePath), "docker-compose.yml must exist");
  const composeContent = fs.readFileSync(composePath, "utf8");

  // 1. Check that security_opt contains seccomp pointing to the profile
  assert.match(
    composeContent,
    /security_opt:\s*[\r\n]+(\s*-\s+[^\r\n]+[\r\n]+)*\s*-\s*seccomp=\.\/server\/sandbox\/seccomp-profile\.json/,
    "docker-compose.yml must configure seccomp=./server/sandbox/seccomp-profile.json under security_opt"
  );
  assert.match(composeContent, /no-new-privileges:true/, "docker-compose.yml must configure no-new-privileges:true");

  // 2. Check that root is removed (runs as unprivileged user 10001:10001)
  assert.match(composeContent, /user:\s*["']10001:10001["']/, "docker-compose.yml must configure user: '10001:10001' (no root)");
  assert.doesNotMatch(composeContent, /user:\s*["']0:0["']/, "docker-compose.yml must not run container as root (0:0)");

  // 3. Check that CAP_SYS_ADMIN, CAP_NET_ADMIN, and all capabilities are removed
  assert.match(composeContent, /cap_drop:\s*[\r\n]+(\s*-\s+[^\r\n]+[\r\n]+)*\s*-\s*ALL|cap_drop:\s*\[ALL\]/, "docker-compose.yml must drop ALL capabilities");
  assert.doesNotMatch(composeContent, /cap_add:.*SYS_ADMIN/, "docker-compose.yml must not grant CAP_SYS_ADMIN");
  assert.doesNotMatch(composeContent, /cap_add:.*NET_ADMIN/, "docker-compose.yml must not grant CAP_NET_ADMIN");

  // 4. Check read-only rootfs and resource limits
  assert.match(composeContent, /read_only:\s*true/, "docker-compose.yml must configure read_only: true");
  assert.match(composeContent, /pids_limit:\s*\d+/, "docker-compose.yml must configure pids_limit to mitigate fork bombs");
  assert.match(composeContent, /mem_limit:\s*\d+[mMgG]/, "docker-compose.yml must configure mem_limit to mitigate memory bombs");

  // 5. Check Dockerfile non-root configuration
  assert.ok(fs.existsSync(dockerfilePath), "Dockerfile must exist");
  const dockerfileContent = fs.readFileSync(dockerfilePath, "utf8");
  assert.match(dockerfileContent, /useradd\s+--uid\s+10001/, "Dockerfile must define unprivileged user 10001");
  assert.match(dockerfileContent, /USER\s+10001:10001/, "Dockerfile must set USER 10001:10001");
  assert.doesNotMatch(dockerfileContent, /bubblewrap|bwrap/, "Dockerfile must not rely on bubblewrap setuid binaries");

  // 6. Check that the configured relative path actually resolves to an existing file
  assert.ok(fs.existsSync(seccompPath), "seccomp profile file must exist at ./server/sandbox/seccomp-profile.json");
  const profile = JSON.parse(fs.readFileSync(seccompPath, "utf8"));

  // 7. Verify base default-deny action
  assert.equal(profile.defaultAction, "SCMP_ACT_ERRNO", "seccomp profile defaultAction must be default-deny (SCMP_ACT_ERRNO)");
  assert.equal(profile.defaultErrnoRet, 1, "seccomp profile defaultErrnoRet must be 1 (EPERM)");
  assert.ok(Array.isArray(profile.architectures), "seccomp profile must declare supported architectures");
  assert.ok(Array.isArray(profile.syscalls), "syscalls array must exist");

  // 8. Verify dangerous syscalls are explicitly blocked
  const blockedRules = profile.syscalls.filter(s => s.action === "SCMP_ACT_ERRNO");
  const blockedNames = blockedRules.flatMap(r => r.names || []);
  const requiredBlocked = ["mount", "unshare", "ptrace", "bpf", "kexec_load", "reboot", "pivot_root", "chroot"];
  for (const name of requiredBlocked) {
    assert.ok(blockedNames.includes(name), `seccomp profile must explicitly block syscall '${name}'`);
  }

  // 9. Verify runner allowlist is declared with SCMP_ACT_ALLOW
  const allowRules = profile.syscalls.filter(s => s.action === "SCMP_ACT_ALLOW");
  assert.ok(allowRules.length > 0, "seccomp profile must have an allowlist for runner-required syscalls");
  const allowedNames = allowRules.flatMap(r => r.names || []);
  const requiredAllowed = ["read", "write", "execve", "exit_group", "mmap", "futex", "clone"];
  for (const name of requiredAllowed) {
    assert.ok(allowedNames.includes(name), `seccomp allowlist must include runner syscall '${name}'`);
  }
});

// Attack 1: Attempt mount syscall
test("Sandbox Attack 1 (mount): blocked inside sandbox", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const snippet = `
import ctypes
libc = ctypes.CDLL(None, use_errno=True)
res = libc.mount(b"none", b"/tmp", b"tmpfs", 0, None)
err = ctypes.get_errno()
if res != 0:
    print(f"blocked: errno={err}")
else:
    print("allowed")
`;
  const result = await executeInSandbox({ language: "python", code: snippet });
  assert.equal(result.executed, true);
  assert.match(result.stdout, /blocked:/, "mount syscall must be blocked by seccomp / lack of CAP_SYS_ADMIN");
});

// Attack 2: Attempt unshare syscall
test("Sandbox Attack 2 (unshare): blocked inside sandbox", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const snippet = `
import ctypes
libc = ctypes.CDLL(None, use_errno=True)
# CLONE_NEWUSER (0x10000000)
res = libc.unshare(0x10000000)
err = ctypes.get_errno()
if res != 0:
    print(f"blocked: errno={err}")
else:
    print("allowed")
`;
  const result = await executeInSandbox({ language: "python", code: snippet });
  assert.equal(result.executed, true);
  assert.match(result.stdout, /blocked:/, "unshare syscall must be blocked by seccomp / lack of CAP_SYS_ADMIN");
});

// Attack 3: Attempt ptrace syscall
test("Sandbox Attack 3 (ptrace): blocked inside sandbox", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const snippet = `
import ctypes
libc = ctypes.CDLL(None, use_errno=True)
# PTRACE_TRACEME = 0
res = libc.ptrace(0, 0, 0, 0)
err = ctypes.get_errno()
if res != 0:
    print(f"blocked: errno={err}")
else:
    print("allowed")
`;
  const result = await executeInSandbox({ language: "python", code: snippet });
  assert.equal(result.executed, true);
  assert.match(result.stdout, /blocked:/, "ptrace syscall must be blocked by seccomp");
});

// Attack 4: Attempt bpf syscall
test("Sandbox Attack 4 (bpf): blocked inside sandbox", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const snippet = `
import ctypes, platform
libc = ctypes.CDLL(None, use_errno=True)
sys_bpf = 280 if platform.machine() in ("aarch64", "arm64") else 321
res = libc.syscall(sys_bpf, 0, 0, 0)
err = ctypes.get_errno()
if res != 0:
    print(f"blocked: errno={err}")
else:
    print("allowed")
`;
  const result = await executeInSandbox({ language: "python", code: snippet });
  assert.equal(result.executed, true);
  assert.match(result.stdout, /blocked:/, "bpf syscall must be blocked by seccomp / lack of CAP_SYS_ADMIN");
});

// Attack 5: Attempt network access
test("Sandbox Attack 5 (network): blocked inside sandbox", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const snippet = `
import urllib.request
try:
    urllib.request.urlopen("http://example.com", timeout=1)
    print("allowed")
except Exception as e:
    print(f"blocked: {type(e).__name__}")
`;
  const result = await executeInSandbox({ language: "python", code: snippet });
  assert.equal(result.executed, true);
  assert.match(result.stdout, /blocked:/, "outbound network connections must fail");
});

// Attack 6: Attempt writing outside /tmp
test("Sandbox Attack 6 (write outside /tmp): blocked inside sandbox", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const snippet = `
try:
    with open("/etc/pwn-test", "w") as f:
        f.write("exploit")
    print("allowed")
except OSError as e:
    print(f"blocked: {type(e).__name__}")
`;
  const result = await executeInSandbox({ language: "python", code: snippet });
  assert.equal(result.executed, true);
  assert.match(result.stdout, /blocked:/, "writing to read-only rootfs outside /tmp must fail with OSError");
});

// Attack 7: Attempt fork bomb
test("Sandbox Attack 7 (fork bomb): contained inside sandbox", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const snippet = `
import os, time
pids = []
try:
    for _ in range(100):
        pid = os.fork()
        if pid == 0:
            time.sleep(0.5)
            os._exit(0)
        pids.append(pid)
    print("allowed")
except OSError as e:
    print(f"blocked: {type(e).__name__}")
`;
  const result = await executeInSandbox({ language: "python", code: snippet });
  assert.equal(result.executed, true);
  // Fork bomb must either be caught with OSError (BlockingIOError/EAGAIN) or terminated by process limit
  if (result.stdout) {
    assert.match(result.stdout, /blocked:/, "fork bomb must trigger process limit");
  } else {
    assert.notEqual(result.exitCode, 0, "fork bomb exceeding limits must exit non-zero or be terminated");
  }
});

// Attack 8: Attempt memory bomb
test("Sandbox Attack 8 (memory bomb): contained inside sandbox", async (t) => {
  if (!(await sandboxHealth())) return t.skip("Docker sandbox is not running; integration cases require Compose");
  const snippet = `
try:
    # Attempt allocating 1GB virtual memory
    blob = b"x" * (1024 * 1024 * 1024)
    print("allowed")
except (MemoryError, OverflowError) as e:
    print("blocked: MemoryError")
`;
  const result = await executeInSandbox({ language: "python", code: snippet });
  assert.equal(result.executed, true);
  // Either handled by MemoryError or terminated by RLIMIT_AS/mem_limit
  if (result.stdout && result.stdout.includes("blocked:")) {
    assert.match(result.stdout, /blocked: MemoryError/);
  } else {
    assert.notEqual(result.exitCode, 0, "memory bomb must fail with non-zero exit code due to RLIMIT_AS");
  }
});
