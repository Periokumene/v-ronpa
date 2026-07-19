import {
  INVALID_VN_START_LABEL_DIAGNOSTIC_CODE,
  useVnRuntime,
  type UseVnRuntimeOptions,
  type VnLifecyclePort
} from "@v-ronpa/app-vn-runtime";
import type { SaveData } from "@v-ronpa/contracts";

export type UseGameAVnRuntimeOptions = Pick<
  UseVnRuntimeOptions,
  | "assetResolver"
  | "dialogRevealSettings"
  | "dialogueBleepConfig"
  | "dialogueBleepSettings"
  | "prepareScriptPresentation"
  | "storyPlayTiming"
  | "voiceSettings"
  | "catalog"
  | "entry"
>;

export function useGameAVnRuntime({ entry, ...options }: UseGameAVnRuntimeOptions) {
  const runtime = useVnRuntime({
    ...options,
    entry,
    gameId: "game-a"
  });
  const invalidStartLabelDiagnostic = runtime.diagnostics.runtimeDiagnostics.find(
    (diagnostic) => diagnostic.code === INVALID_VN_START_LABEL_DIAGNOSTIC_CODE && diagnostic.severity === "error"
  );

  return {
    shell: runtime.shell,
    presentation: runtime.presentation,
    lifecycle: runtime.lifecycle,
    diagnostics: runtime.diagnostics,
    restoreFromSave(save: SaveData) {
      return restoreGameAVnSave(runtime.lifecycle, save);
    },
    async startNewGame(): Promise<boolean> {
      if (invalidStartLabelDiagnostic) return false;
      return (await runtime.lifecycle.startStory()).ok;
    }
  };
}

export function restoreGameAVnSave(lifecycle: Pick<VnLifecyclePort, "restoreVnState">, save: SaveData) {
  if (!save.vn) return;
  return lifecycle.restoreVnState({ gameId: save.gameId, state: save.vn });
}
