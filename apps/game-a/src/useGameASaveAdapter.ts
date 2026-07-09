import { useCallback, useMemo } from "react";
import {
  SaveDataSchema,
  createSaveableStoryRuntimeSnapshot,
  type PixiStageSnapshot,
  type SaveData,
  type SaveSlotSummary,
  type StoryRuntimeSnapshot
} from "@v-ronpa/contracts";
import { createGameplayState } from "@v-ronpa/gameplay";
import { useSaveSlotController } from "@v-ronpa/app-vn-shell";
import {
  createDexieSavePort,
  createFortyPlusQuickSaveSlotPolicy,
  selectManualSaveSlotSummaries,
  selectQuickSaveSlotSummary,
  type SavePort,
  type SaveSlotPreview
} from "@v-ronpa/media-save";
import { gameAVnEntry } from "./contentManifest";

export const GAME_A_SAVE_DB_NAME = "v-ronpa-game-a-saves-v7";
export const gameASaveSlotPolicy = createFortyPlusQuickSaveSlotPolicy("game-a", { manualLabelPrefix: "Game A" });
export const gameAManualSaveSlotCount = gameASaveSlotPolicy.manualSlotCount;
export const gameASaveSlotIds = gameASaveSlotPolicy.manualSlotIds;
export const gameAQuickSaveSlotId = gameASaveSlotPolicy.quickSlotId;

export interface GameASaveSnapshotInput {
  pixiStage: PixiStageSnapshot;
  story: StoryRuntimeSnapshot;
}

export interface GameASaveAdapterOptions {
  getPixiStage: () => PixiStageSnapshot;
  getStory: () => StoryRuntimeSnapshot;
  onLoad: (save: SaveData) => void;
  capturePreview?: (() => Promise<SaveSlotPreview | undefined> | SaveSlotPreview | undefined) | undefined;
  port?: SavePort | undefined;
}

export function createGameASaveData({ pixiStage, story }: GameASaveSnapshotInput): SaveData {
  const gameplay = createGameplayState();
  return SaveDataSchema.parse({
    version: 5,
    savedAt: new Date().toISOString(),
    mode: "vn",
    vn: {
      entryId: gameAVnEntry.id,
      story: createSaveableStoryRuntimeSnapshot(story),
      pixiStage
    },
    navi: null,
    trial: null,
    inventory: gameplay.inventory,
    evidence: gameplay.evidence,
    characters: gameplay.characters
  });
}

export function useGameASaveAdapter({
  capturePreview,
  getPixiStage,
  getStory,
  onLoad,
  port
}: GameASaveAdapterOptions) {
  const savePort = useMemo(() => port ?? createDexieSavePort(GAME_A_SAVE_DB_NAME), [port]);
  const collectSaveData = useCallback(
    (): SaveData => createGameASaveData({ story: getStory(), pixiStage: getPixiStage() }),
    [getPixiStage, getStory]
  );
  const controller = useSaveSlotController({
    port: savePort,
    policy: gameASaveSlotPolicy,
    collectSaveData,
    restoreSaveData: onLoad,
    ...(capturePreview ? { capturePreview } : {})
  });

  return {
    collectSaveData,
    ...controller
  };
}

export function selectGameAManualSaveSlotSummaries(summaries: SaveSlotSummary[]): SaveSlotSummary[] {
  return selectManualSaveSlotSummaries(gameASaveSlotPolicy, summaries);
}

export function selectGameAQuickSaveSlotSummary(summaries: SaveSlotSummary[]): SaveSlotSummary | undefined {
  return selectQuickSaveSlotSummary(gameASaveSlotPolicy, summaries);
}
