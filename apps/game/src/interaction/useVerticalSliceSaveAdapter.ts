import { useCallback, useEffect, useMemo, useState } from "react";
import type { NaviRuntimeState, PixiStageSnapshot, SaveData, SaveSlotSummary } from "@v-ronpa/contracts";
import type { GameplayState } from "@v-ronpa/gameplay";
import { createDexieSavePort, createSaveSlotSummary, type SavePort } from "@v-ronpa/media-save";
import { storyRuntimeSnapshot, type StoryRuntimeState } from "@v-ronpa/story-engine";
import type { useVerticalSliceRuntimeAdapter } from "./useVerticalSliceRuntimeAdapter";

type VerticalSliceRuntimeAdapter = ReturnType<typeof useVerticalSliceRuntimeAdapter>;

const VERTICAL_SLICE_DB = "v-ronpa-vertical-slice-v2";
export const verticalSliceSaveSlotIds = ["slot:vertical:1", "slot:vertical:2", "slot:vertical:3", "slot:vertical:4"];

export interface VerticalSliceSaveDataInput {
  savedAt: string;
  navi: NaviRuntimeState;
  story: StoryRuntimeState;
  pixiStage: PixiStageSnapshot;
  gameplay: GameplayState;
}

export function createVerticalSliceSaveData({
  gameplay,
  navi,
  pixiStage,
  savedAt,
  story
}: VerticalSliceSaveDataInput): SaveData {
  return {
    version: 2,
    savedAt,
    mode: "navi",
    navi,
    story: storyRuntimeSnapshot(story),
    pixiStage,
    inventory: gameplay.inventory,
    evidence: gameplay.evidence,
    characters: gameplay.characters
  };
}

export function useVerticalSliceSaveAdapter(runtime: VerticalSliceRuntimeAdapter, port?: SavePort) {
  const savePort = useMemo(() => port ?? createDexieSavePort(VERTICAL_SLICE_DB), [port]);
  const [slots, setSlots] = useState<SaveSlotSummary[]>([]);
  const [pendingLoadSlot, setPendingLoadSlot] = useState<SaveSlotSummary | undefined>();

  const refreshSlots = useCallback(async () => {
    setSlots(await savePort.listSummaries());
  }, [savePort]);

  useEffect(() => {
    void refreshSlots();
  }, [refreshSlots]);

  const collectSaveData = useCallback(
    (): SaveData => {
      return createVerticalSliceSaveData({
        savedAt: new Date().toISOString(),
        navi: runtime.navi,
        story: runtime.storyRuntime.state,
        pixiStage: runtime.pixiStageRuntime.snapshot,
        gameplay: runtime.gameplay
      });
    },
    [
      runtime.gameplay.characters,
      runtime.gameplay.evidence,
      runtime.gameplay.inventory,
      runtime.navi,
      runtime.pixiStageRuntime.snapshot,
      runtime.storyRuntime.state
    ]
  );

  const saveSlot = useCallback(
    async (slotId: string) => {
      const data = collectSaveData();
      const summary = createSaveSlotSummary(slotId, labelForSlot(slotId), data);
      await savePort.save({ id: slotId, label: summary.label, summary, data });
      await refreshSlots();
    },
    [collectSaveData, refreshSlots, savePort]
  );

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

  const cancelLoadSlot = useCallback(() => {
    setPendingLoadSlot(undefined);
  }, []);

  return {
    cancelLoadSlot,
    collectSaveData,
    confirmLoadSlot,
    pendingLoadSlot,
    refreshSlots,
    requestLoadSlot,
    saveSlot,
    slotIds: verticalSliceSaveSlotIds,
    slots
  };
}

function labelForSlot(slotId: string): string {
  const suffix = slotId.split(":").at(-1);
  return suffix ? `Slot ${suffix}` : slotId;
}
