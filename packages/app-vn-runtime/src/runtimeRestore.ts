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
  const { runtimeWait: restoredRuntimeWait, ...storyWithoutRuntimeWait } = story;
  const { presentationWait: restoredPresentationWait, ...storyWithoutTransientWaits } = storyWithoutRuntimeWait;
  const saveableStory =
    restoredPresentationWait?.channel === "ui"
      ? storyWithoutTransientWaits
      : { ...storyWithoutTransientWaits, ...(restoredPresentationWait ? { presentationWait: restoredPresentationWait } : {}) };
  const storyRuntime = {
    active: active ?? !story.ended,
    state: {
      ...createInitialStoryState(script),
      ...saveableStory
    }
  };
  return {
    diagnostics: [
      ...(restoredRuntimeWait
        ? [
            {
              source: "story" as const,
              code: "runtime-wait-cleared-on-load" as const,
              severity: "warning" as const,
              message: "Saved runtimeWait was cleared during restore because runtime waits are transient app state."
            }
          ]
        : []),
      ...(restoredPresentationWait?.channel === "ui"
        ? [
            {
              source: "story" as const,
              code: "ui-presentation-wait-cleared-on-load" as const,
              severity: "warning" as const,
              message: "Saved UI presentationWait was cleared during restore because UI transitions are transient app state."
            }
          ]
        : [])
    ],
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
