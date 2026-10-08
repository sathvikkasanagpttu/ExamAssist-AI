const sandboxUrl = () => process.env.SANDBOX_URL || "";

export async function sandboxHealth() {
  if (!sandboxUrl()) return false;
  try {
    const response = await fetch(`${sandboxUrl()}/health`, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch { return false; }
}

async function postSandbox(path, payload) {
  if (!sandboxUrl()) return { executed: false, error: "Docker sandbox is not configured" };
  try {
    const response = await fetch(`${sandboxUrl()}${path}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(Number(process.env.SANDBOX_TIMEOUT_MS || 2000) + 1500)
    });
    const result = await response.json();
    if (!response.ok) return { executed: false, error: result.error || "Sandbox request failed" };
    return result;
  } catch {
    return { executed: false, error: "Docker sandbox unavailable; code was not executed" };
  }
}

export const executeInSandbox = (payload) => postSandbox("/execute", payload);
export const executeSqlInSandbox = (payload) => postSandbox("/sql", payload);
export const executeSymbolic = (payload) => postSandbox("/symbolic", payload);
