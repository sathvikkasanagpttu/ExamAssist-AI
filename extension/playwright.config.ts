import { defineConfig } from "@playwright/test";
import fs from "node:fs";

const hasSystemChrome = fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    headless: true,
    ...(hasSystemChrome ? { channel: "chrome" } : {})
  },
  reporter: "list"
});
