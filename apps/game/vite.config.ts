import { resolveWorktreeRuntimeEnv } from "../../scripts/worktree-env.mjs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const runtimeEnv = resolveWorktreeRuntimeEnv();

export default defineConfig({
  plugins: [react()],
  server: {
    port: runtimeEnv.port,
    strictPort: true
  },
  preview: {
    port: runtimeEnv.port,
    strictPort: true
  }
});
