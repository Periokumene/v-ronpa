import { useCallback, useMemo } from "react";
import { SaveDataSchema } from "@v-ronpa/contracts";
import type {
  NaviRuntimeState,
  SaveData,
  SaveableVnState,
  SaveSlotSummary,
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

export const HARNESS_SHOWCASE_DB = "v-ronpa-harness-showcase-v9";
export const harnessShowcaseSaveSlotPolicy = createFortyPlusQuickSaveSlotPolicy("harness");
export const harnessShowcaseManualSaveSlotCount = harnessShowcaseSaveSlotPolicy.manualSlotCount;
export const harnessShowcaseSaveSlotIds = harnessShowcaseSaveSlotPolicy.manualSlotIds;
export const harnessShowcaseQuickSaveSlotId = harnessShowcaseSaveSlotPolicy.quickSlotId;

export interface HarnessShowcaseSaveDataInput {
  mode?: SaveData["mode"];
  savedAt: string;
  navi: NaviRuntimeState;
  vn: SaveableVnState;
  gameplay: GameplayState;
  trial?: TrialRuntimeState;
}

export interface HarnessShowcaseSaveAdapterOptions {
  capturePreview?: (() => Promise<SaveSlotPreview | undefined> | SaveSlotPreview | undefined) | undefined;
  port?: SavePort | undefined;
  canSave: () => boolean;
}

export function createHarnessShowcaseSaveData({
  gameplay,
  mode = "navi",
  navi,
  savedAt,
  vn,
  trial
}: HarnessShowcaseSaveDataInput): SaveData {
  return SaveDataSchema.parse({
    version: 7,
    gameId: "game-harness",
    savedAt,
    mode,
    vn,
    navi,
    trial: trial ?? null,
    inventory: gameplay.inventory,
    evidence: gameplay.evidence,
    characters: gameplay.characters
  });
}

export function selectHarnessShowcaseManualSaveSlotSummaries(summaries: SaveSlotSummary[]): SaveSlotSummary[] {
  return selectManualSaveSlotSummaries(harnessShowcaseSaveSlotPolicy, summaries);
}

export function selectHarnessShowcaseQuickSaveSlotSummary(summaries: SaveSlotSummary[]): SaveSlotSummary | undefined {
  return selectQuickSaveSlotSummary(harnessShowcaseSaveSlotPolicy, summaries);
}

export function useHarnessShowcaseSaveAdapter(
  runtime: HarnessShowcaseRuntimeAdapter,
  options: HarnessShowcaseSaveAdapterOptions
) {
  const savePort = useMemo(() => options.port ?? createDexieSavePort(HARNESS_SHOWCASE_DB), [options.port]);
  const collectSaveData = useCallback(
    () => {
      const checkpoint = runtime.lifecycle.createVnSaveCheckpoint({ allowInactive: true });
      if (!checkpoint.ok) return checkpoint;
      return { ok: true as const, value: createHarnessShowcaseSaveData({
        savedAt: new Date().toISOString(),
        navi: runtime.navi,
        vn: checkpoint.value,
        gameplay: runtime.gameplay,
        mode: runtime.trialRuntime.active ? "trial" : "navi",
        ...(runtime.trialRuntime.active && runtime.trialRuntime.state ? { trial: runtime.trialRuntime.state } : {})
      }) };
    },
    [
      runtime.gameplay.characters,
      runtime.gameplay.evidence,
      runtime.gameplay.inventory,
      runtime.navi,
      runtime.lifecycle.createVnSaveCheckpoint,
      runtime.trialRuntime.active,
      runtime.trialRuntime.state
    ]
  );
  const controller = useSaveSlotController({
    port: savePort,
    policy: harnessShowcaseSaveSlotPolicy,
    collectSaveData,
    restoreSaveData: runtime.restoreFromSave,
    canSave: options.canSave,
    ...(options.capturePreview ? { capturePreview: options.capturePreview } : {})
  });

  return {
    collectSaveData,
    ...controller
  };
}
