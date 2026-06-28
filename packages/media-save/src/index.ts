import Dexie, { type EntityTable } from "dexie";
import { Howl } from "howler";
import { SaveDataSchema, type SaveData, type SaveSlotSummary } from "@v-ronpa/contracts";

export interface SaveSlot {
  id: string;
  label: string;
  summary: SaveSlotSummary;
  data: SaveData;
}

export interface SavePort {
  save(slot: SaveSlot): Promise<void>;
  load(id: string): Promise<SaveSlot | undefined>;
  list(): Promise<SaveSlot[]>;
  listSummaries(): Promise<SaveSlotSummary[]>;
  delete(id: string): Promise<void>;
}

export interface SaveMigrationResult {
  data: SaveData;
  migrated: boolean;
}

export interface SaveMigrator {
  migrate(value: unknown): SaveMigrationResult;
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
  playBgm(id: string, uri: string, options?: { loop?: boolean; volume?: number }): AudioHandle;
  playSfx(id: string, uri: string, options?: { loop?: boolean; volume?: number }): AudioHandle;
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

interface SaveDbShape extends Dexie {
  slots: EntityTable<SaveSlot, "id">;
}

export function createSaveMigrator(): SaveMigrator {
  return {
    migrate(value) {
      return {
        data: SaveDataSchema.parse(value),
        migrated: false
      };
    }
  };
}

export function createSaveSlotSummary(id: string, label: string, data: SaveData): SaveSlotSummary {
  const latest = data.story.backlog.at(-1);
  return {
    id,
    label,
    savedAt: data.savedAt,
    mode: data.mode,
    ...(latest?.speaker ? { speaker: latest.speaker } : {}),
    ...(latest?.text ? { text: latest.text } : {})
  };
}

function normalizeSlot(slot: SaveSlot, migrator: SaveMigrator): SaveSlot {
  const { data } = migrator.migrate(slot.data);
  const summary = createSaveSlotSummary(slot.id, slot.label, data);
  return {
    ...slot,
    data,
    summary
  };
}

export function createDexieSavePort(dbName = "v-ronpa-saves", migrator = createSaveMigrator()): SavePort {
  const db = new Dexie(dbName) as SaveDbShape;
  db.version(1).stores({
    slots: "id, label"
  });

  return {
    async save(slot) {
      await db.slots.put(normalizeSlot(slot, migrator));
    },
    async load(id) {
      const slot = await db.slots.get(id);
      if (!slot) return undefined;
      return normalizeSlot(slot, migrator);
    },
    async list() {
      const slots = await db.slots.toArray();
      return slots.map((slot) => normalizeSlot(slot, migrator));
    },
    async listSummaries() {
      const slots = await db.slots.toArray();
      return slots.map((slot) => normalizeSlot(slot, migrator).summary);
    },
    async delete(id) {
      await db.slots.delete(id);
    }
  };
}

export function createMemorySavePort(initialSlots: SaveSlot[] = [], migrator = createSaveMigrator()): SavePort {
  const slots = new Map(initialSlots.map((slot) => [slot.id, normalizeSlot(slot, migrator)]));

  return {
    async save(slot) {
      slots.set(slot.id, normalizeSlot(slot, migrator));
    },
    async load(id) {
      const slot = slots.get(id);
      return slot ? normalizeSlot(slot, migrator) : undefined;
    },
    async list() {
      return [...slots.values()].map((slot) => normalizeSlot(slot, migrator));
    },
    async listSummaries() {
      return [...slots.values()].map((slot) => normalizeSlot(slot, migrator).summary);
    },
    async delete(id) {
      slots.delete(id);
    }
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
        howl.fade(howl.volume(), to, durationMs);
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
      return register(
        id,
        new Howl({
          src: [uri],
          loop: options?.loop ?? true,
          volume: options?.volume ?? 0.7,
          html5: false
        }),
        { releaseOnEnd: false }
      );
    },
    playSfx(id, uri, options) {
      const loop = options?.loop ?? false;
      return register(
        id,
        new Howl({
          src: [uri],
          loop,
          volume: options?.volume ?? 1,
          html5: false
        }),
        { releaseOnEnd: !loop }
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
