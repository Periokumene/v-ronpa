import type { PixiStageSnapshot, StoryEffect } from "@v-ronpa/contracts";
import {
  reducePixiStageCommand,
  type PixiStageCommandReduction,
  type PixiStageRenderHint
} from "@v-ronpa/pixi-presenter";
import type { StoryRuntimeState } from "@v-ronpa/story-engine";
import {
  defaultVnOutputRouteTable,
  selectEffectsForTarget,
  selectNewPresentationCommands,
  selectNewStoryEffects,
  selectPresentationCommandsForTarget,
  type VnOutputRouteTable,
  type VnRuntimeProfile
} from "./vnOutputRoutes";

export interface VnRuntimePresentationTransactionInput {
  previousStory: StoryRuntimeState;
  nextStory: StoryRuntimeState;
  previousPixiStage: PixiStageSnapshot;
  profile?: VnRuntimeProfile;
  routeTable?: VnOutputRouteTable;
}

export interface VnRuntimePresentationTransaction {
  pixiStage: PixiStageSnapshot;
  pixiHints: PixiStageRenderHint[];
  gameplayEffects: StoryEffect[];
}

export function createVnRuntimePresentationTransaction({
  previousStory,
  nextStory,
  previousPixiStage,
  profile = "vn2d",
  routeTable = defaultVnOutputRouteTable
}: VnRuntimePresentationTransactionInput): VnRuntimePresentationTransaction {
  const routeContext = { profile };
  const pixiCommands = selectPresentationCommandsForTarget(
    selectNewPresentationCommands(previousStory.presentationCommands.length, nextStory.presentationCommands),
    "pixi",
    routeTable,
    routeContext
  );
  const pixiReduction = pixiCommands.reduce<PixiStageCommandReduction>(
    (current, command) => {
      const next = reducePixiStageCommand(current.snapshot, command);
      return {
        snapshot: next.snapshot,
        hints: [...current.hints, ...next.hints]
      };
    },
    { snapshot: previousPixiStage, hints: [] }
  );
  const gameplayEffects = selectEffectsForTarget(
    selectNewStoryEffects(previousStory.effects.length, nextStory.effects),
    "gameplay",
    routeTable,
    routeContext
  );

  return {
    pixiStage: pixiReduction.snapshot,
    pixiHints: pixiReduction.hints,
    gameplayEffects
  };
}
