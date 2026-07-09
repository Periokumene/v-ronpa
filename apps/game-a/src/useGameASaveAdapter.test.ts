import { describe, expect, it } from "vitest";
import type { PixiStageSnapshot, StoryRuntimeSnapshot } from "@v-ronpa/contracts";
import {
  GAME_A_SAVE_INDEX_KEY,
  createGameASaveData,
  createGameASaveIndex,
  createGameASaveRecord,
  gameAManualSaveSlotCount,
  gameAQuickSaveSlotId,
  gameASaveRecordKey,
  gameASaveSlotIds,
  loadGameASaveRecords,
  parseGameASaveRecordPayload,
  selectGameAManualSaveSlotSummaries,
  selectGameAQuickSaveSlotSummary
} from "./useGameASaveAdapter";

describe("game-a save adapter", () => {
  it("creates v5 save data only under the VN section and trims backlog without mutating runtime state", () => {
    const story = createStory(
      Array.from({ length: 25 }, (_, index) => ({
        speaker: "Mira",
        text: `Line ${index + 1}`
      }))
    );
    const originalBacklog = [...story.backlog];
    const data = createGameASaveData({ story, pixiStage: createPixiStage() });

    expect(data).toMatchObject({
      version: 5,
      mode: "vn",
      vn: {
        story: {
          backlog: expect.arrayContaining([{ speaker: "Mira", text: "Line 25" }])
        },
        pixiStage: { version: 5 }
      },
      navi: null,
      trial: null
    });
    expect(data).not.toHaveProperty("story");
    expect(data).not.toHaveProperty("pixiStage");
    expect(data.vn?.story.backlog).toHaveLength(20);
    expect(data.vn?.story.backlog[0]?.text).toBe("Line 6");
    expect(story.backlog).toEqual(originalBacklog);
    expect(story.backlog).toHaveLength(25);
  });

  it("wraps saves in an app-local record envelope with preview space reserved", () => {
    const data = createGameASaveData({ story: createStory([{ speaker: "Mira", text: "Ready." }]), pixiStage: createPixiStage() });
    const record = createGameASaveRecord("slot:game-a:1", data);

    expect(record).toMatchObject({
      schemaVersion: 2,
      slotId: "slot:game-a:1",
      label: "Game A 1",
      savedAt: data.savedAt,
      summary: {
        id: "slot:game-a:1",
        label: "Game A 1",
        mode: "vn",
        speaker: "Mira",
        text: "Ready."
      },
      data: {
        version: 5,
        vn: {
          story: { instructionPointer: 0 },
          pixiStage: { version: 5 }
        }
      },
      preview: { kind: "none" }
    });
  });

  it("loads independent slot records by record key and treats the index as a cache", () => {
    const storage = new MemoryStorage();
    const first = createGameASaveRecord(
      "slot:game-a:1",
      createGameASaveData({ story: createStory([{ speaker: "Mira", text: "First." }]), pixiStage: createPixiStage() })
    );
    const second = createGameASaveRecord(
      "slot:game-a:2",
      createGameASaveData({ story: createStory([{ speaker: "Mira", text: "Second." }]), pixiStage: createPixiStage() })
    );
    const quick = createGameASaveRecord(
      gameAQuickSaveSlotId,
      createGameASaveData({ story: createStory([{ speaker: "Mira", text: "Quick." }]), pixiStage: createPixiStage() })
    );

    storage.setItem(gameASaveRecordKey(first.slotId), JSON.stringify(first));
    storage.setItem(gameASaveRecordKey(second.slotId), JSON.stringify(second));
    storage.setItem(gameASaveRecordKey(quick.slotId), JSON.stringify(quick));
    storage.setItem(GAME_A_SAVE_INDEX_KEY, JSON.stringify({ schemaVersion: 1, slotIds: [], updatedAtBySlot: {} }));
    storage.setItem("v-ronpa:game-a:saves", JSON.stringify({ slots: [first] }));

    const loaded = loadGameASaveRecords(storage);

    expect(Object.keys(loaded)).toEqual(["slot:game-a:1", "slot:game-a:2", gameAQuickSaveSlotId]);
    expect(loaded["slot:game-a:1"]?.summary.text).toBe("First.");
    expect(loaded["slot:game-a:2"]?.summary.text).toBe("Second.");
    expect(selectGameAManualSaveSlotSummaries(loaded).map((slot) => slot.id)).toEqual(["slot:game-a:1", "slot:game-a:2"]);
    expect(selectGameAQuickSaveSlotSummary(loaded)).toMatchObject({ id: gameAQuickSaveSlotId, text: "Quick." });
    expect(gameASaveRecordKey("slot:game-a:1")).not.toBe(gameASaveRecordKey("slot:game-a:2"));
    expect(createGameASaveIndex(loaded)).toEqual({
      schemaVersion: 2,
      slotIds: ["slot:game-a:1", "slot:game-a:2", gameAQuickSaveSlotId],
      updatedAtBySlot: {
        "slot:game-a:1": first.savedAt,
        "slot:game-a:2": second.savedAt,
        [gameAQuickSaveSlotId]: quick.savedAt
      }
    });
  });

  it("treats invalid, mismatched, and old records as empty slots", () => {
    const valid = createGameASaveRecord(
      "slot:game-a:1",
      createGameASaveData({ story: createStory([{ speaker: "Mira", text: "Valid." }]), pixiStage: createPixiStage() })
    );
    const oldRecord = {
      ...valid,
      data: {
        version: 4,
        savedAt: valid.savedAt,
        mode: "vn",
        story: createStory([]),
        pixiStage: createPixiStage(),
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      }
    };

    expect(parseGameASaveRecordPayload(JSON.stringify(valid), "slot:game-a:1")).toMatchObject({ slotId: "slot:game-a:1" });
    expect(parseGameASaveRecordPayload(JSON.stringify(valid), "slot:game-a:2")).toBeUndefined();
    expect(parseGameASaveRecordPayload(JSON.stringify({ ...valid, slotId: "slot:game-a:41" }), "slot:game-a:41")).toBeUndefined();
    expect(parseGameASaveRecordPayload(JSON.stringify({ ...valid, schemaVersion: 1 }), "slot:game-a:1")).toBeUndefined();
    expect(parseGameASaveRecordPayload(JSON.stringify({ ...valid, schemaVersion: 0 }), "slot:game-a:1")).toBeUndefined();
    expect(parseGameASaveRecordPayload(JSON.stringify(oldRecord), "slot:game-a:1")).toBeUndefined();
    expect(parseGameASaveRecordPayload("{", "slot:game-a:1")).toBeUndefined();
  });

  it("normalizes stale record summaries from v5 data instead of trusting a second authority", () => {
    const record = createGameASaveRecord(
      "slot:game-a:1",
      createGameASaveData({ story: createStory([{ speaker: "Mira", text: "Data wins." }]), pixiStage: createPixiStage() })
    );
    const stale = {
      ...record,
      label: "Wrong label",
      savedAt: "1999-01-01T00:00:00.000Z",
      summary: {
        ...record.summary,
        savedAt: "1999-01-01T00:00:00.000Z",
        speaker: "Stale",
        text: "Wrong line."
      }
    };

    expect(parseGameASaveRecordPayload(JSON.stringify(stale), "slot:game-a:1")).toMatchObject({
      label: "Game A 1",
      savedAt: record.data.savedAt,
      summary: {
        savedAt: record.data.savedAt,
        speaker: "Mira",
        text: "Data wins."
      }
    });
  });

  it("keeps forty manual slots plus an independent hidden quick slot for game-a", () => {
    expect(gameASaveSlotIds).toHaveLength(gameAManualSaveSlotCount);
    expect(gameASaveSlotIds.slice(0, 3)).toEqual(["slot:game-a:1", "slot:game-a:2", "slot:game-a:3"]);
    expect(gameASaveSlotIds.at(-1)).toBe("slot:game-a:40");
    expect(gameASaveSlotIds).not.toContain(gameAQuickSaveSlotId);
  });
});

function createStory(backlog: StoryRuntimeSnapshot["backlog"]): StoryRuntimeSnapshot {
  return {
    currentScriptPath: "game-a/opening.nani",
    instructionPointer: 0,
    variables: {},
    backlog,
    pendingChoices: [],
    ended: false
  };
}

function createPixiStage(): PixiStageSnapshot {
  return {
    version: 5,
    revision: 0,
    backgroundsById: {},
    innerBackgroundsById: {},
    charactersById: {},
    actorOrder: [],
    weather: {},
    screenFilters: {}
  };
}

class MemoryStorage implements Storage {
  readonly #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
  }

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.#entries.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.#entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#entries.set(key, value);
  }
}
