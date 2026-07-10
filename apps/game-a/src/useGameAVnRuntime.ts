import { useMemo } from "react";
import {
  INVALID_VN_START_LABEL_DIAGNOSTIC_CODE,
  useVnRuntime,
  type UseVnRuntimeOptions,
  type VnRuntimeEntry
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
  entryOverride?: VnRuntimeEntry;
};

export function useGameAVnRuntime({ entryOverride, startLabelOverride, ...options }: UseGameAVnRuntimeOptions = {}) {
  const entry = useMemo(
    () => ({
      ...(entryOverride ?? gameAOpeningRuntimeEntry),
      ...(startLabelOverride ? { startLabel: startLabelOverride } : {})
    }),
    [entryOverride, startLabelOverride]
  );
  const runtime = useVnRuntime({
    ...options,
    entry,
    gameId: "game-a"
  });
  const startLabelError = runtime.diagnostics.runtimeDiagnostics.find(
    (diagnostic) => diagnostic.code === INVALID_VN_START_LABEL_DIAGNOSTIC_CODE && diagnostic.severity === "error"
  );

  return {
    shell: runtime.shell,
    presentation: runtime.presentation,
    lifecycle: runtime.lifecycle,
    diagnostics: runtime.diagnostics,
    debug: runtime.debug,
    startLabelError,
    restoreFromSave(save: SaveData) {
      if (!save.vn) return;
      runtime.lifecycle.restoreVnState({ gameId: save.gameId, state: save.vn });
    },
    startNewGame(): boolean {
      if (startLabelError) return false;
      runtime.lifecycle.startStory();
      return true;
    }
  };
}
