import type { PixiStageSnapshot, RuntimeScript, StoryRuntimeSnapshot } from "@v-ronpa/contracts";
import { createInitialStoryPlayState, type StoryPlayState } from "@v-ronpa/story-play";
import { createInitialStoryState } from "@v-ronpa/story-engine";
import type { VnPixiStageRuntime, VnStoryRuntime } from "./runtimeTypes";
import { type VnRuntimeDiagnostic } from "./runtimeDiagnostics";

export interface VnRuntimeRestorePlan {
  diagnostics: VnRuntimeDiagnostic[];
  storyRuntime: VnStoryRuntime;
  storyPlay: StoryPlayState;
  pixiStageRuntime: VnPixiStageRuntime;
}

export interface CreateVnRuntimeRestorePlanInput {
  active?: boolean;
  pixiStage: PixiStageSnapshot;
  script: Pick<RuntimeScript, "scriptPath">;
  story: StoryRuntimeSnapshot;
}

export function createVnRuntimeRestorePlan({
  active,
  pixiStage,
  script,
  story
}: CreateVnRuntimeRestorePlanInput): VnRuntimeRestorePlan {
  const { runtimeWait: restoredRuntimeWait, ...saveableStory } = story;
  const storyRuntime = {
    active: active ?? !story.ended,
    state: {
      ...createInitialStoryState(script),
      ...saveableStory
    }
  };
  return {
    diagnostics: restoredRuntimeWait
      ? [
          {
            source: "story",
            code: "runtime-wait-cleared-on-load",
            severity: "warning",
            message: "Saved runtimeWait was cleared during restore because runtime waits are transient app state."
          }
        ]
      : [],
    storyRuntime,
    storyPlay: createInitialStoryPlayState(),
    pixiStageRuntime: {
      snapshot: pixiStage,
      hints: [],
      hintSequence: 0,
      animate: false,
      presentationTasks: []
    }
  };
}

