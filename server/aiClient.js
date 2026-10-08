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

export class AIBudgetError extends AIError {
  constructor(message = "The agent budget was exhausted before a verified result was available") {
    super(message, "AI_BUDGET_EXCEEDED", 503);
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
    this.toolLoopHandler = options.toolLoopHandler || null;
    this.usageMetrics = options.usageMetrics || null;

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
      this.mockHandler || this.toolLoopHandler
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
    if (this.usageMetrics) {
      if (Number.isFinite(this.usageMetrics.maxCalls) && this.usageMetrics.calls >= this.usageMetrics.maxCalls) {
        const error = new Error("EVAL_MAX_CALLS_REACHED");
        error.code = "EVAL_MAX_CALLS_REACHED";
        throw error;
      }
      this.usageMetrics.calls++;
    }
    if (this.mockHandler) {
      const content = await this.mockHandler({ systemPrompt, userPrompt, json, temperature });
      if (this.usageMetrics) {
        this.usageMetrics.estimatedPromptTokens += Math.ceil(`${systemPrompt || ""}${userPrompt || ""}`.length / 4);
        this.usageMetrics.estimatedCompletionTokens += Math.ceil(String(content || "").length / 4);
      }
      return content;
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
        if (this.usageMetrics) {
          const usage = response.usage;
          if (usage?.total_tokens != null) this.usageMetrics.providerTokens += usage.total_tokens;
          else {
            this.usageMetrics.estimatedPromptTokens += Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4);
            this.usageMetrics.estimatedCompletionTokens += Math.ceil(content.length / 4);
          }
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

  /**
   * Executes native OpenAI-compatible function calls with hard call, time,
   * token, and configured-cost limits. Tool output is returned to the model
   * only as data and the caller is responsible for validating every argument.
   */
  async runToolLoop({
    systemPrompt,
    userPrompt,
    tools,
    executeTool,
    maxToolCalls = 6,
    maxToolMs = 5000,
    maxTotalMs = 15000,
    maxTokens = 6000,
    maxUsd = Number(process.env.AGENT_MAX_USD || "0.05"),
    costPer1kTokensUsd = Number(process.env.AGENT_COST_PER_1K_TOKENS_USD || "")
  }) {
    if (this.toolLoopHandler) {
      return this.toolLoopHandler({ systemPrompt, userPrompt, tools, executeTool, maxToolCalls, maxToolMs, maxTotalMs, maxTokens, maxUsd, costPer1kTokensUsd });
    }
    // Text-completion mocks cannot emulate native tool-call messages. Let the
    // caller use its deterministic fallback instead of opening a real network
    // request with a test key.
    if (this.mockHandler) throw new AIUnavailableError("Native tool calling is unavailable for this completion mock");
    if (!this.isConfigured || !this.openai) throw new AIConfigError();
    if (!Number.isFinite(costPer1kTokensUsd) || costPer1kTokensUsd <= 0) {
      throw new AIBudgetError("AGENT_COST_PER_1K_TOKENS_USD is required to enforce the agent USD budget");
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];
    const trace = [];
    const startedAt = Date.now();
    let totalTokens = 0;
    let totalCostUsd = 0;

    while (true) {
      if (Date.now() - startedAt > maxTotalMs) throw new AIBudgetError("Agent exceeded its total time budget");
      if (trace.length > maxToolCalls) throw new AIBudgetError("Agent exceeded its maximum number of tool calls");
      if (totalTokens >= maxTokens) throw new AIBudgetError("Agent exceeded its token budget");
      if (totalCostUsd >= maxUsd) throw new AIBudgetError("Agent exceeded its USD budget");

      let response;
      try {
        response = await this.openai.chat.completions.create({
          model: this.model,
          messages,
          tools,
          tool_choice: "auto",
          temperature: 0
        }, { signal: AbortSignal.timeout(Math.max(250, maxTotalMs - (Date.now() - startedAt))) });
      } catch (error) {
        const message = String(error?.message || error);
        const status = error?.status || error?.statusCode;
        if (status === 401 || status === 403 || /invalid api key|incorrect api key/i.test(message)) throw new AIConfigError(`Invalid API key: ${message}`);
        if (status === 429 || /rate limit|quota|429/i.test(message)) throw new AIRateLimitError(message);
        if (/abort|timeout|timedout/i.test(message)) throw new AITimeoutError(message);
        throw new AIUnavailableError(message);
      }

      const message = response.choices?.[0]?.message;
      if (!message) throw new AIUnavailableError("Agent provider returned no message");
      const usage = response.usage?.total_tokens;
      const estimated = usage ?? Math.ceil(JSON.stringify(messages).length / 4 + String(message.content || "").length / 4);
      totalTokens += estimated;
      totalCostUsd += (estimated / 1000) * costPer1kTokensUsd;
      if (totalTokens > maxTokens) throw new AIBudgetError("Agent exceeded its token budget");
      if (totalCostUsd > maxUsd) throw new AIBudgetError("Agent exceeded its USD budget");
      if (this.usageMetrics) {
        this.usageMetrics.calls++;
        if (usage != null) this.usageMetrics.providerTokens += usage;
        else {
          this.usageMetrics.estimatedPromptTokens += Math.ceil(JSON.stringify(messages).length / 4);
          this.usageMetrics.estimatedCompletionTokens += Math.ceil(String(message.content || "").length / 4);
        }
      }

      const toolCalls = message.tool_calls || [];
      if (toolCalls.length === 0) {
        const final = extractJsonFromText(message.content);
        if (!final || typeof final !== "object") throw new AIUnavailableError("Agent did not return a JSON final response");
        return {
          final,
          trace,
          usage: { totalTokens, totalCostUsd: Math.round(totalCostUsd * 1e6) / 1e6, elapsedMs: Date.now() - startedAt }
        };
      }

      if (trace.length + toolCalls.length > maxToolCalls) throw new AIBudgetError("Agent exceeded its maximum number of tool calls");

      messages.push({ role: "assistant", content: message.content || "", tool_calls: toolCalls });
      for (const toolCall of toolCalls) {
        let args;
        try { args = JSON.parse(toolCall.function?.arguments || "{}"); }
        catch { args = null; }
        const name = toolCall.function?.name || "unknown";
        let result;
        try {
          if (args === null) {
            result = { ok: false, error: "Tool arguments were not valid JSON" };
          } else {
            let timeoutId;
            try {
              result = await new Promise((resolve, reject) => {
                timeoutId = setTimeout(() => reject(new AITimeoutError(`Tool '${name}' exceeded its time budget`)), maxToolMs);
                Promise.resolve(executeTool(name, args)).then(resolve, reject);
              });
            } finally {
              clearTimeout(timeoutId);
            }
          }
        } catch (error) {
          result = { ok: false, error: "Tool execution failed", code: error?.code || "TOOL_ERROR" };
        }
        const safeResult = JSON.stringify(result).slice(0, 16000);
        trace.push({ toolCallId: toolCall.id, tool: name, args, result: safeResult, elapsedMs: Date.now() - startedAt });
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: safeResult });
      }
    }
  }
}

export const defaultAIClient = new AIClient();
