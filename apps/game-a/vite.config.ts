import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { createNaniDevtoolsVitePlugin } from "@v-ronpa/app-vn-devtools/vite";
import { resolveWorktreeAppRuntimeEnv } from "../../scripts/worktree-env.mjs";
import gameAAssetConfig from "./asset.config.mjs";

export const GAME_A_SMOKE_VITE_MODE = "game-a-smoke";
export const GAME_A_CHARACTER_SMOKE_VITE_MODE = "game-a-character-smoke";

export function resolveGameAViteCacheDir(mode: string): string {
  const safeMode = mode.replace(/[^a-zA-Z0-9_-]/gu, "-");
  return `node_modules/.vite-game-a-${safeMode}`;
}

export function resolveGameAStoryDefinitionModule(mode: string): string {
  const modulePath = mode === GAME_A_SMOKE_VITE_MODE
    ? "./src/gameASmokeStoryDefinition.ts"
    : mode === GAME_A_CHARACTER_SMOKE_VITE_MODE
      ? "./src/gameACharacterSmokeStoryDefinition.ts"
      : "./src/gameAScripts.ts";
  return fileURLToPath(new URL(modulePath, import.meta.url));
}

export function resolveGameANaniDevtoolsEntries(mode: string) {
  const smokeIndex = mode === GAME_A_CHARACTER_SMOKE_VITE_MODE ? 1 : 0;
  const scripts = mode === GAME_A_SMOKE_VITE_MODE || mode === GAME_A_CHARACTER_SMOKE_VITE_MODE
    ? [gameAAssetConfig.testScripts[smokeIndex]]
    : gameAAssetConfig.scripts;
  const entryId = mode === GAME_A_SMOKE_VITE_MODE
    ? "vn:game-a-test-smoke"
    : mode === GAME_A_CHARACTER_SMOKE_VITE_MODE
      ? "vn:game-a-test-character"
      : "vn:game-a-main";
  return scripts.flatMap((script) => script
    ? [{
        sourceFile: fileURLToPath(new URL(`../../${script.sourceFile}`, import.meta.url)),
        scriptPath: script.scriptPath,
        entryId
      }]
    : []);
}

export default defineConfig(({ mode }) => {
  const runtimeEnv = resolveWorktreeAppRuntimeEnv("game-a");
  return {
    // Playwright starts the VN and character smoke modes together. Vite's
    // optimize-deps hashes are process-local, so sharing the default cache can
    // otherwise produce transient `504 Outdated Optimize Dep` responses.
    cacheDir: resolveGameAViteCacheDir(mode),
    plugins: [react(), createNaniDevtoolsVitePlugin({ entries: resolveGameANaniDevtoolsEntries(mode) })],
    resolve: {
      alias: [
        {
          find: /^\.\/gameAScripts$/u,
          replacement: resolveGameAStoryDefinitionModule(mode)
        }
      ]
    },
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
