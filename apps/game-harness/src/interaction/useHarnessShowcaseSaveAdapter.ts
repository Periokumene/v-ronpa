import { useCallback, useEffect, useMemo, useState } from "react";
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
import { createDexieSavePort, createSaveSlotSummary, type SavePort } from "@v-ronpa/media-save";
import type { useHarnessShowcaseRuntimeAdapter } from "./useHarnessShowcaseRuntimeAdapter";

type HarnessShowcaseRuntimeAdapter = ReturnType<typeof useHarnessShowcaseRuntimeAdapter>;

const HARNESS_SHOWCASE_DB = "v-ronpa-harness-showcase-v6";
export const harnessShowcaseManualSaveSlotCount = 40;
export const harnessShowcaseSaveSlotIds = Array.from({ length: harnessShowcaseManualSaveSlotCount }, (_, index) => `slot:harness:${index + 1}`);
export const harnessShowcaseQuickSaveSlotId = "slot:harness:quick";

export interface HarnessShowcaseSaveDataInput {
  mode?: SaveData["mode"];
  savedAt: string;
  navi: NaviRuntimeState;
  story: StoryRuntimeSnapshot;
  pixiStage: PixiStageSnapshot;
  gameplay: GameplayState;
  trial?: TrialRuntimeState;
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
  return summaries.filter((slot) => harnessShowcaseSaveSlotIds.includes(slot.id));
}

export function selectHarnessShowcaseQuickSaveSlotSummary(summaries: SaveSlotSummary[]): SaveSlotSummary | undefined {
  return summaries.find((slot) => slot.id === harnessShowcaseQuickSaveSlotId);
}

export function useHarnessShowcaseSaveAdapter(runtime: HarnessShowcaseRuntimeAdapter, port?: SavePort) {
  const savePort = useMemo(() => port ?? createDexieSavePort(HARNESS_SHOWCASE_DB), [port]);
  const [slots, setSlots] = useState<SaveSlotSummary[]>([]);
  const [quickSlot, setQuickSlot] = useState<SaveSlotSummary | undefined>();
  const [pendingLoadSlot, setPendingLoadSlot] = useState<SaveSlotSummary | undefined>();

  const refreshSlots = useCallback(async () => {
    const summaries = await savePort.listSummaries();
    setSlots(selectHarnessShowcaseManualSaveSlotSummaries(summaries));
    setQuickSlot(selectHarnessShowcaseQuickSaveSlotSummary(summaries));
  }, [savePort]);

  useEffect(() => {
    void refreshSlots();
  }, [refreshSlots]);

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

  const saveSlot = useCallback(
    async (slotId: string) => {
      if (!harnessShowcaseSaveSlotIds.includes(slotId)) return;
      if (!canSaveHarnessShowcaseRuntime(runtime)) return;
      const data = collectSaveData();
      const summary = createSaveSlotSummary(slotId, labelForSlot(slotId), data);
      await savePort.save({ id: slotId, label: summary.label, summary, data });
      await refreshSlots();
    },
    [collectSaveData, refreshSlots, runtime, savePort]
  );

  const quickSaveSlot = useCallback(async () => {
    if (!canSaveHarnessShowcaseRuntime(runtime)) return;
    const data = collectSaveData();
    const summary = createSaveSlotSummary(harnessShowcaseQuickSaveSlotId, labelForSlot(harnessShowcaseQuickSaveSlotId), data);
    await savePort.save({ id: harnessShowcaseQuickSaveSlotId, label: summary.label, summary, data });
    await refreshSlots();
  }, [collectSaveData, refreshSlots, runtime, savePort]);

  const requestLoadSlot = useCallback(
    async (slotId: string) => {
      const slot = await savePort.load(slotId);
      if (!slot) return;
      setPendingLoadSlot(slot.summary);
    },
    [savePort]
  );

  const confirmLoadSlot = useCallback(async () => {
    if (!pendingLoadSlot) return;
    const slot = await savePort.load(pendingLoadSlot.id);
    if (!slot) return;
    runtime.restoreFromSave(slot.data);
    setPendingLoadSlot(undefined);
    await refreshSlots();
  }, [pendingLoadSlot, refreshSlots, runtime, savePort]);

  const quickLoadSlot = useCallback(async () => {
    const slot = await savePort.load(harnessShowcaseQuickSaveSlotId);
    if (!slot) return false;
    runtime.restoreFromSave(slot.data);
    setPendingLoadSlot(undefined);
    await refreshSlots();
    return true;
  }, [refreshSlots, runtime, savePort]);

  const cancelLoadSlot = useCallback(() => {
    setPendingLoadSlot(undefined);
  }, []);

  return {
    cancelLoadSlot,
    collectSaveData,
    confirmLoadSlot,
    pendingLoadSlot,
    quickLoadSlot,
    quickSaveSlot,
    quickSlot,
    refreshSlots,
    requestLoadSlot,
    saveSlot,
    slotIds: harnessShowcaseSaveSlotIds,
    slots
  };
}

function labelForSlot(slotId: string): string {
  if (slotId === harnessShowcaseQuickSaveSlotId) return "Quick Save";
  const suffix = slotId.split(":").at(-1);
  return suffix ? `Slot ${suffix}` : slotId;
}
