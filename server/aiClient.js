/**
 * ExamAssist AI - AI Client Layer
 * Handles communication with OpenAI, custom models, and strict error handling.
 * Does NOT generate canned, fake, or fallback answers.
 */

import OpenAI from "openai";
import { MASTER_SYSTEM_PROMPT } from "./prompts.js";

// --- Typed AI Errors ---
export class AIError extends Error {
  constructor(message, code, status = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
  }
}

export class AIConfigError extends AIError {
  constructor(message = "No AI API key configured. Add OPENAI_API_KEY in server/.env") {
    super(message, "AI_NOT_CONFIGURED", 503);
  }
}

export class AIUnavailableError extends AIError {
  constructor(message = "AI service is currently unavailable or unreachable") {
    super(message, "AI_UNAVAILABLE", 503);
  }
}

export class AIRateLimitError extends AIError {
  constructor(message = "AI provider rate limit or quota exceeded") {
    super(message, "AI_RATE_LIMITED", 429);
  }
}

export class AITimeoutError extends AIError {
  constructor(message = "AI completion request timed out") {
    super(message, "AI_TIMEOUT", 504);
  }
}

/**
 * Extracts and parses a JSON object or array from LLM text output
 */
export function extractJsonFromText(text) {
  if (!text) return null;
  const clean = String(text).trim();

  // 1. Direct parse
  try {
    return JSON.parse(clean);
  } catch {}

  // 2. Extract from markdown code blocks ```json ... ``` or ``` ... ```
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = clean.match(jsonBlockRegex);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
  }

  // 3. Locate outermost { ... }
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
    } catch {}
  }

  // 4. Locate outermost [ ... ]
  const firstBracket = clean.indexOf("[");
  const lastBracket = clean.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(clean.substring(firstBracket, lastBracket + 1));
    } catch {}
  }

  return null;
}

export class AIClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey !== undefined ? options.apiKey : (process.env.OPENAI_API_KEY || "");
    this.model = options.model || process.env.OPENAI_MODEL || "gpt-4o";
    this.baseURL = options.baseURL || process.env.OPENAI_BASE_URL || undefined;
    this.mockHandler = options.mockHandler || null;

    if (this.apiKey && this.apiKey !== "replace_me" && this.apiKey.trim().length > 0) {
      this.openai = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL
      });
    } else {
      this.openai = null;
    }
  }

  get isConfigured() {
    return Boolean(
      (this.apiKey && this.apiKey !== "replace_me" && this.apiKey.trim().length > 0) ||
      this.mockHandler
    );
  }

  /**
   * Generates text completion using OpenAI or configured mock
   */
  async generateCompletion({
    systemPrompt = MASTER_SYSTEM_PROMPT,
    userPrompt,
    json = false,
    temperature = 0.2,
    timeoutMs = 30000
  }) {
    if (this.mockHandler) {
      return await this.mockHandler({ systemPrompt, userPrompt, json, temperature });
    }

    if (!this.isConfigured || !this.openai) {
      throw new AIConfigError("No AI API key configured. Add OPENAI_API_KEY in server/.env");
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    // Build candidate models list for automatic fallback on 429 quota or 503 errors
    const modelsToTry = [this.model];
    if (this.baseURL?.includes("googleapis.com") || this.model.startsWith("gemini-")) {
      const geminiFallbacks = [
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest",
        "gemini-3.5-flash"
      ];
      for (const fb of geminiFallbacks) {
        if (!modelsToTry.includes(fb)) modelsToTry.push(fb);
      }
    }

    let lastError = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      const hasNext = i < modelsToTry.length - 1;

      try {
        const response = await this.openai.chat.completions.create(
          {
            model: currentModel,
            messages,
            temperature,
            ...(json ? { response_format: { type: "json_object" } } : {})
          },
          {
            signal: AbortSignal.timeout(timeoutMs)
          }
        );

        const content = response.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
          throw new AIUnavailableError("Empty completion content received from AI provider");
        }
        return content;
      } catch (err) {
        if (err instanceof AIError && !(err instanceof AIRateLimitError) && !(err instanceof AIUnavailableError)) {
          throw err;
        }

        const msg = String(err.message || "").toLowerCase();
        const status = err.status || err.statusCode;

        if (status === 401 || status === 403 || msg.includes("invalid api key") || msg.includes("incorrect api key")) {
          throw new AIConfigError(`Invalid API key: ${err.message}`);
        }

        const isRateLimit = status === 429 || msg.includes("rate limit") || msg.includes("quota exceeded") || msg.includes("insufficient_quota") || msg.includes("429");
        const isUnavailable = status === 503 || msg.includes("high demand") || msg.includes("unavailable") || msg.includes("overloaded");

        if ((isRateLimit || isUnavailable) && hasNext) {
          console.warn(`[AIClient] Model ${currentModel} returned ${status || "error"} (${isRateLimit ? "rate limit / quota" : "unavailable"}). Falling back to ${modelsToTry[i + 1]}...`);
          lastError = err;
          continue;
        }

        if (isRateLimit) {
          throw new AIRateLimitError(err.message);
        }
        if (err.name === "AbortError" || err.name === "TimeoutError" || msg.includes("timeout") || msg.includes("etimedout")) {
          throw new AITimeoutError(err.message);
        }

        throw new AIUnavailableError(err.message);
      }
    }

    if (lastError) {
      throw new AIRateLimitError(lastError.message);
    }
  }

  /**
   * Generates structured JSON given a system prompt and user prompt.
   * Retries once with a dedicated repair prompt if initial JSON is malformed.
   */
  async generateJson({
    systemPrompt,
    userPrompt,
    temperature = 0.1,
    timeoutMs = 30000
  }) {
    const raw = await this.generateCompletion({
      systemPrompt: systemPrompt || MASTER_SYSTEM_PROMPT,
      userPrompt,
      json: true,
      temperature,
      timeoutMs
    });

    const parsed = extractJsonFromText(raw);
    if (parsed) return parsed;

    // Retry once with a "return valid JSON only" repair prompt
    try {
      const repairRaw = await this.generateCompletion({
        systemPrompt: "You are a JSON formatting engine. Return ONLY valid, well-formed JSON matching the expected schema. No markdown formatting, no comments, no additional text.",
        userPrompt: `The following response failed JSON parsing:\n\n${raw}\n\nReformat and return strictly valid JSON:`,
        json: true,
        temperature: 0,
        timeoutMs: 15000
      });

      const repaired = extractJsonFromText(repairRaw);
      if (repaired) return repaired;
    } catch (retryErr) {
      console.warn("[AIClient] JSON repair attempt failed:", retryErr.message);
    }

    return null;
  }
}

export const defaultAIClient = new AIClient();
