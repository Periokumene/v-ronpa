import type { PixiStageSnapshot, RuntimeScript, SaveableStorySnapshot, VnMediaCheckpoint, VnUiCheckpoint } from "@v-ronpa/contracts";
import {
  createUiRuntimeStateFromCheckpoint,
  createVnMediaCheckpoint,
  createVnMediaRestoreEffects,
  type MediaRuntimeEffect,
  type MediaRuntimeState,
  type UiRuntimeState
} from "@v-ronpa/app-vn-dispatch";
import { createInitialStoryPlayState, type StoryPlayState } from "@v-ronpa/story-play";
import { createInitialStoryState } from "@v-ronpa/story-engine";
import type { VnPixiStageRuntime, VnStoryRuntime } from "./runtimeTypes";
import { type VnRuntimeDiagnostic } from "./runtimeDiagnostics";

export interface VnRuntimeRestorePlan {
  diagnostics: VnRuntimeDiagnostic[];
  storyRuntime: VnStoryRuntime;
  storyPlay: StoryPlayState;
  pixiStageRuntime: VnPixiStageRuntime;
  uiRuntime: UiRuntimeState;
  mediaRuntime: MediaRuntimeState;
  mediaEffects: MediaRuntimeEffect[];
}

export interface CreateVnRuntimeRestorePlanInput {
  active?: boolean;
  pixiStage: PixiStageSnapshot;
  media: VnMediaCheckpoint;
  script: Pick<RuntimeScript, "scriptPath">;
  story: SaveableStorySnapshot;
  ui: VnUiCheckpoint;
}

export function createVnRuntimeRestorePlan({
  active,
  media,
  pixiStage,
  script,
  story,
  ui
}: CreateVnRuntimeRestorePlanInput): VnRuntimeRestorePlan {
  const mediaRuntime = createVnMediaCheckpoint(media);
  const storyRuntime = {
    active: active ?? !story.ended,
    state: {
      ...createInitialStoryState(script),
      ...story
    }
  };
  return {
    diagnostics: [],
    storyRuntime,
    storyPlay: createInitialStoryPlayState(),
    pixiStageRuntime: {
      snapshot: pixiStage,
      hints: [],
      hintSequence: 0,
      animate: false,
      presentationTasks: []
    },
    uiRuntime: createUiRuntimeStateFromCheckpoint(ui),
    mediaRuntime,
    mediaEffects: createVnMediaRestoreEffects(mediaRuntime)
  };
}
