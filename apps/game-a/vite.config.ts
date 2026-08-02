import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { createNaniDevtoolsVitePlugin } from "@v-ronpa/app-vn-devtools/vite";
import { resolveWorktreeAppRuntimeEnv } from "../../scripts/worktree-env.mjs";
import gameAAssetConfig from "./asset.config.mjs";

export const GAME_A_TEST_SMOKE_VITE_MODE = "game-a-test-smoke";
export const GAME_A_TEST_CHARACTER_VITE_MODE = "game-a-test-character";

export function resolveGameAViteCacheDir(mode: string): string {
  const safeMode = mode.replace(/[^a-zA-Z0-9_-]/gu, "-");
  return `node_modules/.vite-game-a-${safeMode}`;
}

export function resolveGameANaniDevtoolsProject(mode: string) {
  if (mode === GAME_A_TEST_SMOKE_VITE_MODE) {
    return { entry: gameAAssetConfig.naniProject.testEntries.smoke, scopes: ["test"] as const };
  }
  if (mode === GAME_A_TEST_CHARACTER_VITE_MODE) {
    return { entry: gameAAssetConfig.naniProject.testEntries.character, scopes: ["test"] as const };
  }
  return {
    entry: gameAAssetConfig.naniProject.mainEntry,
    scopes: ["production", "development"] as const
  };
}

export default defineConfig(({ command, mode }) => {
  const runtimeEnv = resolveWorktreeAppRuntimeEnv("game-a");
  const nani = resolveGameANaniDevtoolsProject(mode);
  const scopes = command === "build" && !mode.startsWith("game-a-test-")
    ? (["production"] as const)
    : nani.scopes;
  return {
    cacheDir: resolveGameAViteCacheDir(mode),
    plugins: [
      react(),
      createNaniDevtoolsVitePlugin({
        project: gameAAssetConfig.naniProject,
        entry: nani.entry,
        scopes,
        root: fileURLToPath(new URL("../../", import.meta.url))
      })
    ],
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
    }
  };
});
