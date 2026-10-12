/**
 * ExamAssist AI - Validated Extension Messaging & Streaming Client (TypeScript)
 * Shares Zod schemas with backend (/shared) and validates every runtime message and API payload.
 */

import {
  AssessmentAnalyzeRequestSchema,
  CodeAnalyzeRequestSchema,
  CodeDebugRequestSchema,
  CodeHintRequestSchema,
  ExtractedCodingProblemSchema,
  ExtractedQuestionPayloadSchema,
  ExtensionMessageSchema,
  RuntimeMessageEnvelopeSchema,
  type AssessmentAnalyzeRequest,
  type CodeAnalyzeRequest,
  type CodeDebugRequest,
  type CodeHintRequest,
  type ExtractedCodingProblem,
  type ExtractedQuestionPayload,
  type ExtensionMessage,
  type RuntimeMessageEnvelope
} from "@examassist/shared";

export function isExtensionContextAlive(): boolean {
  try {
    return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

export async function getStorageConfig<T extends Record<string, unknown>>(defaults: T): Promise<T> {
  if (!isExtensionContextAlive() || !chrome.storage?.local) return { ...defaults };
  try {
    return (await chrome.storage.local.get(defaults)) as T;
  } catch {
    return { ...defaults };
  }
}

export async function setStorageConfig(items: Record<string, unknown>): Promise<void> {
  if (!isExtensionContextAlive() || !chrome.storage?.local) return;
  try {
    await chrome.storage.local.set(items);
  } catch {
    // Ignore invalidated context errors
  }
}

export async function getApiBaseUrl(): Promise<string> {
  const cfg = await getStorageConfig({ apiBase: "http://localhost:8787" });
  return String(cfg.apiBase || "http://localhost:8787").replace(/\/+$/, "");
}

export function validateRuntimeMessage(raw: unknown): {
  valid: boolean;
  message?: RuntimeMessageEnvelope;
  error?: string;
} {
  const parsed = RuntimeMessageEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      error: parsed.error.issues.map((i: { path: PropertyKey[]; message: string }) => `${i.path.join(".")}: ${i.message}`).join("; ")
    };
  }
  return { valid: true, message: parsed.data };
}

export function validateExtensionMessage(raw: unknown): ExtensionMessage {
  return ExtensionMessageSchema.parse(raw);
}

export function validateExtractedQuestionPayload(raw: unknown): ExtractedQuestionPayload {
  return ExtractedQuestionPayloadSchema.parse(raw);
}

export function validateExtractedCodingProblem(raw: unknown): ExtractedCodingProblem {
  return ExtractedCodingProblemSchema.parse(raw);
}

export interface StreamProgressUpdate {
  stage: string;
  label: string;
  data?: Record<string, unknown>;
}

const STAGE_LABELS: Record<string, string> = {
  classifying: "Classifying question & checking quality...",
  solving: "Deriving first-principles solution...",
  retrieving: "Retrieving verified evidence & course notes...",
  verifying: "Verifying claims & checking option integrity...",
  complete: "Analysis complete."
};

export async function readAssessmentStreamResponse(
  response: Response,
  onProgress?: (update: StreamProgressUpdate) => void
): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body is unavailable.");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: Record<string, unknown> | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      const lines = rawEvent.split(/\r?\n/);
      const eventType = lines
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const dataLine = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!dataLine) continue;

      const payload = JSON.parse(dataLine) as Record<string, unknown>;
      if (eventType === "progress" && typeof payload.stage === "string") {
        onProgress?.({
          stage: payload.stage,
          label: STAGE_LABELS[payload.stage] || payload.stage,
          data: payload
        });
      } else if (eventType === "partial") {
        onProgress?.({
          stage: "partial",
          label: "Streaming intermediate reasoning...",
          data: payload
        });
      } else if (eventType === "error") {
        const err = new Error(String(payload.error || "Streaming analysis failed.")) as Error & { code?: string };
        err.code = typeof payload.code === "string" ? payload.code : undefined;
        throw err;
      } else if (eventType === "done") {
        finalResult = payload;
      }
    }
  }

  if (!finalResult) {
    throw new Error("Stream ended before a final result was received.");
  }
  return finalResult;
}

export async function streamAssessmentAnalysis({
  request,
  apiBase,
  localUserId,
  signal,
  onProgress
}: {
  request: AssessmentAnalyzeRequest;
  apiBase: string;
  localUserId: string;
  signal?: AbortSignal;
  onProgress?: (update: StreamProgressUpdate) => void;
}): Promise<Record<string, unknown>> {
  const validated = AssessmentAnalyzeRequestSchema.parse(request);
  const res = await fetch(`${apiBase.replace(/\/+$/, "")}/api/assessment/analyze/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Local-User-Id": localUserId
    },
    signal,
    body: JSON.stringify(validated)
  });

  if (!res.ok) {
    let errPayload: Record<string, unknown> = {};
    try {
      errPayload = (await res.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON error body
    }
    const err = new Error(
      String(errPayload.error || `Streaming request failed (${res.status})`)
    ) as Error & { code?: string };
    err.code = typeof errPayload.code === "string" ? errPayload.code : undefined;
    throw err;
  }

  return readAssessmentStreamResponse(res, onProgress);
}

export async function requestCodingAnalysis(
  request: CodeAnalyzeRequest,
  apiBase: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const validated = CodeAnalyzeRequestSchema.parse(request);
  const res = await fetch(`${apiBase.replace(/\/+$/, "")}/api/code/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(validated)
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(String(data.error || `HTTP ${res.status}`)) as Error & { code?: string };
    err.code = typeof data.code === "string" ? data.code : undefined;
    throw err;
  }
  return data;
}

export async function requestCodingHint(
  request: CodeHintRequest,
  apiBase: string,
  signal?: AbortSignal
): Promise<{ level: number; activeHint: string; hints: Record<string, string | null> }> {
  const validated = CodeHintRequestSchema.parse(request);
  const res = await fetch(`${apiBase.replace(/\/+$/, "")}/api/code/hint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(validated)
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(String(data.error || `HTTP ${res.status}`)) as Error & { code?: string };
    err.code = typeof data.code === "string" ? data.code : undefined;
    throw err;
  }
  return {
    level: Number(data.level || validated.level || 1),
    activeHint: String(data.activeHint || ""),
    hints: (data.hints as Record<string, string | null>) || {}
  };
}

export async function requestCodingDebug(
  request: CodeDebugRequest,
  apiBase: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const validated = CodeDebugRequestSchema.parse(request);
  const res = await fetch(`${apiBase.replace(/\/+$/, "")}/api/code/debug`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(validated)
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(String(data.error || `HTTP ${res.status}`)) as Error & { code?: string };
    err.code = typeof data.code === "string" ? data.code : undefined;
    throw err;
  }
  return data;
}
