import { useCallback, useMemo } from "react";
import { SaveDataSchema, createSaveableStoryRuntimeSnapshot } from "@v-ronpa/contracts";
import type {
  NaviRuntimeState,
  PixiStageSnapshot,
  SaveData,
  SaveSlotSummary,
  StoryRuntimeSnapshot,
  TrialRuntimeState
} from "@v-ronpa/contracts";
import type { GameplayState } from "@v-ronpa/gameplay";
import { useSaveSlotController } from "@v-ronpa/app-vn-shell";
import {
  createDexieSavePort,
  createFortyPlusQuickSaveSlotPolicy,
  selectManualSaveSlotSummaries,
  selectQuickSaveSlotSummary,
  type SavePort,
  type SaveSlotPreview
} from "@v-ronpa/media-save";
import type { useHarnessShowcaseRuntimeAdapter } from "./useHarnessShowcaseRuntimeAdapter";

type HarnessShowcaseRuntimeAdapter = ReturnType<typeof useHarnessShowcaseRuntimeAdapter>;

export const HARNESS_SHOWCASE_DB = "v-ronpa-harness-showcase-v7";
export const harnessShowcaseSaveSlotPolicy = createFortyPlusQuickSaveSlotPolicy("harness");
export const harnessShowcaseManualSaveSlotCount = harnessShowcaseSaveSlotPolicy.manualSlotCount;
export const harnessShowcaseSaveSlotIds = harnessShowcaseSaveSlotPolicy.manualSlotIds;
export const harnessShowcaseQuickSaveSlotId = harnessShowcaseSaveSlotPolicy.quickSlotId;

export interface HarnessShowcaseSaveDataInput {
  mode?: SaveData["mode"];
  savedAt: string;
  navi: NaviRuntimeState;
  story: StoryRuntimeSnapshot;
  pixiStage: PixiStageSnapshot;
  gameplay: GameplayState;
  trial?: TrialRuntimeState;
}

export interface HarnessShowcaseSaveAdapterOptions {
  capturePreview?: (() => Promise<SaveSlotPreview | undefined> | SaveSlotPreview | undefined) | undefined;
  port?: SavePort | undefined;
}

export function createHarnessShowcaseSaveData({
  gameplay,
  mode = "navi",
  navi,
  pixiStage,
  savedAt,
  story,
  trial
}: HarnessShowcaseSaveDataInput): SaveData {
  const { runtimeWait: _runtimeWait, ...storyWithoutRuntimeWait } = story;
  void _runtimeWait;
  return SaveDataSchema.parse({
    version: 5,
    savedAt,
    mode,
    vn: {
      story: createSaveableStoryRuntimeSnapshot(storyWithoutRuntimeWait),
      pixiStage
    },
    navi,
    trial: trial ?? null,
    inventory: gameplay.inventory,
    evidence: gameplay.evidence,
    characters: gameplay.characters
  });
}

export function canSaveHarnessShowcaseRuntime(runtime: Pick<HarnessShowcaseRuntimeAdapter, "storyRuntime">): boolean {
  return !runtime.storyRuntime.state.runtimeWait;
}

export function selectHarnessShowcaseManualSaveSlotSummaries(summaries: SaveSlotSummary[]): SaveSlotSummary[] {
  return selectManualSaveSlotSummaries(harnessShowcaseSaveSlotPolicy, summaries);
}

export function selectHarnessShowcaseQuickSaveSlotSummary(summaries: SaveSlotSummary[]): SaveSlotSummary | undefined {
  return selectQuickSaveSlotSummary(harnessShowcaseSaveSlotPolicy, summaries);
}

export function useHarnessShowcaseSaveAdapter(
  runtime: HarnessShowcaseRuntimeAdapter,
  options: HarnessShowcaseSaveAdapterOptions = {}
) {
  const savePort = useMemo(() => options.port ?? createDexieSavePort(HARNESS_SHOWCASE_DB), [options.port]);
  const collectSaveData = useCallback(
    (): SaveData => {
      return createHarnessShowcaseSaveData({
        savedAt: new Date().toISOString(),
        navi: runtime.navi,
        story: runtime.storyRuntime.state,
        pixiStage: runtime.pixiStageRuntime.snapshot,
        gameplay: runtime.gameplay,
        mode: runtime.trialRuntime.active ? "trial" : "navi",
        ...(runtime.trialRuntime.active && runtime.trialRuntime.state ? { trial: runtime.trialRuntime.state } : {})
      });
    },
    [
      runtime.gameplay.characters,
      runtime.gameplay.evidence,
      runtime.gameplay.inventory,
      runtime.navi,
      runtime.pixiStageRuntime.snapshot,
      runtime.storyRuntime.state,
      runtime.trialRuntime.active,
      runtime.trialRuntime.state
    ]
  );
  const controller = useSaveSlotController({
    port: savePort,
    policy: harnessShowcaseSaveSlotPolicy,
    collectSaveData,
    restoreSaveData: runtime.restoreFromSave,
    canSave: () => canSaveHarnessShowcaseRuntime(runtime),
    ...(options.capturePreview ? { capturePreview: options.capturePreview } : {})
  });

  return {
    collectSaveData,
    ...controller
  };
}
