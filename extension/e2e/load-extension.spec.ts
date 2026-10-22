import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pathToExtension = path.resolve(__dirname, "../dist");
const fixturesDir = path.resolve(__dirname, "fixtures");

test.describe("Extension Distribution (--load-extension)", () => {
  let server: ReturnType<typeof http.createServer>;
  let serverUrl = "";

  test.beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const file = path.join(fixturesDir, path.basename(url.pathname));
      if (fs.existsSync(file)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(file, "utf8"));
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("loads dist via --load-extension, verifies content script runs on fixture, and side panel works", async () => {
    const tmpUserData = path.join(__dirname, `../.tmp-user-data-${Date.now()}`);
    const context = await chromium.launchPersistentContext(tmpUserData, {
      headless: false,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        "--headless=new",
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ]
    });

    try {
      // 1. Open fixture page and verify content script auto-injected by Chrome
      const page = await context.newPage();
      await page.goto(`${serverUrl}/monaco.html`);
      await expect(page.locator("html[data-examassist-loaded='true']")).toBeAttached({ timeout: 10000 });

      // 2. Obtain service worker / extension ID
      const workers = context.serviceWorkers();
      let worker = workers.length > 0 ? workers[0] : undefined;
      if (!worker) {
        worker = await context.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => undefined);
      }

      let extensionId = worker ? worker.url().split("/")[2] : "";

      // 3. Open extension side panel and verify it renders
      const sidepanelPage = await context.newPage();
      if (extensionId) {
        await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      } else {
        await sidepanelPage.goto(`file://${pathToExtension}/sidepanel.html`);
      }
      await expect(sidepanelPage.locator(".header")).toBeVisible({ timeout: 10000 });
      await expect(sidepanelPage.locator(".brand")).toContainText("ExamAssist");
      const sidepanelTitle = await sidepanelPage.title();
      expect(sidepanelTitle).toContain("ExamAssist");
    } finally {
      await context.close();
      if (fs.existsSync(tmpUserData)) {
        fs.rmSync(tmpUserData, { recursive: true, force: true });
      }
    }
  });
});
