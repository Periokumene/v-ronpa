import { defineConfig, searchForWorkspaceRoot, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolveWorktreeAppRuntimeEnv } from "../../scripts/worktree-env.mjs";

export function gameANaniFullReloadPlugin(): Plugin {
  return {
    name: "game-a-nani-full-reload",
    apply: "serve",
    handleHotUpdate(ctx) {
      if (!ctx.file.endsWith(".nani")) return;
      ctx.server.ws.send({ type: "full-reload" });
      return [];
    }
  };
}

export default defineConfig(({ mode }) => {
  const runtimeEnv = resolveWorktreeAppRuntimeEnv("game-a");
  return {
    plugins: [react(), gameANaniFullReloadPlugin()],
    server: {
      host: "127.0.0.1",
      port: runtimeEnv.port,
      strictPort: true,
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd())]
      }
    },
    preview: {
      host: "127.0.0.1",
      port: runtimeEnv.port,
      strictPort: true
    },
    define: {
      __DEV_MODE__: JSON.stringify(mode === "development")
    }
  };
});
