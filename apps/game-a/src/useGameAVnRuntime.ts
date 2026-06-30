import { useVnRuntime, type UseVnRuntimeOptions } from "@v-ronpa/app-vn-runtime";
import type { SaveData } from "@v-ronpa/contracts";
import { gameAScript, gameAVnEntry } from "./contentManifest";

export type UseGameAVnRuntimeOptions = Pick<
  UseVnRuntimeOptions,
  | "assetResolver"
  | "dialogRevealSettings"
  | "dialogueBleepConfig"
  | "dialogueBleepSettings"
  | "storyPlayTiming"
  | "voiceSettings"
>;

export function useGameAVnRuntime(options: UseGameAVnRuntimeOptions = {}) {
  const runtime = useVnRuntime({
    ...options,
    entry: {
      id: gameAVnEntry.id,
      profile: gameAVnEntry.profile,
      scriptPath: gameAVnEntry.scriptPath,
      sourceText: gameAScript,
      ...(gameAVnEntry.startLabel ? { startLabel: gameAVnEntry.startLabel } : {})
    },
    interactionMode: "vn"
  });

  return {
    ...runtime,
    createSaveSnapshot: runtime.createVnSaveSnapshot,
    restoreFromSave(save: SaveData) {
      const story = save.vn?.story ?? save.story;
      runtime.restoreVnState({
        active: !story.ended,
        story,
        pixiStage: save.vn?.pixiStage ?? save.pixiStage
      });
    },
    startNewGame() {
      runtime.startStory();
    }
  };
}

