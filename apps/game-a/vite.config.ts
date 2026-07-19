import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { createNaniDevtoolsVitePlugin } from "@v-ronpa/app-vn-devtools/vite";
import { resolveWorktreeAppRuntimeEnv } from "../../scripts/worktree-env.mjs";

export const GAME_A_SMOKE_VITE_MODE = "game-a-smoke";
export const GAME_A_CHARACTER_SMOKE_VITE_MODE = "game-a-character-smoke";

export function resolveGameAViteCacheDir(mode: string): string {
  const safeMode = mode.replace(/[^a-zA-Z0-9_-]/gu, "-");
  return `node_modules/.vite-game-a-${safeMode}`;
}

export function resolveGameALaunchDefinitionModule(mode: string): string {
  const modulePath = mode === GAME_A_SMOKE_VITE_MODE
    ? "./src/gameASmokeLaunchDefinition.ts"
    : mode === GAME_A_CHARACTER_SMOKE_VITE_MODE
      ? "./src/gameACharacterSmokeLaunchDefinition.ts"
      : "./src/gameALaunchDefinition.ts";
  return fileURLToPath(new URL(modulePath, import.meta.url));
}

export function resolveGameANaniDevtoolsEntry(mode: string) {
  if (mode === GAME_A_SMOKE_VITE_MODE) {
    return {
      sourceFile: fileURLToPath(new URL("./src/test-nani/smoke.nani", import.meta.url)),
      scriptPath: "game-a/test/smoke.nani",
      entryId: "vn:game-a-test-smoke"
    };
  }
  if (mode === GAME_A_CHARACTER_SMOKE_VITE_MODE) {
    return {
      sourceFile: fileURLToPath(new URL("./src/test-nani/character-smoke.nani", import.meta.url)),
      scriptPath: "game-a/test/character-smoke.nani",
      entryId: "vn:game-a-test-character"
    };
  }
  return {
    sourceFile: fileURLToPath(new URL("./src/nani/opening.nani", import.meta.url)),
    scriptPath: "game-a/opening.nani",
    entryId: "vn:game-a-opening"
  };
}

export default defineConfig(({ mode }) => {
  const runtimeEnv = resolveWorktreeAppRuntimeEnv("game-a");
  return {
    // Playwright starts the VN and character smoke modes together. Vite's
    // optimize-deps hashes are process-local, so sharing the default cache can
    // otherwise produce transient `504 Outdated Optimize Dep` responses.
    cacheDir: resolveGameAViteCacheDir(mode),
    plugins: [react(), createNaniDevtoolsVitePlugin({ entries: [resolveGameANaniDevtoolsEntry(mode)] })],
    resolve: {
      alias: [
        {
          find: /^\.\/gameALaunchDefinition$/u,
          replacement: resolveGameALaunchDefinitionModule(mode)
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
