import { gameATestScriptMetadataByPath } from "./generatedTestScripts";
import type { GameAVnLaunchDefinition } from "./gameAScripts";
import characterSmokeNaniSource from "./test-nani/character-smoke.nani?raw";
import smokeNaniSource from "./test-nani/smoke.nani?raw";

export const gameATestEntryIds = ["smoke", "character"] as const;
export type GameATestEntryId = (typeof gameATestEntryIds)[number];
type GameATestScriptPath = keyof typeof gameATestScriptMetadataByPath;

export const gameATestLaunchDefinitions = {
  smoke: createTestLaunchDefinition({
    id: "vn:game-a-test-smoke",
    scriptPath: "game-a/test/smoke.nani",
    sourceText: smokeNaniSource
  }),
  character: createTestLaunchDefinition({
    id: "vn:game-a-test-character",
    scriptPath: "game-a/test/character-smoke.nani",
    sourceText: characterSmokeNaniSource
  })
} satisfies Record<GameATestEntryId, GameAVnLaunchDefinition>;

export function resolveGameATestLaunchDefinition(
  requestedEntry: string | null
): GameAVnLaunchDefinition | undefined {
  return isGameATestEntryId(requestedEntry)
    ? gameATestLaunchDefinitions[requestedEntry]
    : undefined;
}

function isGameATestEntryId(value: string | null): value is GameATestEntryId {
  return value !== null && (gameATestEntryIds as readonly string[]).includes(value);
}

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
