import type { VnEntryDef, VnRuntimeScriptCatalog } from "@v-ronpa/contracts";
import type { LayeredCharacterPreloadPlan } from "@v-ronpa/app-vn-shell";
import { gameAVnEntry } from "./contentManifest";
import {
  gameAScriptMetadataByPath,
  gameAScriptSourcesByPath
} from "./generatedAssets";

export interface GameAStoryDefinition {
  entry: VnEntryDef;
  catalog: VnRuntimeScriptCatalog;
  characterPreloadPlanByScriptPath: Readonly<Record<string, LayeredCharacterPreloadPlan>>;
}

export const gameAStoryDefinition: GameAStoryDefinition = {
  entry: gameAVnEntry,
  catalog: Object.values(gameAScriptSourcesByPath),
  characterPreloadPlanByScriptPath: Object.fromEntries(
    Object.entries(gameAScriptMetadataByPath).map(([scriptPath, metadata]) => [
      scriptPath,
      metadata.characterPreloadPlan
    ])
  )
};
