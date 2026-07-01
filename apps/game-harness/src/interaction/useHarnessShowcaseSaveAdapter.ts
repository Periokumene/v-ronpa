import { useCallback, useEffect, useMemo, useState } from "react";
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

const HARNESS_SHOWCASE_DB = "v-ronpa-harness-showcase-v3";
export const harnessShowcaseSaveSlotIds = ["slot:harness:1", "slot:harness:2", "slot:harness:3", "slot:harness:4"];

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
  const { runtimeWait: _runtimeWait, ...saveableStory } = story;
  void _runtimeWait;
  const data: SaveData = {
    version: 4,
    savedAt,
    mode,
    navi,
    story: saveableStory,
    pixiStage,
    inventory: gameplay.inventory,
    evidence: gameplay.evidence,
    characters: gameplay.characters
  };
  if (trial) data.trial = trial;
  return data;
}

export function canSaveHarnessShowcaseRuntime(runtime: Pick<HarnessShowcaseRuntimeAdapter, "storyRuntime">): boolean {
  return !runtime.storyRuntime.state.runtimeWait;
}

export function useHarnessShowcaseSaveAdapter(runtime: HarnessShowcaseRuntimeAdapter, port?: SavePort) {
  const savePort = useMemo(() => port ?? createDexieSavePort(HARNESS_SHOWCASE_DB), [port]);
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
      runtime.storyRuntime.state
    ]
  );

  const saveSlot = useCallback(
    async (slotId: string) => {
      if (!canSaveHarnessShowcaseRuntime(runtime)) return;
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
    slotIds: harnessShowcaseSaveSlotIds,
    slots
  };
}

function labelForSlot(slotId: string): string {
  const suffix = slotId.split(":").at(-1);
  return suffix ? `Slot ${suffix}` : slotId;
}
