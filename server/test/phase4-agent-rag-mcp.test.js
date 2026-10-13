/**
 * Phase 4 Unit & Integration Tests: Agent, Official Docs RAG, and Optional MCP Server
 * Tests:
 * 1. Official language & library docs (Python, cppreference, Java SE, MDN) cite doc + section
 * 2. Below relevance threshold returns no evidence (matches: [])
 * 3. toolCallingAgent remains flagged (f_agent) and its kb_search tool cites doc + section
 * 4. Optional MCP server exposes run_code, run_tests, and kb_search with no accuracy claims
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  OFFICIAL_LANGUAGE_DOCS,
  searchOfficialLanguageDocs,
  searchDocsAndNotes
} from "../kb/knowledgeBase.js";
import { executeAgentTool } from "../pipeline/toolCallingAgent.js";
import { buildUserMessage } from "../pipeline/buildUserMessage.js";
import { handleMcpJsonRpcRequest, MCP_TOOLS, MCP_SERVER_INFO } from "../mcp/server.js";

test("Phase 4.1: Official language & library docs (Python, cppreference, Java SE, MDN) cite doc + section", async () => {
  const languages = new Set(OFFICIAL_LANGUAGE_DOCS.map((d) => d.language));
  assert.ok(languages.has("python"), "Must include Python stdlib docs");
  assert.ok(languages.has("cpp"), "Must include cppreference C++ docs");
  assert.ok(languages.has("c"), "Must include cppreference C docs");
  assert.ok(languages.has("java"), "Must include Java SE API docs");
  assert.ok(languages.has("javascript"), "Must include MDN JavaScript docs");

  // Python deque query cites doc + section
  const pyRes = await searchDocsAndNotes({
    question: "Why use collections.deque popleft instead of list.pop(0) for BFS queue in Python?",
    language: "python"
  });
  assert.ok(pyRes.matches.length >= 1);
  assert.match(pyRes.matches[0].doc, /Python 3\.12 Standard Library/);
  assert.match(pyRes.matches[0].section, /collections\.deque/);

  // cppreference priority_queue query cites doc + section
  const cppRes = await searchDocsAndNotes({
    question: "How to declare a min-heap using std::priority_queue and std::greater in C++?",
    language: "cpp"
  });
  assert.ok(cppRes.matches.length >= 1);
  assert.match(cppRes.matches[0].doc, /cppreference/);
  assert.match(cppRes.matches[0].section, /std::priority_queue/);

  // Java SE ArrayDeque query cites doc + section
  const javaRes = await searchDocsAndNotes({
    question: "Time complexity of java.util.ArrayDeque pollFirst and PriorityQueue offer in Java",
    language: "java"
  });
  assert.ok(javaRes.matches.length >= 1);
  assert.match(javaRes.matches[0].doc, /Java SE 17 API Specification/);
  assert.match(javaRes.matches[0].section, /ArrayDeque/);

  // MDN Array.prototype.sort query cites doc + section
  const mdnRes = await searchDocsAndNotes({
    question: "Why does JavaScript Array.prototype.sort sort numbers lexicographically in UTF-16 order?",
    language: "javascript"
  });
  assert.ok(mdnRes.matches.length >= 1);
  assert.match(mdnRes.matches[0].doc, /MDN Web Docs/);
  assert.match(mdnRes.matches[0].section, /Array\.prototype\.sort/);

  // Verify buildUserMessage formats doc + section citation cleanly
  const prompt = buildUserMessage({
    question: "Explain deque popleft complexity.",
    sources: [pyRes.matches[0]]
  });
  assert.match(prompt, /COURSE NOTES: Python 3\.12 Standard Library.*— Section: collections\.deque/);
});

test("Phase 4.2: Queries below the relevance threshold return no evidence (matches: [])", async () => {
  const irrelevant = searchOfficialLanguageDocs({
    question: "Photosynthesis Calvin cycle chlorophyll thylakoid membrane",
    language: "python",
    minScore: 0.22
  });
  assert.deepEqual(irrelevant.matches, [], "Irrelevant query below threshold must return empty matches");

  const combinedIrrelevant = await searchDocsAndNotes({
    question: "Medieval European feudalism agricultural manor system",
    language: ""
  });
  assert.deepEqual(combinedIrrelevant.matches, []);
});

test("Phase 4.3: toolCallingAgent kb_search tool retrieves official docs citing doc + section and returns empty below threshold", async () => {
  const sources = [];
  const res = await executeAgentTool(
    "kb_search",
    { query: "Python heapq heappush heappop min-heap priority queue" },
    { questionType: "CODING", userId: null, sources }
  );
  assert.equal(res.ok, true);
  assert.ok(sources.length >= 1);
  assert.match(sources[0].doc, /Python 3\.12 Standard Library/);
  assert.match(sources[0].section, /heapq/);

  const emptySources = [];
  const emptyRes = await executeAgentTool(
    "kb_search",
    { query: "Mitochondrial oxidative phosphorylation electron transport chain" },
    { questionType: "MCQ", userId: null, sources: emptySources }
  );
  assert.equal(emptyRes.ok, true);
  assert.equal(emptySources.length, 0);
});

test("Phase 4.4: Optional MCP server exposes run_code, run_tests, and kb_search with no accuracy claims", async () => {
  // 1. initialize
  const initRes = await handleMcpJsonRpcRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize"
  });
  assert.equal(initRes.result.serverInfo.name, MCP_SERVER_INFO.name);
  assert.match(initRes.result.serverInfo.disclaimer, /no accuracy claims/i);

  // 2. tools/list
  const listRes = await handleMcpJsonRpcRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list"
  });
  const toolNames = listRes.result.tools.map((t) => t.name);
  assert.deepEqual(toolNames, ["run_code", "run_tests", "kb_search"]);
  assert.equal(MCP_TOOLS.length, 3);

  // 3. tools/call -> run_code
  const runCodeRes = await handleMcpJsonRpcRequest(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "run_code",
        arguments: {
          language: "python",
          code: "print(21 * 2)",
          stdin: "",
          timeoutSeconds: 1.5
        }
      }
    },
    {
      executeFn: async () => ({
        executed: true,
        success: true,
        stdout: "42\n",
        stderr: "",
        exitCode: 0,
        runtimeMs: 12.4,
        memoryKb: 4096
      })
    }
  );
  assert.equal(runCodeRes.result.isError, false);
  assert.equal(runCodeRes.result.structuredContent.executed, true);
  assert.equal(runCodeRes.result.structuredContent.stdout.trim(), "42");
  assert.equal(runCodeRes.result.structuredContent.accuracyClaim, null);

  // 4. tools/call -> run_tests
  const runTestsRes = await handleMcpJsonRpcRequest(
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "run_tests",
        arguments: {
          language: "python",
          code: "import sys\nprint(int(sys.stdin.read()) * 2)",
          sampleTests: [
            { stdin: "5", expectedOutput: "10" },
            { stdin: "7", expectedOutput: "14" }
          ]
        }
      }
    },
    {
      executeFn: async ({ stdin }) => ({
        executed: true,
        success: true,
        stdout: String(Number(stdin) * 2),
        stderr: "",
        exitCode: 0,
        runtimeMs: 9.1,
        memoryKb: 3800
      })
    }
  );
  assert.equal(runTestsRes.result.isError, false);
  assert.equal(runTestsRes.result.structuredContent.passedTests, 2);
  assert.equal(runTestsRes.result.structuredContent.totalTests, 2);
  assert.equal(runTestsRes.result.structuredContent.accuracyClaim, null);

  // 5. tools/call -> kb_search
  const kbRes = await handleMcpJsonRpcRequest({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "kb_search",
      arguments: {
        query: "bisect_left binary search sorted sequence in Python",
        language: "python"
      }
    }
  });
  assert.equal(kbRes.result.isError, false);
  assert.ok(kbRes.result.structuredContent.matches.length >= 1);
  assert.match(kbRes.result.structuredContent.matches[0].section, /bisect/);
  assert.equal(kbRes.result.structuredContent.accuracyClaim, null);
});
