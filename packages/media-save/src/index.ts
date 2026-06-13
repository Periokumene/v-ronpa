import Dexie, { type EntityTable } from "dexie";
import { Howl } from "howler";
import { SaveDataSchema, type SaveData } from "@v-ronpa/contracts";

export interface SaveSlot {
  id: string;
  label: string;
  data: SaveData;
}

export interface SavePort {
  save(slot: SaveSlot): Promise<void>;
  load(id: string): Promise<SaveSlot | undefined>;
  list(): Promise<SaveSlot[]>;
}

export interface SaveMigrationResult {
  data: SaveData;
  migrated: boolean;
}

export interface SaveMigrator {
  migrate(value: unknown): SaveMigrationResult;
}

export interface AudioHandle {
  id: string;
  stop(): void;
  fade(to: number, durationMs: number): void;
}

export interface AudioPort {
  playBgm(id: string, uri: string, options?: { loop?: boolean; volume?: number }): AudioHandle;
  playSfx(id: string, uri: string, options?: { volume?: number }): AudioHandle;
  stopAll(): void;
}

export interface VideoPort {
  attach(element: HTMLVideoElement): void;
  play(uri: string): Promise<void>;
  stop(): void;
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

export function createDexieSavePort(dbName = "v-ronpa-saves", migrator = createSaveMigrator()): SavePort {
  const db = new Dexie(dbName) as SaveDbShape;
  db.version(1).stores({
    slots: "id, label"
  });

  return {
    async save(slot) {
      const { data } = migrator.migrate(slot.data);
      await db.slots.put({ ...slot, data });
    },
    async load(id) {
      const slot = await db.slots.get(id);
      if (!slot) return undefined;
      const { data } = migrator.migrate(slot.data);
      return { ...slot, data };
    },
    async list() {
      const slots = await db.slots.toArray();
      return slots.map((slot) => {
        const { data } = migrator.migrate(slot.data);
        return { ...slot, data };
      });
    }
  };
}

export function createHowlerAudioPort(): AudioPort {
  const handles = new Map<string, Howl>();

  function register(id: string, howl: Howl): AudioHandle {
    handles.set(id, howl);
    howl.play();
    return {
      id,
      stop() {
        howl.stop();
        handles.delete(id);
      },
      fade(to, durationMs) {
        howl.fade(howl.volume(), to, durationMs);
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
        })
      );
    },
    playSfx(id, uri, options) {
      return register(
        id,
        new Howl({
          src: [uri],
          loop: false,
          volume: options?.volume ?? 1,
          html5: false
        })
      );
    },
    stopAll() {
      for (const howl of handles.values()) howl.stop();
      handles.clear();
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
