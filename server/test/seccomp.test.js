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

test("Seccomp: docker-compose.yml explicitly configures seccomp profile for sandbox", () => {
  assert.ok(fs.existsSync(composePath), "docker-compose.yml must exist");
  const composeContent = fs.readFileSync(composePath, "utf8");

  // Check that security_opt contains seccomp pointing to the profile
  assert.match(
    composeContent,
    /security_opt:\s*[\r\n]+(\s*-\s+[^\r\n]+[\r\n]+)*\s*-\s*seccomp=\.\/server\/sandbox\/seccomp-profile\.json/,
    "docker-compose.yml must configure seccomp=./server/sandbox/seccomp-profile.json under security_opt"
  );

  // Check that the configured relative path actually resolves to an existing file
  assert.ok(fs.existsSync(seccompPath), "seccomp profile file must exist at ./server/sandbox/seccomp-profile.json");

  const profile = JSON.parse(fs.readFileSync(seccompPath, "utf8"));
  assert.equal(profile.defaultAction, "SCMP_ACT_ALLOW");
  assert.ok(Array.isArray(profile.syscalls), "syscalls array must exist");

  const blockedSyscalls = profile.syscalls[0]?.names || [];
  assert.ok(blockedSyscalls.includes("ptrace"), "seccomp profile must block ptrace");
  assert.ok(blockedSyscalls.includes("bpf"), "seccomp profile must block bpf");
  assert.ok(blockedSyscalls.includes("kexec_load"), "seccomp profile must block kexec_load");
  assert.equal(profile.syscalls[0]?.action, "SCMP_ACT_ERRNO");
});

test("Seccomp integration: attempted blocked syscall (ptrace) fails inside sandbox", async (t) => {
  if (!(await sandboxHealth())) {
    return t.skip("Docker sandbox is not running; integration cases require Compose");
  }

  const ptraceTestCode = `
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

  const result = await executeInSandbox({
    language: "python",
    code: ptraceTestCode
  });

  assert.equal(result.executed, true, "sandbox must execute python snippet");
  assert.match(result.stdout, /blocked:/, "ptrace syscall must be blocked by sandbox seccomp profile");
});
