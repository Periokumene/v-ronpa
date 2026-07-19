import type { VnEntryDef } from "@v-ronpa/contracts";
import {
  gameATestScriptMetadataByPath,
  gameATestScriptSourcesByPath
} from "./generatedTestScripts";
import type { GameAStoryDefinition } from "./gameAScripts";

type GameATestScriptPath = keyof typeof gameATestScriptMetadataByPath;

export const gameASmokeStoryDefinition = createTestStoryDefinition({
  id: "vn:game-a-test-smoke",
  scriptPath: "game-a/test/smoke.nani"
});

export const gameACharacterSmokeStoryDefinition = createTestStoryDefinition({
  id: "vn:game-a-test-character",
  scriptPath: "game-a/test/character-smoke.nani"
});

function createTestStoryDefinition({
  id,
  scriptPath
}: {
  id: string;
  scriptPath: GameATestScriptPath;
}): GameAStoryDefinition {
  const metadata = gameATestScriptMetadataByPath[scriptPath];
  const source = gameATestScriptSourcesByPath[scriptPath];
  if (!metadata || !source) throw new Error(`Missing generated test script '${scriptPath}'.`);
  const entry: VnEntryDef = {
    id,
    title: id,
    initialScriptPath: scriptPath,
    startLabel: "Start",
    profile: "vn2d",
    assetRefs: metadata.assetRefs
  };
  return {
    entry,
    catalog: [source],
    characterPreloadPlanByScriptPath: { [scriptPath]: metadata.characterPreloadPlan }
  };
}
