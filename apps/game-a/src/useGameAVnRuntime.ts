import { useMemo } from "react";
import {
  INVALID_VN_START_LABEL_DIAGNOSTIC_CODE,
  useVnRuntime,
  type UseVnRuntimeOptions
} from "@v-ronpa/app-vn-runtime";
import type { SaveData } from "@v-ronpa/contracts";
import { gameAOpeningRuntimeEntry } from "./gameAScripts";

export type UseGameAVnRuntimeOptions = Pick<
  UseVnRuntimeOptions,
  | "assetResolver"
  | "dialogRevealSettings"
  | "dialogueBleepConfig"
  | "dialogueBleepSettings"
  | "storyPlayTiming"
  | "voiceSettings"
> & {
  startLabelOverride?: string;
};

export function useGameAVnRuntime({ startLabelOverride, ...options }: UseGameAVnRuntimeOptions = {}) {
  const entry = useMemo(
    () => ({
      ...gameAOpeningRuntimeEntry,
      ...(startLabelOverride ? { startLabel: startLabelOverride } : {})
    }),
    [startLabelOverride]
  );
  const runtime = useVnRuntime({
    ...options,
    entry,
    interactionMode: "vn"
  });
  const startLabelError = runtime.runtimeDiagnostics.find(
    (diagnostic) => diagnostic.code === INVALID_VN_START_LABEL_DIAGNOSTIC_CODE && diagnostic.severity === "error"
  );

  return {
    ...runtime,
    startLabelError,
    createSaveSnapshot: runtime.createVnSaveSnapshot,
    restoreFromSave(save: SaveData) {
      const story = save.vn?.story ?? save.story;
      runtime.restoreVnState({
        active: !story.ended,
        story,
        pixiStage: save.vn?.pixiStage ?? save.pixiStage
      });
    },
    startNewGame(): boolean {
      if (startLabelError) return false;
      runtime.startStory();
      return true;
    }
  };
}
