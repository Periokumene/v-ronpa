import {
  stabilizeVnDevtoolsScriptCatalog,
  type PrepareVnDevtoolsDefinitionInput
} from "@v-ronpa/app-vn-devtools";
import {
  deriveLayeredCharacterPreloadPlan,
  stabilizeLayeredCharacterPreloadPlan
} from "@v-ronpa/layered-character";
import type { GameAStoryDefinition } from "../gameAScripts";

/** Adds Game A's generated character plan to an already-validated shared candidate. */
export function decorateGameACandidateStory({
  activeDefinition,
  candidate,
  inspection
}: PrepareVnDevtoolsDefinitionInput<GameAStoryDefinition>): GameAStoryDefinition {
  const installedPlan = activeDefinition.characterPreloadPlanByScriptPath[candidate.source.scriptPath];
  const candidatePlan = deriveLayeredCharacterPreloadPlan(inspection.script);
  return {
    entry: candidate.entry,
    catalog: stabilizeVnDevtoolsScriptCatalog(activeDefinition.catalog, candidate.catalog),
    characterPreloadPlanByScriptPath: {
      ...activeDefinition.characterPreloadPlanByScriptPath,
      [candidate.source.scriptPath]: stabilizeLayeredCharacterPreloadPlan(installedPlan, candidatePlan)
    }
  };
}
