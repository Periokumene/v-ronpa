import { describe, expect, it } from "vitest";
import {
  GAME_A_TEST_CHARACTER_VITE_MODE,
  GAME_A_TEST_SMOKE_VITE_MODE,
  resolveGameANaniDevtoolsProject,
  resolveGameAViteCacheDir
} from "./vite.config";
import gameANaniConfig from "./nani.config.mjs";

describe("game-a Vite config", () => {
  it("uses the canonical physical scope directories without changing logical catalog roots", () => {
    expect(gameANaniConfig.scopes).toEqual({
      production: {
        sourceRoot: "apps/game-a/src/nani",
        scriptRoot: "game-a"
      },
      development: {
        sourceRoot: "apps/game-a/src/nani-dev",
        scriptRoot: "game-a/dev"
      },
      test: {
        sourceRoot: "apps/game-a/src/nani-test",
        scriptRoot: "game-a/test"
      }
    });
  });

  it("selects the production+development union by default", () => {
    expect(resolveGameANaniDevtoolsProject("development")).toMatchObject({
      entry: { id: "vn:game-a-main", initialScriptPath: "game-a/opening.nani" },
      scopes: ["production", "development"]
    });
  });

  it("selects different explicit entries over one shared test scope", () => {
    expect(resolveGameANaniDevtoolsProject(GAME_A_TEST_SMOKE_VITE_MODE)).toMatchObject({
      entry: { id: "vn:game-a-test-smoke", initialScriptPath: "game-a/test/smoke.nani" },
      scopes: ["test"]
    });
    expect(resolveGameANaniDevtoolsProject(GAME_A_TEST_CHARACTER_VITE_MODE)).toMatchObject({
      entry: { id: "vn:game-a-test-character", initialScriptPath: "game-a/test/character-smoke.nani" },
      scopes: ["test"]
    });
  });

  it("isolates optimize-deps caches for concurrently running modes", () => {
    expect(resolveGameAViteCacheDir(GAME_A_TEST_SMOKE_VITE_MODE))
      .not.toBe(resolveGameAViteCacheDir(GAME_A_TEST_CHARACTER_VITE_MODE));
    expect(resolveGameAViteCacheDir("preview/local")).toBe("node_modules/.vite-game-a-preview-local");
  });
});
