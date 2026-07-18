import { describe, expect, it } from "vitest";
import {
  GAME_A_CHARACTER_SMOKE_VITE_MODE,
  GAME_A_SMOKE_VITE_MODE,
  resolveGameANaniDevtoolsEntry,
  resolveGameALaunchDefinitionModule,
  resolveGameAViteCacheDir
} from "./vite.config";

describe("game-a Vite config", () => {
  it("selects the smoke entry only for the dedicated Playwright server mode", () => {
    expect(resolveGameALaunchDefinitionModule(GAME_A_SMOKE_VITE_MODE))
      .toMatch(/\/src\/gameASmokeLaunchDefinition\.ts$/u);
    expect(resolveGameALaunchDefinitionModule(GAME_A_CHARACTER_SMOKE_VITE_MODE))
      .toMatch(/\/src\/gameACharacterSmokeLaunchDefinition\.ts$/u);
  });

  it("configures exactly the active Nani source for the devtools update bridge", () => {
    expect(resolveGameANaniDevtoolsEntry("development")).toMatchObject({
      entryId: "vn:game-a-opening",
      scriptPath: "game-a/opening.nani"
    });
    expect(resolveGameANaniDevtoolsEntry("development").sourceFile).toMatch(/\/src\/nani\/opening\.nani$/u);
    expect(resolveGameANaniDevtoolsEntry(GAME_A_SMOKE_VITE_MODE)).toMatchObject({
      entryId: "vn:game-a-test-smoke",
      scriptPath: "game-a/test/smoke.nani"
    });
    expect(resolveGameANaniDevtoolsEntry(GAME_A_SMOKE_VITE_MODE).sourceFile)
      .toMatch(/\/src\/test-nani\/smoke\.nani$/u);
    expect(resolveGameANaniDevtoolsEntry(GAME_A_CHARACTER_SMOKE_VITE_MODE)).toMatchObject({
      entryId: "vn:game-a-test-character",
      scriptPath: "game-a/test/character-smoke.nani"
    });
  });

  it("isolates optimize-deps caches for concurrently running modes", () => {
    expect(resolveGameAViteCacheDir(GAME_A_SMOKE_VITE_MODE))
      .not.toBe(resolveGameAViteCacheDir(GAME_A_CHARACTER_SMOKE_VITE_MODE));
    expect(resolveGameAViteCacheDir("preview/local"))
      .toBe("node_modules/.vite-game-a-preview-local");
  });

  it.each(["development", "production", "test", "smoke"])(
    "keeps the canonical opening entry for the %s mode",
    (mode) => {
      expect(resolveGameALaunchDefinitionModule(mode)).toMatch(/\/src\/gameALaunchDefinition\.ts$/u);
    }
  );
});
