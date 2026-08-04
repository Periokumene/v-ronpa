import { resolveWorktreeAppRuntimeEnv } from "../../scripts/worktree-env.mjs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { createAssetProjectVitePlugin } from "@v-ronpa/asset-project/vite";
import harnessAssetConfig from "./asset.config.mjs";

const runtimeEnv = resolveWorktreeAppRuntimeEnv("game-harness");

export default defineConfig({
  publicDir: false,
  build: { assetsDir: "_bundle" },
  plugins: [react(), createAssetProjectVitePlugin(harnessAssetConfig)],
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
