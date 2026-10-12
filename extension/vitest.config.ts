import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@examassist/shared": path.resolve(__dirname, "../shared/schemas.js")
    }
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"]
  }
});
