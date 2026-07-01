import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SaveDataSchema,
  type PixiStageSnapshot,
  type SaveData,
  type SaveSlotSummary,
  type StoryRuntimeSnapshot
} from "@v-ronpa/contracts";
import { createGameplayState } from "@v-ronpa/gameplay";
import { gameAVnEntry } from "./contentManifest";

const GAME_A_SAVE_STORAGE_KEY = "v-ronpa:game-a:saves:v2";
export const gameASaveSlotIds = ["slot:game-a:1", "slot:game-a:2", "slot:game-a:3"];

export interface GameASaveSnapshotInput {
  pixiStage: PixiStageSnapshot;
  story: StoryRuntimeSnapshot;
}

export function createGameASaveData({ pixiStage, story }: GameASaveSnapshotInput): SaveData {
  const gameplay = createGameplayState();
  return SaveDataSchema.parse({
    version: 4,
    savedAt: new Date().toISOString(),
    mode: "vn",
    vn: {
      entryId: gameAVnEntry.id,
      story,
      pixiStage
    },
    story,
    pixiStage,
    inventory: gameplay.inventory,
    evidence: gameplay.evidence,
    characters: gameplay.characters
  });
}

export function useGameASaveAdapter({
  getPixiStage,
  getStory,
  onLoad
}: {
  getPixiStage: () => PixiStageSnapshot;
  getStory: () => StoryRuntimeSnapshot;
  onLoad: (save: SaveData) => void;
}) {
  const [savesBySlot, setSavesBySlot] = useState<Record<string, SaveData>>(() => loadGameASaves());
  const [pendingLoadSlot, setPendingLoadSlot] = useState<SaveSlotSummary | undefined>(undefined);

  useEffect(() => {
    persistGameASaves(savesBySlot);
  }, [savesBySlot]);

  const slots = useMemo(
    () => gameASaveSlotIds.flatMap((slotId) => (savesBySlot[slotId] ? [toSaveSlotSummary(slotId, savesBySlot[slotId])] : [])),
    [savesBySlot]
  );

  const saveSlot = useCallback(
    (slotId: string) => {
      if (!gameASaveSlotIds.includes(slotId)) return;
      setSavesBySlot((current) => ({
        ...current,
        [slotId]: createGameASaveData({ story: getStory(), pixiStage: getPixiStage() })
      }));
    },
    [getPixiStage, getStory]
  );

  return {
    cancelLoadSlot() {
      setPendingLoadSlot(undefined);
    },
    confirmLoadSlot() {
      const save = pendingLoadSlot ? savesBySlot[pendingLoadSlot.id] : undefined;
      if (!save) return;
      onLoad(save);
      setPendingLoadSlot(undefined);
    },
    pendingLoadSlot,
    requestLoadSlot(slotId: string) {
      const save = savesBySlot[slotId];
      if (!save) return;
      setPendingLoadSlot(toSaveSlotSummary(slotId, save));
    },
    saveSlot,
    slotIds: gameASaveSlotIds,
    slots
  };
}

function toSaveSlotSummary(id: string, save: SaveData): SaveSlotSummary {
  const story = save.vn?.story ?? save.story;
  const line = story.text?.current ?? story.backlog.at(-1);
  return {
    id,
    label: id.replace("slot:game-a:", "Game A "),
    savedAt: save.savedAt,
    mode: "vn",
    ...(line?.speaker ? { speaker: line.speaker } : {}),
    ...(line?.text ? { text: line.text } : {})
  };
}

function loadGameASaves(): Record<string, SaveData> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(GAME_A_SAVE_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([slotId, save]) => {
        const result = SaveDataSchema.safeParse(save);
        return result.success ? [[slotId, result.data]] : [];
      })
    );
  } catch {
    return {};
  }
}

function persistGameASaves(saves: Record<string, SaveData>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GAME_A_SAVE_STORAGE_KEY, JSON.stringify(saves));
}
