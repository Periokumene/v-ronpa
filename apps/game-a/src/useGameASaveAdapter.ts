import { useCallback, useMemo } from "react";
import {
  SaveDataSchema,
  type SaveData,
  type SaveSlotSummary,
  type SaveableVnState
} from "@v-ronpa/contracts";
import type { VnSaveCheckpointResult } from "@v-ronpa/app-vn-runtime";
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

export const GAME_A_SAVE_DB_NAME = "v-ronpa-game-a-saves-v8";
export const gameASaveSlotPolicy = createFortyPlusQuickSaveSlotPolicy("game-a", { manualLabelPrefix: "Game A" });
export const gameAManualSaveSlotCount = gameASaveSlotPolicy.manualSlotCount;
export const gameASaveSlotIds = gameASaveSlotPolicy.manualSlotIds;
export const gameAQuickSaveSlotId = gameASaveSlotPolicy.quickSlotId;

export interface GameASaveSnapshotInput {
  vn: SaveableVnState;
}

export interface GameASaveAdapterOptions {
  canSave: () => boolean;
  getCheckpoint: () => VnSaveCheckpointResult;
  onLoad: (save: SaveData) => { ok: true } | { ok: false; code: string; message: string } | void;
  capturePreview?: (() => Promise<SaveSlotPreview | undefined> | SaveSlotPreview | undefined) | undefined;
  port?: SavePort | undefined;
}

export function createGameASaveData({ vn }: GameASaveSnapshotInput): SaveData {
  const gameplay = createGameplayState();
  return SaveDataSchema.parse({
    version: 6,
    gameId: "game-a",
    savedAt: new Date().toISOString(),
    mode: "vn",
    vn,
    navi: null,
    trial: null,
    inventory: gameplay.inventory,
    evidence: gameplay.evidence,
    characters: gameplay.characters
  });
}

export function useGameASaveAdapter({
  capturePreview,
  canSave,
  getCheckpoint,
  onLoad,
  port
}: GameASaveAdapterOptions) {
  const savePort = useMemo(() => port ?? createDexieSavePort(GAME_A_SAVE_DB_NAME), [port]);
  const collectSaveData = useCallback(() => {
    const checkpoint = getCheckpoint();
    return checkpoint.ok
      ? { ok: true as const, value: createGameASaveData({ vn: checkpoint.value }) }
      : checkpoint;
  }, [getCheckpoint]);
  const controller = useSaveSlotController({
    port: savePort,
    policy: gameASaveSlotPolicy,
    collectSaveData,
    canSave,
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
