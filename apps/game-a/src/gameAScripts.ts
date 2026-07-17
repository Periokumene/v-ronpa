import type { VnRuntimeEntry } from "@v-ronpa/app-vn-runtime";
import type { LayeredCharacterPreloadPlan } from "@v-ronpa/app-vn-shell";
import { gameAVnEntry, gameAVnScriptPath } from "./contentManifest";
import { gameAScriptMetadataByPath } from "./generatedAssets";
import openingNaniSource from "./nani/opening.nani?raw";

export const gameAOpeningNaniSource = openingNaniSource;

export interface GameAVnLaunchDefinition {
  runtimeEntry: VnRuntimeEntry;
  characterPreloadPlan: LayeredCharacterPreloadPlan;
}

const openingMetadata = gameAScriptMetadataByPath[gameAVnScriptPath];
if (!openingMetadata) throw new Error(`Missing generated metadata for '${gameAVnEntry.scriptPath}'.`);

export const gameAOpeningLaunchDefinition = {
  runtimeEntry: {
    id: gameAVnEntry.id,
    scriptRevision: gameAVnEntry.scriptRevision,
    profile: gameAVnEntry.profile,
    scriptPath: gameAVnEntry.scriptPath,
    sourceText: gameAOpeningNaniSource,
    ...(gameAVnEntry.startLabel ? { startLabel: gameAVnEntry.startLabel } : {})
  },
  characterPreloadPlan: openingMetadata.characterPreloadPlan
} satisfies GameAVnLaunchDefinition;
