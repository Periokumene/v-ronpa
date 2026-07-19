import {
  gameATestEntryLocators,
  gameATestScriptCatalogs,
  gameATestScriptMetadataByPath,
} from "./generatedTestScripts";
import type { GameAStoryDefinition } from "./gameAScripts";

type GameATestCatalogName = keyof typeof gameATestEntryLocators;

export const gameASmokeStoryDefinition = createTestStoryDefinition("smoke");
export const gameACharacterSmokeStoryDefinition = createTestStoryDefinition("characterSmoke");

function createTestStoryDefinition(name: GameATestCatalogName): GameAStoryDefinition {
  const locator = gameATestEntryLocators[name];
  const catalog = gameATestScriptCatalogs[name];
  const entry = {
    ...locator,
    title: locator.id,
    profile: "vn2d" as const,
    assetRefs: catalog.flatMap((source) => gameATestScriptMetadataByPath[source.scriptPath]?.assetRefs ?? [])
  };
  return {
    entry,
    catalog,
    characterPreloadPlanByScriptPath: Object.fromEntries(catalog.map((source) => [
      source.scriptPath,
      gameATestScriptMetadataByPath[source.scriptPath]?.characterPreloadPlan ?? []
    ]))
  };
}
