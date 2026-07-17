import { useMemo } from "react";
import {
  INVALID_VN_START_LABEL_DIAGNOSTIC_CODE,
  useVnRuntime,
  type UseVnRuntimeOptions,
  type VnLifecyclePort,
  type VnRuntimeEntry
} from "@v-ronpa/app-vn-runtime";
import type { SaveData } from "@v-ronpa/contracts";

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
  entry: VnRuntimeEntry;
};

export function useGameAVnRuntime({ entry: baseEntry, startLabelOverride, ...options }: UseGameAVnRuntimeOptions) {
  const entry = useMemo(
    () => ({
      ...baseEntry,
      ...(startLabelOverride ? { startLabel: startLabelOverride } : {})
    }),
    [baseEntry, startLabelOverride]
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
      return restoreGameAVnSave(runtime.lifecycle, save);
    },
    startNewGame(): boolean {
      if (startLabelError) return false;
      runtime.lifecycle.startStory();
      return true;
    }
  };
}

export function restoreGameAVnSave(lifecycle: Pick<VnLifecyclePort, "restoreVnState">, save: SaveData) {
  if (!save.vn) return;
  return lifecycle.restoreVnState({ gameId: save.gameId, state: save.vn });
}
