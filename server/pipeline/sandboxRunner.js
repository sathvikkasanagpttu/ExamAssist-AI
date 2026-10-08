/**
 * Compatibility shim: user code is never run in the backend process. All
 * execution is delegated to the separately restricted Docker sandbox.
 */
export function runSandboxedCode() {
  return { executed: false, success: false, error: "Docker-only sandbox required", output: "" };
}
