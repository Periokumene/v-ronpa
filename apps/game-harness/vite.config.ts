import { resolveWorktreeRuntimeEnv } from "../../scripts/worktree-env.mjs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const runtimeEnv = resolveWorktreeRuntimeEnv();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@v-ronpa/asset-registry": fileURLToPath(new URL("../../packages/asset-registry/src/index.ts", import.meta.url))
    }
  },
  server: {
    port: runtimeEnv.port,
    strictPort: true
  },
  preview: {
    port: runtimeEnv.port,
    strictPort: true
  }
});
