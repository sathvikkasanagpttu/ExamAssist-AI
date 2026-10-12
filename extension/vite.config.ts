import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "@examassist/shared": path.resolve(__dirname, "../shared/schemas.js")
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        content: path.resolve(__dirname, "src/content.ts"),
        sidepanel: path.resolve(__dirname, "src/sidepanel/main.tsx"),
        "service-worker": path.resolve(__dirname, "src/service-worker.ts"),
        popup: path.resolve(__dirname, "src/popup.ts"),
        options: path.resolve(__dirname, "src/options.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
