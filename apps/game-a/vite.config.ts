import { defineConfig, searchForWorkspaceRoot, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

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
  const port = Number(process.env.VITE_DEV_PORT ?? process.env.PORT ?? 5174);
  return {
    plugins: [react(), gameANaniFullReloadPlugin()],
    server: {
      host: "127.0.0.1",
      port,
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd())]
      }
    },
    preview: {
      host: "127.0.0.1",
      port
    },
    define: {
      __DEV_MODE__: JSON.stringify(mode === "development")
    }
  };
});
