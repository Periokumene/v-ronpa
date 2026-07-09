import { useCallback, useMemo, useState } from "react";
import {
  SaveSlotSummarySchema,
  SaveDataSchema,
  createSaveSlotSummaryFromSaveData,
  createSaveableStoryRuntimeSnapshot,
  type PixiStageSnapshot,
  type SaveData,
  type SaveSlotSummary,
  type StoryRuntimeSnapshot
} from "@v-ronpa/contracts";
import { createGameplayState } from "@v-ronpa/gameplay";
import { gameAVnEntry } from "./contentManifest";

const GAME_A_SAVE_STORAGE_PREFIX = "v-ronpa:game-a:saves:v6";
export const GAME_A_SAVE_INDEX_KEY = `${GAME_A_SAVE_STORAGE_PREFIX}:index`;
export const gameAManualSaveSlotCount = 40;
export const gameASaveSlotIds = Array.from({ length: gameAManualSaveSlotCount }, (_, index) => `slot:game-a:${index + 1}`);
export const gameAQuickSaveSlotId = "slot:game-a:quick";

const gameASaveRecordSlotIds = [...gameASaveSlotIds, gameAQuickSaveSlotId];

export interface GameASaveSnapshotInput {
  pixiStage: PixiStageSnapshot;
  story: StoryRuntimeSnapshot;
}

export interface GameASavePreviewNone {
  kind: "none";
}

export interface GameASavePreviewImage {
  kind: "image";
  mime: "image/webp" | "image/png";
  width: number;
  height: number;
  dataUrl: string;
}

export type GameASavePreview = GameASavePreviewNone | GameASavePreviewImage;

export interface GameASaveRecord {
  schemaVersion: 2;
  slotId: string;
  label: string;
  savedAt: string;
  summary: SaveSlotSummary;
  data: SaveData;
  preview: GameASavePreview;
}

export interface GameASaveIndex {
  schemaVersion: 2;
  slotIds: string[];
  updatedAtBySlot: Record<string, string>;
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

export function gameASaveRecordKey(slotId: string): string {
  return `${GAME_A_SAVE_STORAGE_PREFIX}:record:${slotId}`;
}

export function createGameASaveRecord(slotId: string, data: SaveData): GameASaveRecord {
  const parsedData = SaveDataSchema.parse(data);
  const summary = toSaveSlotSummary(slotId, parsedData);
  return {
    schemaVersion: 2,
    slotId,
    label: summary.label,
    savedAt: parsedData.savedAt,
    summary,
    data: parsedData,
    preview: { kind: "none" }
  };
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
  const [recordsBySlot, setRecordsBySlot] = useState<Record<string, GameASaveRecord>>(() => loadGameASaveRecords());
  const [pendingLoadSlot, setPendingLoadSlot] = useState<SaveSlotSummary | undefined>(undefined);

  const slots = useMemo(() => selectGameAManualSaveSlotSummaries(recordsBySlot), [recordsBySlot]);
  const quickSlot = useMemo(() => selectGameAQuickSaveSlotSummary(recordsBySlot), [recordsBySlot]);

  const persistRecordForSlot = useCallback(
    (slotId: string) => {
      const data = createGameASaveData({ story: getStory(), pixiStage: getPixiStage() });
      const record = createGameASaveRecord(slotId, data);
      if (!persistGameASaveRecord(record)) return;
      setRecordsBySlot((current) => {
        const next = { ...current, [slotId]: record };
        persistGameASaveIndex(createGameASaveIndex(next));
        return next;
      });
    },
    [getPixiStage, getStory]
  );

  const saveSlot = useCallback(
    (slotId: string) => {
      if (!gameASaveSlotIds.includes(slotId)) return;
      persistRecordForSlot(slotId);
    },
    [persistRecordForSlot]
  );

  return {
    cancelLoadSlot() {
      setPendingLoadSlot(undefined);
    },
    confirmLoadSlot() {
      const record = pendingLoadSlot ? recordsBySlot[pendingLoadSlot.id] : undefined;
      if (!record) return;
      onLoad(record.data);
      setPendingLoadSlot(undefined);
    },
    pendingLoadSlot,
    quickLoadSlot() {
      const record = recordsBySlot[gameAQuickSaveSlotId];
      if (!record) return false;
      onLoad(record.data);
      setPendingLoadSlot(undefined);
      return true;
    },
    quickSaveSlot() {
      persistRecordForSlot(gameAQuickSaveSlotId);
    },
    quickSlot,
    requestLoadSlot(slotId: string) {
      const record = recordsBySlot[slotId];
      if (!record) return;
      setPendingLoadSlot(record.summary);
    },
    saveSlot,
    slotIds: gameASaveSlotIds,
    slots
  };
}

function toSaveSlotSummary(id: string, save: SaveData): SaveSlotSummary {
  return createSaveSlotSummaryFromSaveData(id, labelForGameASaveSlot(id), save);
}

function labelForGameASaveSlot(id: string): string {
  if (id === gameAQuickSaveSlotId) return "Quick Save";
  return id.replace("slot:game-a:", "Game A ");
}

export function loadGameASaveRecords(storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): Record<string, GameASaveRecord> {
  if (!storage) return {};
  return Object.fromEntries(
    gameASaveRecordSlotIds.flatMap((slotId) => {
      const raw = storage.getItem(gameASaveRecordKey(slotId));
      const record = parseGameASaveRecordPayload(raw, slotId);
      return record ? [[slotId, record]] : [];
    })
  );
}

export function createGameASaveIndex(recordsBySlot: Record<string, GameASaveRecord>): GameASaveIndex {
  const records = gameASaveRecordSlotIds.flatMap((slotId) => (recordsBySlot[slotId] ? [recordsBySlot[slotId]] : []));
  return {
    schemaVersion: 2,
    slotIds: records.map((record) => record.slotId),
    updatedAtBySlot: Object.fromEntries(records.map((record) => [record.slotId, record.savedAt]))
  };
}

export function parseGameASaveRecordPayload(raw: string | null, expectedSlotId?: string): GameASaveRecord | undefined {
  if (!raw) return undefined;
  try {
    return parseGameASaveRecord(JSON.parse(raw), expectedSlotId);
  } catch {
    return undefined;
  }
}

export function parseGameASaveRecord(value: unknown, expectedSlotId?: string): GameASaveRecord | undefined {
  if (!isObject(value)) return undefined;
  if (value.schemaVersion !== 2) return undefined;
  if (typeof value.slotId !== "string") return undefined;
  if (expectedSlotId && value.slotId !== expectedSlotId) return undefined;
  if (!gameASaveRecordSlotIds.includes(value.slotId)) return undefined;
  if (typeof value.label !== "string" || value.label.length === 0) return undefined;
  if (typeof value.savedAt !== "string") return undefined;
  const summary = SaveSlotSummarySchema.safeParse(value.summary);
  if (!summary.success) return undefined;
  const data = SaveDataSchema.safeParse(value.data);
  if (!data.success) return undefined;
  const preview = parseGameASavePreview(value.preview);
  if (!preview) return undefined;
  const normalizedSummary = toSaveSlotSummary(value.slotId, data.data);
  return {
    schemaVersion: 2,
    slotId: value.slotId,
    label: normalizedSummary.label,
    savedAt: data.data.savedAt,
    summary: normalizedSummary,
    data: data.data,
    preview
  };
}

export function selectGameAManualSaveSlotSummaries(recordsBySlot: Record<string, GameASaveRecord>): SaveSlotSummary[] {
  return gameASaveSlotIds.flatMap((slotId) => (recordsBySlot[slotId] ? [recordsBySlot[slotId].summary] : []));
}

export function selectGameAQuickSaveSlotSummary(recordsBySlot: Record<string, GameASaveRecord>): SaveSlotSummary | undefined {
  return recordsBySlot[gameAQuickSaveSlotId]?.summary;
}

function parseGameASavePreview(value: unknown): GameASavePreview | undefined {
  if (!isObject(value)) return undefined;
  if (value.kind === "none") return { kind: "none" };
  if (value.kind !== "image") return undefined;
  if (value.mime !== "image/webp" && value.mime !== "image/png") return undefined;
  if (typeof value.width !== "number" || !Number.isInteger(value.width) || value.width <= 0) return undefined;
  if (typeof value.height !== "number" || !Number.isInteger(value.height) || value.height <= 0) return undefined;
  if (typeof value.dataUrl !== "string" || value.dataUrl.length === 0) return undefined;
  return {
    kind: "image",
    mime: value.mime,
    width: value.width,
    height: value.height,
    dataUrl: value.dataUrl
  };
}

function persistGameASaveRecord(record: GameASaveRecord): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(gameASaveRecordKey(record.slotId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function persistGameASaveIndex(index: GameASaveIndex): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(GAME_A_SAVE_INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
