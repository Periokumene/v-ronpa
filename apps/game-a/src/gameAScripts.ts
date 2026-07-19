import type { VnRuntimeDefinition } from "@v-ronpa/app-vn-runtime";
import type { VnPixiCharacterPreparationPlan } from "@v-ronpa/app-vn-shell";
import { gameAVnEntry } from "./contentManifest";
import {
  gameAScriptCatalog,
  gameAScriptMetadataByPath,
} from "./generatedAssets";

export interface GameAStoryDefinition extends VnRuntimeDefinition {
  characterPreloadPlanByScriptPath: Readonly<Record<string, VnPixiCharacterPreparationPlan>>;
}

export const gameAStoryDefinition: GameAStoryDefinition = {
  entry: gameAVnEntry,
  catalog: gameAScriptCatalog,
  characterPreloadPlanByScriptPath: Object.fromEntries(
    Object.entries(gameAScriptMetadataByPath).map(([scriptPath, metadata]) => [
      scriptPath,
      metadata.characterPreloadPlan
    ])
  )
};
