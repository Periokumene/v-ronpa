import Dexie, { type EntityTable } from "dexie";
import { Howl } from "howler";
import { SaveDataSchema, createSaveSlotSummaryFromSaveData, type SaveData, type SaveSlotSummary } from "@v-ronpa/contracts";

export type SaveOperationErrorCode = "invalid-save" | "storage-failed" | "unsupported-version";

export interface SaveOperationError {
  code: SaveOperationErrorCode;
  message: string;
  cause?: unknown;
}

export type SaveOperationResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: SaveOperationError };

export const SAVE_SLOT_THUMBNAIL_WIDTH = 320;
export const SAVE_SLOT_THUMBNAIL_HEIGHT = 180;
export const SAVE_SLOT_THUMBNAIL_MIME = "image/webp";
export const SAVE_SLOT_THUMBNAIL_QUALITY = 0.8;

export type SavePreviewMime = typeof SAVE_SLOT_THUMBNAIL_MIME;

export interface SaveSlotThumbnailCaptureOptions {
  width: number;
  height: number;
  mime: SavePreviewMime;
  quality: number;
}

export const SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS: SaveSlotThumbnailCaptureOptions = {
  width: SAVE_SLOT_THUMBNAIL_WIDTH,
  height: SAVE_SLOT_THUMBNAIL_HEIGHT,
  mime: SAVE_SLOT_THUMBNAIL_MIME,
  quality: SAVE_SLOT_THUMBNAIL_QUALITY
};

export interface SaveSlotPreviewMetadata {
  kind: "image";
  mime: SavePreviewMime;
  width: number;
  height: number;
  byteLength: number;
  capturedAt: string;
}

export interface SaveSlotPreview {
  metadata: SaveSlotPreviewMetadata;
  blob: Blob;
}

export interface SaveSlot {
  id: string;
  label: string;
  summary: SaveSlotSummary;
  data: SaveData;
  preview?: SaveSlotPreview;
}

export interface SaveSlotWrite {
  id: string;
  label: string;
  data: SaveData;
  preview?: SaveSlotPreview;
}

export interface SaveSlotPolicy {
  namespace: string;
  manualSlotCount: number;
  manualSlotIds: string[];
  quickSlotId: string;
  allSlotIds: string[];
  isManualSlot(slotId: string): boolean;
  isQuickSlot(slotId: string): boolean;
  labelForSlot(slotId: string): string;
}

export interface SavePort {
  save(slot: SaveSlotWrite): Promise<SaveOperationResult<SaveSlotSummary>>;
  load(id: string): Promise<SaveOperationResult<SaveSlot | undefined>>;
  list(): Promise<SaveOperationResult<SaveSlot[]>>;
  listSummaries(): Promise<SaveOperationResult<SaveSlotSummary[]>>;
  loadPreviews(slotIds: string[]): Promise<SaveOperationResult<Record<string, SaveSlotPreview>>>;
  delete(id: string): Promise<SaveOperationResult>;
}

export type AudioHandleFinishReason = "ended" | "stopped" | "failed";

export interface AudioHandleFinishResult {
  reason: AudioHandleFinishReason;
}

export interface AudioHandle {
  id: string;
  finished: Promise<AudioHandleFinishResult>;
  stop(): void;
  fade(to: number, durationMs: number): void;
  fadeOutAndStop(durationMs: number): void;
}

export interface AudioPort {
  playBgm(id: string, uri: string, options?: { loop?: boolean; volume?: number; fadeInMs?: number }): AudioHandle;
  playSfx(id: string, uri: string, options?: { loop?: boolean; volume?: number; fadeInMs?: number }): AudioHandle;
  playDialogueBleep(id: string, uri: string, options?: { volume?: number }): AudioHandle;
  playVoice(id: string, uri: string, options?: { volume?: number }): AudioHandle;
  stopAll(): void;
}

export interface VideoPort {
  attach(element: HTMLVideoElement): void;
  play(uri: string): Promise<void>;
  stop(): void;
}

interface ActiveHowl {
  howl: Howl;
  release(reason?: AudioHandleFinishReason, stopHowl?: boolean): void;
}

interface SaveSlotIndexRecord {
  id: string;
  label: string;
  summary: SaveSlotSummary;
  savedAt: string;
  mode: SaveData["mode"];
}

interface SaveSlotPayloadRecord {
  slotId: string;
  data: SaveData;
}

interface SaveSlotPreviewRecord {
  slotId: string;
  metadata: SaveSlotPreviewMetadata;
  blob: Blob;
}

export class UnsupportedSaveVersionError extends Error {
  readonly code = "unsupported-version" as const;

  constructor(readonly actualVersion: unknown) {
    super(`SaveData version ${String(actualVersion)} is unsupported; expected version 11.`);
    this.name = "UnsupportedSaveVersionError";
  }
}

interface SaveDbShape extends Dexie {
  slots: EntityTable<SaveSlotIndexRecord, "id">;
  payloads: EntityTable<SaveSlotPayloadRecord, "slotId">;
  previews: EntityTable<SaveSlotPreviewRecord, "slotId">;
}

export function parseSaveData(value: unknown): SaveData {
  if (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version !== 11
  ) {
    throw new UnsupportedSaveVersionError(value.version);
  }
  return SaveDataSchema.parse(value);
}

export function createSaveSlotSummary(id: string, label: string, data: SaveData): SaveSlotSummary {
  return createSaveSlotSummaryFromSaveData(id, label, data);
}

export function createFortyPlusQuickSaveSlotPolicy(
  namespace: string,
  options: { manualSlotCount?: number; manualLabelPrefix?: string; quickLabel?: string } = {}
): SaveSlotPolicy {
  const manualSlotCount = options.manualSlotCount ?? 40;
  const manualSlotIds = Array.from({ length: manualSlotCount }, (_, index) => `slot:${namespace}:${index + 1}`);
  const quickSlotId = `slot:${namespace}:quick`;
  const manualLabelPrefix = options.manualLabelPrefix ?? "Slot";
  const quickLabel = options.quickLabel ?? "Quick Save";
  return {
    namespace,
    manualSlotCount,
    manualSlotIds,
    quickSlotId,
    allSlotIds: [...manualSlotIds, quickSlotId],
    isManualSlot(slotId) {
      return manualSlotIds.includes(slotId);
    },
    isQuickSlot(slotId) {
      return slotId === quickSlotId;
    },
    labelForSlot(slotId) {
      if (slotId === quickSlotId) return quickLabel;
      const manualIndex = manualSlotIds.indexOf(slotId);
      return manualIndex >= 0 ? `${manualLabelPrefix} ${manualIndex + 1}` : slotId;
    }
  };
}

export function selectManualSaveSlotSummaries(policy: SaveSlotPolicy, summaries: SaveSlotSummary[]): SaveSlotSummary[] {
  const summariesById = new Map(summaries.map((summary) => [summary.id, summary]));
  return policy.manualSlotIds.flatMap((slotId) => {
    const summary = summariesById.get(slotId);
    return summary ? [summary] : [];
  });
}

export function selectQuickSaveSlotSummary(policy: SaveSlotPolicy, summaries: SaveSlotSummary[]): SaveSlotSummary | undefined {
  return summaries.find((summary) => summary.id === policy.quickSlotId);
}

function normalizeSaveSlotWrite(slot: SaveSlotWrite): SaveSlot {
  const data = parseSaveData(slot.data);
  const summary = createSaveSlotSummary(slot.id, slot.label, data);
  return {
    id: slot.id,
    label: summary.label,
    data,
    summary,
    ...(slot.preview ? { preview: normalizePreview(slot.preview) } : {})
  };
}

export function createDexieSavePort(dbName = "v-ronpa-saves"): SavePort {
  const db = new Dexie(dbName) as SaveDbShape;
  db.version(1).stores({
    slots: "id, label, savedAt, mode",
    payloads: "slotId",
    previews: "slotId"
  });

  return {
    async save(slot) {
      let normalized: SaveSlot;
      try {
        normalized = normalizeSaveSlotWrite(slot);
      } catch (cause) {
        return fail(saveError(cause, "invalid-save"));
      }
      try {
        await db.transaction("rw", db.slots, db.payloads, db.previews, async () => {
          await db.slots.put(createSlotIndexRecord(normalized));
          await db.payloads.put({ slotId: normalized.id, data: normalized.data });
          if (normalized.preview) {
            await db.previews.put({ slotId: normalized.id, metadata: normalized.preview.metadata, blob: normalized.preview.blob });
          } else {
            await db.previews.delete(normalized.id);
          }
        });
        return ok(normalized.summary);
      } catch (cause) {
        return fail(saveError(cause, "storage-failed"));
      }
    },
    async load(id) {
      try {
        let slot: SaveSlotIndexRecord | undefined;
        let payload: SaveSlotPayloadRecord | undefined;
        let preview: SaveSlotPreviewRecord | undefined;
        await db.transaction("r", db.slots, db.payloads, db.previews, async () => {
          [slot, payload, preview] = await Promise.all([db.slots.get(id), db.payloads.get(id), db.previews.get(id)]);
        });
        if (!slot) return ok(undefined);
        if (!payload) return fail({ code: "storage-failed", message: `Save slot ${id} is missing its payload.` });
        const data = parseSaveData(payload.data);
        const summary = createSaveSlotSummary(slot.id, slot.label, data);
        return ok({
          id: slot.id,
          label: slot.label,
          summary,
          data,
          ...(preview ? { preview: normalizePreview(preview) } : {})
        });
      } catch (cause) {
        return fail(saveError(cause));
      }
    },
    async list() {
      try {
        let slotIndexes: SaveSlotIndexRecord[] = [];
        let payloads: SaveSlotPayloadRecord[] = [];
        let previews: SaveSlotPreviewRecord[] = [];
        await db.transaction("r", db.slots, db.payloads, db.previews, async () => {
          [slotIndexes, payloads, previews] = await Promise.all([db.slots.toArray(), db.payloads.toArray(), db.previews.toArray()]);
        });
        const payloadsById = new Map(payloads.map((payload) => [payload.slotId, payload]));
        const previewsById = new Map(previews.map((preview) => [preview.slotId, preview]));
        return ok(
          slotIndexes.flatMap((slot) => {
            const payload = payloadsById.get(slot.id);
            if (!payload) return [];
            const data = parseSaveData(payload.data);
            return [
              {
                id: slot.id,
                label: slot.label,
                summary: createSaveSlotSummary(slot.id, slot.label, data),
                data,
                ...(previewsById.get(slot.id) ? { preview: normalizePreview(previewsById.get(slot.id)!) } : {})
              }
            ];
          })
        );
      } catch (cause) {
        return fail(saveError(cause));
      }
    },
    async listSummaries() {
      try {
        const slots = await db.slots.toArray();
        return ok(slots.map((slot) => slot.summary));
      } catch (cause) {
        return fail(saveError(cause, "storage-failed"));
      }
    },
    async loadPreviews(slotIds) {
      try {
        if (slotIds.length === 0) return ok({});
        const records = await db.previews.bulkGet(slotIds);
        return ok(
          Object.fromEntries(
            records.flatMap((record) => (record ? [[record.slotId, normalizePreview(record)] as const] : []))
          )
        );
      } catch (cause) {
        return fail(saveError(cause, "storage-failed"));
      }
    },
    async delete(id) {
      try {
        await db.transaction("rw", db.slots, db.payloads, db.previews, async () => {
          await Promise.all([db.slots.delete(id), db.payloads.delete(id), db.previews.delete(id)]);
        });
        return ok(undefined);
      } catch (cause) {
        return fail(saveError(cause, "storage-failed"));
      }
    }
  };
}

export function createMemorySavePort(initialSlots: SaveSlot[] = []): SavePort {
  const slots = new Map<string, SaveSlotIndexRecord>();
  const payloads = new Map<string, SaveSlotPayloadRecord>();
  const previews = new Map<string, SaveSlotPreviewRecord>();

  for (const slot of initialSlots) {
    const normalized = normalizeSaveSlotWrite(slot);
    slots.set(normalized.id, createSlotIndexRecord(normalized));
    payloads.set(normalized.id, { slotId: normalized.id, data: normalized.data });
    if (normalized.preview) previews.set(normalized.id, { slotId: normalized.id, metadata: normalized.preview.metadata, blob: normalized.preview.blob });
  }

  return {
    async save(slot) {
      try {
        const normalized = normalizeSaveSlotWrite(slot);
        slots.set(normalized.id, createSlotIndexRecord(normalized));
        payloads.set(normalized.id, { slotId: normalized.id, data: normalized.data });
        if (normalized.preview) previews.set(normalized.id, { slotId: normalized.id, metadata: normalized.preview.metadata, blob: normalized.preview.blob });
        else previews.delete(normalized.id);
        return ok(normalized.summary);
      } catch (cause) {
        return fail(saveError(cause));
      }
    },
    async load(id) {
      try {
        const slot = slots.get(id);
        if (!slot) return ok(undefined);
        const payload = payloads.get(id);
        if (!payload) return fail({ code: "storage-failed", message: `Save slot ${id} is missing its payload.` });
        const data = parseSaveData(payload.data);
        const preview = previews.get(id);
        return ok({
          id: slot.id,
          label: slot.label,
          summary: createSaveSlotSummary(slot.id, slot.label, data),
          data,
          ...(preview ? { preview: normalizePreview(preview) } : {})
        });
      } catch (cause) {
        return fail(saveError(cause));
      }
    },
    async list() {
      try {
        return ok(
          [...slots.values()].flatMap((slot) => {
            const payload = payloads.get(slot.id);
            if (!payload) return [];
            const data = parseSaveData(payload.data);
            const preview = previews.get(slot.id);
            return [
              {
                id: slot.id,
                label: slot.label,
                summary: createSaveSlotSummary(slot.id, slot.label, data),
                data,
                ...(preview ? { preview: normalizePreview(preview) } : {})
              }
            ];
          })
        );
      } catch (cause) {
        return fail(saveError(cause));
      }
    },
    async listSummaries() {
      return ok([...slots.values()].map((slot) => slot.summary));
    },
    async loadPreviews(slotIds) {
      return ok(
        Object.fromEntries(
          slotIds.flatMap((slotId) => {
            const preview = previews.get(slotId);
            return preview ? [[slotId, normalizePreview(preview)] as const] : [];
          })
        )
      );
    },
    async delete(id) {
      slots.delete(id);
      payloads.delete(id);
      previews.delete(id);
      return ok(undefined);
    }
  };
}

function createSlotIndexRecord(slot: SaveSlot): SaveSlotIndexRecord {
  return {
    id: slot.id,
    label: slot.summary.label,
    summary: slot.summary,
    savedAt: slot.summary.savedAt,
    mode: slot.summary.mode
  };
}

function normalizePreview(preview: SaveSlotPreview | SaveSlotPreviewRecord): SaveSlotPreview {
  const metadata = preview.metadata;
  if (metadata.kind !== "image") throw new Error("Save preview metadata kind must be image.");
  if (metadata.mime !== SAVE_SLOT_THUMBNAIL_MIME) throw new Error(`Save preview mime must be ${SAVE_SLOT_THUMBNAIL_MIME}.`);
  if (metadata.width !== SAVE_SLOT_THUMBNAIL_WIDTH) throw new Error(`Save preview width must be ${SAVE_SLOT_THUMBNAIL_WIDTH}.`);
  if (metadata.height !== SAVE_SLOT_THUMBNAIL_HEIGHT) throw new Error(`Save preview height must be ${SAVE_SLOT_THUMBNAIL_HEIGHT}.`);
  if (typeof metadata.capturedAt !== "string" || metadata.capturedAt.length === 0) throw new Error("Save preview capturedAt is required.");
  return {
    metadata: {
      ...metadata,
      byteLength: preview.blob.size
    },
    blob: preview.blob
  };
}

function ok<T>(value: T): SaveOperationResult<T> {
  return { ok: true, value };
}

function fail(error: SaveOperationError): SaveOperationResult<never> {
  return { ok: false, error };
}

function saveError(cause: unknown, fallbackCode: SaveOperationErrorCode = "invalid-save"): SaveOperationError {
  const message = cause instanceof Error ? cause.message : "Save operation failed.";
  return {
    code: cause instanceof UnsupportedSaveVersionError ? cause.code : fallbackCode,
    message,
    cause
  };
}

export function createHowlerAudioPort(): AudioPort {
  const handles = new Map<string, ActiveHowl>();
  const fadeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function register(id: string, howl: Howl, options: { releaseOnEnd?: boolean } = {}): AudioHandle {
    const previous = handles.get(id);
    if (previous) previous.release("stopped");
    let released = false;
    let resolveFinished: (result: AudioHandleFinishResult) => void = () => {};
    const finished = new Promise<AudioHandleFinishResult>((resolve) => {
      resolveFinished = resolve;
    });
    const record: ActiveHowl = { howl, release };
    handles.set(id, record);
    function release(reason: AudioHandleFinishReason = "stopped", stopHowl = true) {
      if (released) return;
      released = true;
      const timer = fadeTimers.get(id);
      if (timer) globalThis.clearTimeout(timer);
      fadeTimers.delete(id);
      if (stopHowl) howl.stop();
      if (handles.get(id) === record) handles.delete(id);
      resolveFinished({ reason });
    }
    if (options.releaseOnEnd) howl.once("end", () => release("ended", false));
    howl.once("loaderror", () => release("failed", false));
    howl.once("playerror", () => release("failed", false));
    try {
      howl.play();
    } catch {
      release("failed", false);
    }
    return {
      id,
      finished,
      stop() {
        release("stopped");
      },
      fade(to, durationMs) {
        if (released) return;
        howl.fade(howl.volume(), to, audioFadeDurationMs(durationMs));
      },
      fadeOutAndStop(durationMs) {
        if (released) return;
        const timer = fadeTimers.get(id);
        if (timer) globalThis.clearTimeout(timer);
        const clampedDurationMs = Math.max(0, Math.floor(durationMs));
        howl.fade(howl.volume(), 0, clampedDurationMs);
        if (clampedDurationMs === 0) {
          release("stopped");
          return;
        }
        fadeTimers.set(id, globalThis.setTimeout(() => release("stopped"), clampedDurationMs));
      }
    };
  }

  return {
    playBgm(id, uri, options) {
      const targetVolume = options?.volume ?? 0.7;
      const fadeInMs = audioFadeDurationMs(options?.fadeInMs ?? 0);
      const handle = register(
        id,
        new Howl({
          src: [uri],
          loop: options?.loop ?? true,
          volume: fadeInMs > 0 ? 0 : targetVolume,
          html5: false
        }),
        { releaseOnEnd: false }
      );
      if (fadeInMs > 0) handle.fade(targetVolume, fadeInMs);
      return handle;
    },
    playSfx(id, uri, options) {
      const loop = options?.loop ?? false;
      const targetVolume = options?.volume ?? 1;
      const fadeInMs = audioFadeDurationMs(options?.fadeInMs ?? 0);
      const handle = register(
        id,
        new Howl({
          src: [uri],
          loop,
          volume: fadeInMs > 0 ? 0 : targetVolume,
          html5: false
        }),
        { releaseOnEnd: !loop }
      );
      if (fadeInMs > 0) handle.fade(targetVolume, fadeInMs);
      return handle;
    },
    playDialogueBleep(id, uri, options) {
      return register(
        id,
        new Howl({
          src: [uri],
          loop: true,
          volume: options?.volume ?? 1,
          html5: false
        }),
        { releaseOnEnd: false }
      );
    },
    playVoice(id, uri, options) {
      return register(
        id,
        new Howl({
          src: [uri],
          loop: false,
          volume: options?.volume ?? 1,
          html5: false
        }),
        { releaseOnEnd: true }
      );
    },
    stopAll() {
      for (const timer of fadeTimers.values()) globalThis.clearTimeout(timer);
      fadeTimers.clear();
      for (const record of [...handles.values()]) record.release("stopped");
    }
  };
}

function audioFadeDurationMs(durationMs: number): number {
  return Math.max(0, Math.floor(durationMs));
}

export function createHtmlVideoPort(): VideoPort {
  let element: HTMLVideoElement | undefined;
  return {
    attach(next) {
      element = next;
    },
    async play(uri) {
      if (!element) throw new Error("Video element is not attached.");
      element.src = uri;
      await element.play();
    },
    stop() {
      if (!element) return;
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
  };
}

// Future rhythm gameplay can add WebAudio clock/sync without changing AudioPort callers.
export interface WebAudioRhythmPortTodo {
  readonly status: "todo";
  readonly reason: "add shared audio clock and beat sync when rhythm gameplay enters scope";
}
