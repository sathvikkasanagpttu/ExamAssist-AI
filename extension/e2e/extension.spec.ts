import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(__dirname, "..");
const fixturesDir = path.join(__dirname, "fixtures");
const contentBundlePath = path.join(extensionRoot, "dist", "content.js");

let fixtureServer: ReturnType<typeof http.createServer>;
let baseUrl = "";
let streamHoldMode = false;
let errorMode: "none" | "AI_NOT_CONFIGURED" | "AI_RATE_LIMITED" = "none";

test.beforeAll(async () => {
  fixtureServer = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Local-User-Id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (url.pathname.startsWith("/fixtures/")) {
      const file = path.join(fixturesDir, path.basename(url.pathname));
      if (fs.existsSync(file)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(file, "utf8"));
        return;
      }
    }

    if (url.pathname === "/api/assessment/analyze/stream" && req.method === "POST") {
      if (errorMode === "AI_NOT_CONFIGURED") {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: "AI_NOT_CONFIGURED", error: "No AI API key configured. Add OPENAI_API_KEY in server/.env" }));
        return;
      }
      if (errorMode === "AI_RATE_LIMITED") {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: "AI_RATE_LIMITED", error: "Rate limit exceeded (429)." }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      res.write(`event: progress\ndata: ${JSON.stringify({ stage: "classifying" })}\n\n`);
      res.write(`event: progress\ndata: ${JSON.stringify({ stage: "solving" })}\n\n`);

      if (streamHoldMode) {
        // Keep stream open until client aborts
        req.on("close", () => {
          res.end();
        });
        return;
      }

      setTimeout(() => {
        res.write(
          `event: done\ndata: ${JSON.stringify({
            question: "Mock analyzed question",
            questionType: "MCQ",
            subject: "Computer Science",
            topic: "Algorithms",
            difficulty: "Intermediate",
            directAnswer: { option: "B", text: "O(log n)" },
            confidence: "HIGH",
            confidenceReason: "Balanced BST height is logarithmic.",
            explanation: "An AVL tree maintains O(log n) height, so search takes O(log n) worst-case time.",
            reasoningSteps: ["Check height balance property", "Conclude O(log n)"],
            optionAnalysis: [],
            verification: { status: "SUPPORTED", supported: [], conflicting: [], unsupported: [] },
            sources: [],
            retrievalTimestamp: new Date().toISOString()
          })}\n\n`
        );
        res.end();
      }, 60);
      return;
    }

    if (url.pathname === "/api/code/hint" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}") as { level?: number };
        const lvl = Number(parsed.level || 1);
        const hintMap: Record<number, string> = {
          1: "Level 1 Conceptual Nudge: Use two pointers or dynamic programming.",
          2: "Level 2 Approach: Track state transitions from i-1 and i-2.",
          3: "Level 3 Pseudocode: dp[i] = dp[i-1] + dp[i-2]",
          4: "Level 4 Full Solution: def solve(n):\n    return n"
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            level: lvl,
            activeHint: hintMap[lvl],
            hints: {
              level1: lvl === 1 ? hintMap[1] : null,
              level2: lvl === 2 ? hintMap[2] : null,
              level3: lvl === 3 ? hintMap[3] : null,
              level4: lvl === 4 ? hintMap[4] : null
            }
          })
        );
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) => {
    fixtureServer.listen(0, "127.0.0.1", () => {
      const addr = fixtureServer.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
});

async function injectExtensionIntoFixture(page: import("@playwright/test").Page) {
  await page.evaluate((mockApiBase: string) => {
    (window as unknown as { __EXAMASSIST_E2E__: boolean }).__EXAMASSIST_E2E__ = true;
    const store: Record<string, unknown> = {
      apiBase: mockApiBase,
      showFloatingButton: true,
      autoAnswerOnCopy: false,
      enableAllSites: false,
      allowedSites: ["127.0.0.1", "localhost"],
      theme: "dark",
      mode: "Practice Mode",
      localUserId: "e2e-user-1"
    };
    (window as unknown as { chrome: unknown }).chrome = {
      runtime: {
        id: "e2e-extension-id",
        onMessage: { addListener: () => {} }
      },
      storage: {
        local: {
          get: async (defaults: Record<string, unknown>) => ({ ...defaults, ...store }),
          set: async (items: Record<string, unknown>) => {
            Object.assign(store, items);
          }
        }
      }
    };
  }, baseUrl);

  await page.addScriptTag({ path: contentBundlePath });
}

test("1. Monaco fixture: extracts problem & code read-only, streams inside Shadow DOM, and supports lazy 4-level hint ladder", async ({
  page
}) => {
  streamHoldMode = false;
  errorMode = "none";
  await page.goto(`${baseUrl}/fixtures/monaco.html`);
  await injectExtensionIntoFixture(page);

  const monacoBefore = await page.locator("#host-monaco").innerHTML();

  const extracted = await page.evaluate(() => {
    return window.__EXAMASSIST_TEST_API__!.extractCodingProblem(document);
  });
  expect(extracted.platform).toBe("HackerRank");
  expect(extracted.title).toBe("Two Sum in Sorted Array");
  expect(extracted.editor?.adapter).toBe("MonacoAdapter");
  expect(extracted.starterCode).toContain("def two_sum(numbers, target):");

  // Open Shadow DOM panel and stream analysis
  await page.evaluate((prob) => {
    window.__EXAMASSIST_TEST_API__!.openInPageOverlayAndAnalyze({
      success: true,
      question: prob.statement,
      options: [],
      mathFormula: "",
      codeSnippet: prob.starterCode,
      tableData: "",
      sourceAdapter: "MonacoAdapter"
    });
  }, extracted);

  const shadowHost = page.locator("#examai-shadow-host");
  await expect(shadowHost).toBeAttached();
  await expect(page.locator("#examai-direct-answer")).toContainText("B. O(log n)");

  // Verify hint ladder laziness: Level 4 is NOT in the DOM before clicking Level 4
  await page.locator('[data-hint-level="1"]').click();
  await expect(page.locator("#examai-hint-output")).toContainText("Level 1 Conceptual Nudge");
  await expect(page.locator("#examai-hint-output")).not.toContainText("Level 4 Full Solution");

  await page.locator('[data-hint-level="4"]').click();
  await expect(page.locator("#examai-hint-output")).toContainText("Level 4 Full Solution");

  // Verify host Monaco editor DOM was never modified
  const monacoAfter = await page.locator("#host-monaco").innerHTML();
  expect(monacoAfter).toBe(monacoBefore);
});

test("2. CodeMirror 6 fixture: extracts JS code read-only and supports streaming cancel", async ({ page }) => {
  streamHoldMode = true;
  errorMode = "none";
  await page.goto(`${baseUrl}/fixtures/codemirror.html`);
  await injectExtensionIntoFixture(page);

  const cmBefore = await page.locator("#host-codemirror").innerHTML();
  const extracted = await page.evaluate(() => window.__EXAMASSIST_TEST_API__!.extractCodingProblem(document));
  expect(extracted.platform).toBe("LeetCode");
  expect(extracted.title).toBe("Climbing Stairs");
  expect(extracted.editor?.adapter).toBe("CodeMirror6Adapter");
  expect(extracted.language).toBe("javascript");
  expect(extracted.starterCode).toContain("function climbStairs(n)");

  await page.evaluate((prob) => {
    window.__EXAMASSIST_TEST_API__!.openInPageOverlayAndAnalyze({
      success: true,
      question: prob.statement,
      options: [],
      mathFormula: "",
      codeSnippet: prob.starterCode,
      tableData: "",
      sourceAdapter: "CodeMirror6Adapter"
    });
  }, extracted);

  // While streaming is held open, Cancel button should be visible
  const cancelBtn = page.locator("#examai-cancel-stream");
  await expect(cancelBtn).toBeVisible();
  await cancelBtn.click();

  await expect(page.locator("#examai-error-banner")).toContainText("Analysis Cancelled");
  expect(await page.locator("#host-codemirror").innerHTML()).toBe(cmBefore);
});

test("3. Plain textarea fixture: extracts SQL code read-only and renders typed error states", async ({ page }) => {
  streamHoldMode = false;
  errorMode = "AI_NOT_CONFIGURED";
  await page.goto(`${baseUrl}/fixtures/textarea.html`);
  await injectExtensionIntoFixture(page);

  const extracted = await page.evaluate(() => window.__EXAMASSIST_TEST_API__!.extractCodingProblem(document));
  expect(extracted.editor?.adapter).toBe("TextareaAdapter");
  expect(extracted.language).toBe("sql");
  expect(extracted.starterCode).toContain("SELECT department_id, AVG(salary)");

  await page.evaluate((prob) => {
    window.__EXAMASSIST_TEST_API__!.openInPageOverlayAndAnalyze({
      success: true,
      question: prob.statement,
      options: [],
      mathFormula: "",
      codeSnippet: prob.starterCode,
      tableData: "",
      sourceAdapter: "TextareaAdapter"
    });
  }, extracted);

  const errorBanner = page.locator("#examai-error-banner");
  await expect(errorBanner).toBeVisible();
  await expect(errorBanner).toHaveAttribute("data-error-code", "AI_NOT_CONFIGURED");
  await expect(errorBanner).toContainText("AI Key Not Configured");

  // Verify textarea value was never altered
  await expect(page.locator("#code-editor")).toHaveValue(
    "SELECT department_id, AVG(salary) AS avg_salary FROM employees GROUP BY department_id HAVING AVG(salary) > 60000;"
  );
});

test("4. Moodle quiz fixture: extracts MCQ question & options, streams answer, and enforces Authorized Assessment Mode gate", async ({
  page
}) => {
  streamHoldMode = false;
  errorMode = "none";
  await page.goto(`${baseUrl}/fixtures/moodle.html`);
  await injectExtensionIntoFixture(page);

  await page.evaluate(() => {
    const qEl = document.getElementById("moodle-qtext")!;
    const range = document.createRange();
    range.selectNodeContents(qEl);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  const floatBtn = page.locator("#examai-floating-btn");
  await expect(floatBtn).toBeVisible();
  await floatBtn.click();

  await expect(page.locator("#examai-direct-answer")).toContainText("B. O(log n)");

  // Switch to Authorized Assessment Mode and verify full solution is gated until explicit click
  await page.locator("#examai-mode-select").selectOption("Authorized Assessment Mode");
  await expect(page.locator("#examai-auth-gate")).toBeVisible();
  await expect(page.locator("#examai-direct-answer")).toHaveCount(0);

  await page.locator("#examai-reveal-auth-sol").click();
  await expect(page.locator("#examai-direct-answer")).toContainText("B. O(log n)");
});
