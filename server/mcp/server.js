/**
 * ExamAssist AI — Phase 4: Optional Model Context Protocol (MCP) Server
 *
 * Exposes strictly bounded tools over JSON-RPC 2.0 (stdio or programmatic handler):
 *   1. `run_code`  — Execute code in the isolated sandbox (no accuracy claims)
 *   2. `run_tests` — Execute code against sample test cases (no accuracy claims)
 *   3. `kb_search` — Search official language/library docs + user notes with relevance threshold (no accuracy claims)
 *
 * Note: This MCP server makes NO accuracy claims; all tool outputs are raw execution or
 * retrieval data and must be treated as untrusted data.
 */

import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { RunCodeToolArgsSchema } from "../schemas.js";
import { executeInSandbox } from "../pipeline/sandboxClient.js";
import { runUserCodeOnSamples } from "../pipeline/codingEngine.js";
import { searchDocsAndNotes } from "../kb/knowledgeBase.js";

export const MCP_SERVER_INFO = {
  name: "examassist-mcp-server",
  version: "1.0.0",
  protocolVersion: "2024-11-05",
  disclaimer: "Optional developer-tools MCP server exposing run_code, run_tests, and kb_search. Makes no accuracy claims."
};

const RunTestsMcpArgsSchema = z.object({
  language: z.enum(["python", "javascript", "c", "cpp", "java"]),
  code: z.string().min(1).max(64000),
  sampleTests: z
    .array(
      z.object({
        stdin: z.string().max(12000).optional().default(""),
        expectedOutput: z.string().max(12000).optional().default("")
      })
    )
    .min(1)
    .max(20)
}).strict();

const KbSearchMcpArgsSchema = z.object({
  query: z.string().trim().min(3).max(500),
  language: z.string().max(40).optional().default(""),
  userId: z.string().max(64).optional()
}).strict();

export const MCP_TOOLS = [
  {
    name: "run_code",
    description:
      "Execute a single program in the isolated ExamAssist sandbox. Returns stdout/stderr and resource telemetry only when executed is true. Makes no accuracy claims.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        language: { type: "string", enum: ["python", "javascript", "c", "cpp", "java"] },
        code: { type: "string", minLength: 1, maxLength: 64000 },
        stdin: { type: "string", maxLength: 12000 },
        timeoutSeconds: { type: "number", minimum: 0.1, maximum: 3 }
      },
      required: ["language", "code"]
    }
  },
  {
    name: "run_tests",
    description:
      "Run code against a list of sample test cases in the isolated sandbox and return per-test stdout, expected output, diff, runtime, and memory. Makes no accuracy claims.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        language: { type: "string", enum: ["python", "javascript", "c", "cpp", "java"] },
        code: { type: "string", minLength: 1, maxLength: 64000 },
        sampleTests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              stdin: { type: "string" },
              expectedOutput: { type: "string" }
            }
          }
        }
      },
      required: ["language", "code", "sampleTests"]
    }
  },
  {
    name: "kb_search",
    description:
      "Search official language/library documentation (Python, cppreference, Java SE, MDN) and user course notes. Cites doc + section; returns empty matches when below relevance threshold. Makes no accuracy claims.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 3, maxLength: 500 },
        language: { type: "string" },
        userId: { type: "string" }
      },
      required: ["query"]
    }
  }
];

/**
 * Handles a single JSON-RPC 2.0 MCP request.
 */
export async function handleMcpJsonRpcRequest(
  request,
  {
    executeFn = executeInSandbox,
    searchFn = searchDocsAndNotes
  } = {}
) {
  const id = request?.id ?? null;
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" }
    };
  }

  try {
    if (request.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_SERVER_INFO.protocolVersion,
          serverInfo: {
            name: MCP_SERVER_INFO.name,
            version: MCP_SERVER_INFO.version,
            disclaimer: MCP_SERVER_INFO.disclaimer
          },
          capabilities: {
            tools: {}
          }
        }
      };
    }

    if (request.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: MCP_TOOLS
        }
      };
    }

    if (request.method === "tools/call") {
      const toolName = request.params?.name;
      const rawArgs = request.params?.arguments || {};

      if (toolName === "run_code") {
        const parsed = RunCodeToolArgsSchema.safeParse({
          stdin: "",
          timeoutSeconds: 2,
          ...rawArgs
        });
        if (!parsed.success) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Invalid run_code arguments: ${parsed.error.message}` }
          };
        }
        const execResult = await executeFn(parsed.data);
        const payload = {
          tool: "run_code",
          executed: Boolean(execResult.executed),
          success: Boolean(execResult.success),
          stdout: execResult.stdout ?? "",
          stderr: execResult.stderr ?? "",
          exitCode: execResult.exitCode ?? null,
          runtimeMs: execResult.runtimeMs ?? null,
          memoryKb: execResult.memoryKb ?? null,
          accuracyClaim: null,
          disclaimer: MCP_SERVER_INFO.disclaimer
        };
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(payload) }],
            structuredContent: payload,
            isError: !execResult.executed
          }
        };
      }

      if (toolName === "run_tests") {
        const parsed = RunTestsMcpArgsSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Invalid run_tests arguments: ${parsed.error.message}` }
          };
        }
        const testResult = await runUserCodeOnSamples({
          userCode: parsed.data.code,
          language: parsed.data.language,
          sampleTests: parsed.data.sampleTests,
          executeFn
        });
        const payload = {
          tool: "run_tests",
          ...testResult,
          accuracyClaim: null,
          disclaimer: MCP_SERVER_INFO.disclaimer
        };
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(payload) }],
            structuredContent: payload,
            isError: !testResult.executed
          }
        };
      }

      if (toolName === "kb_search") {
        const parsed = KbSearchMcpArgsSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Invalid kb_search arguments: ${parsed.error.message}` }
          };
        }
        const kbResult = await searchFn({
          userId: parsed.data.userId || null,
          question: parsed.data.query,
          language: parsed.data.language
        });
        const payload = {
          tool: "kb_search",
          matches: kbResult.matches || [],
          threshold: kbResult.threshold,
          accuracyClaim: null,
          disclaimer: MCP_SERVER_INFO.disclaimer
        };
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(payload) }],
            structuredContent: payload,
            isError: false
          }
        };
      }

      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown MCP tool '${toolName}'` }
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Unsupported MCP method '${request.method}'` }
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: err?.message || "Internal MCP server error" }
    };
  }
}

// Start stdio transport only when invoked directly as a CLI entrypoint
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const req = JSON.parse(trimmed);
      const res = await handleMcpJsonRpcRequest(req);
      process.stdout.write(`${JSON.stringify(res)}\n`);
    } catch {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`
      );
    }
  });
}
