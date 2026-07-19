import { gameATestScriptMetadataByPath } from "./generatedTestScripts";
import type { GameAVnLaunchDefinition } from "./gameAScripts";
import characterSmokeNaniSource from "./test-nani/character-smoke.nani?raw";
import smokeNaniSource from "./test-nani/smoke.nani?raw";

type GameATestScriptPath = keyof typeof gameATestScriptMetadataByPath;

export const gameASmokeLaunchDefinition = createTestLaunchDefinition({
  id: "vn:game-a-test-smoke",
  scriptPath: "game-a/test/smoke.nani",
  sourceText: smokeNaniSource
});

export const gameACharacterSmokeLaunchDefinition = createTestLaunchDefinition({
  id: "vn:game-a-test-character",
  scriptPath: "game-a/test/character-smoke.nani",
  sourceText: characterSmokeNaniSource
});

function createTestLaunchDefinition({
  id,
  scriptPath,
  sourceText
}: {
  id: string;
  scriptPath: GameATestScriptPath;
  sourceText: string;
}): GameAVnLaunchDefinition {
  const metadata = gameATestScriptMetadataByPath[scriptPath];
  if (!metadata) throw new Error(`Missing generated test metadata for '${scriptPath}'.`);
  return {
    runtimeEntry: {
      id,
      scriptRevision: metadata.scriptRevision,
      profile: "vn2d",
      scriptPath,
      sourceText,
      startLabel: "Start"
    },
    characterPreloadPlan: metadata.characterPreloadPlan
  };
}
