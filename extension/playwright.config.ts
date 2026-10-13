import { defineConfig } from "@playwright/test";
import fs from "node:fs";

const isMac = process.platform === "darwin";
const hasSystemChrome = isMac && fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    headless: true,
    ...(hasSystemChrome && !process.env.CI ? { channel: "chrome" } : {})
  },
  reporter: "list"
});
