import { useCallback, useEffect, useMemo, useState } from "react";
import type { NaviRuntimeState, SaveData, SaveSlotSummary } from "@v-ronpa/contracts";
import type { GameplayState } from "@v-ronpa/gameplay";
import { createDexieSavePort, createSaveSlotSummary, type SavePort } from "@v-ronpa/media-save";
import { storyRuntimeSnapshot, type StoryRuntimeState } from "@v-ronpa/story-engine";
import type { useVerticalSliceRuntimeAdapter } from "./useVerticalSliceRuntimeAdapter";

type VerticalSliceRuntimeAdapter = ReturnType<typeof useVerticalSliceRuntimeAdapter>;

const VERTICAL_SLICE_DB = "v-ronpa-vertical-slice";
export const verticalSliceSaveSlotIds = ["slot:vertical:1", "slot:vertical:2", "slot:vertical:3", "slot:vertical:4"];

export interface VerticalSliceSaveDataInput {
  slotId: string;
  savedAt: string;
  navi: NaviRuntimeState;
  story: StoryRuntimeState;
  gameplay: GameplayState;
}

export function createVerticalSliceSaveData({ gameplay, navi, savedAt, slotId, story }: VerticalSliceSaveDataInput): SaveData {
  const base: SaveData = {
    version: 1,
    savedAt,
    mode: "navi",
    navi,
    story: storyRuntimeSnapshot(story),
    inventory: gameplay.inventory,
    evidence: gameplay.evidence,
    characters: gameplay.characters
  };
  const label = labelForSlot(slotId);
  const summary = createSaveSlotSummary(slotId, label, base);
  return { ...base, summary };
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
    (slotId: string): SaveData => {
      return createVerticalSliceSaveData({
        slotId,
        savedAt: new Date().toISOString(),
        navi: runtime.navi,
        story: runtime.storyRuntime.state,
        gameplay: runtime.gameplay
      });
    },
    [runtime.gameplay.characters, runtime.gameplay.evidence, runtime.gameplay.inventory, runtime.navi, runtime.storyRuntime.state]
  );

  const saveSlot = useCallback(
    async (slotId: string) => {
      const data = collectSaveData(slotId);
      const summary = data.summary ?? createSaveSlotSummary(slotId, labelForSlot(slotId), data);
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
