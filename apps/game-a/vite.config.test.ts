import { describe, expect, it } from "vitest";
import {
  GAME_A_CHARACTER_SMOKE_VITE_MODE,
  GAME_A_SMOKE_VITE_MODE,
  resolveGameANaniDevtoolsEntries,
  resolveGameAStoryDefinitionModule,
  resolveGameAViteCacheDir
} from "./vite.config";

describe("game-a Vite config", () => {
  it("selects isolated smoke story modules only for their Playwright modes", () => {
    expect(resolveGameAStoryDefinitionModule(GAME_A_SMOKE_VITE_MODE))
      .toMatch(/\/src\/gameASmokeStoryDefinition\.ts$/u);
    expect(resolveGameAStoryDefinitionModule(GAME_A_CHARACTER_SMOKE_VITE_MODE))
      .toMatch(/\/src\/gameACharacterSmokeStoryDefinition\.ts$/u);
    expect(resolveGameAStoryDefinitionModule("development")).toMatch(/\/src\/gameAScripts\.ts$/u);
  });

  it("configures all production scripts and exactly one test script in smoke modes", () => {
    expect(resolveGameANaniDevtoolsEntries("development")).toEqual(expect.arrayContaining([
      expect.objectContaining({ entryId: "vn:game-a-main", scriptPath: "game-a/opening.nani" }),
      expect.objectContaining({ entryId: "vn:game-a-main", scriptPath: "game-a/chapter-02.nani" })
    ]));
    expect(resolveGameANaniDevtoolsEntries("development")).toHaveLength(2);
    expect(resolveGameANaniDevtoolsEntries(GAME_A_SMOKE_VITE_MODE)).toEqual([
      expect.objectContaining({ entryId: "vn:game-a-test-smoke", scriptPath: "game-a/test/smoke.nani" })
    ]);
    expect(resolveGameANaniDevtoolsEntries(GAME_A_CHARACTER_SMOKE_VITE_MODE)).toEqual([
      expect.objectContaining({ entryId: "vn:game-a-test-character", scriptPath: "game-a/test/character-smoke.nani" })
    ]);
  });

  it("isolates optimize-deps caches for concurrently running modes", () => {
    expect(resolveGameAViteCacheDir(GAME_A_SMOKE_VITE_MODE))
      .not.toBe(resolveGameAViteCacheDir(GAME_A_CHARACTER_SMOKE_VITE_MODE));
    expect(resolveGameAViteCacheDir("preview/local")).toBe("node_modules/.vite-game-a-preview-local");
  });
});
