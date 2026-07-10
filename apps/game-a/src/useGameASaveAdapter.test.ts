import { describe, expect, it } from "vitest";
import {
  createSaveableStorySnapshot,
  type PixiStageSnapshot,
  type SaveableVnState,
  type StoryRuntimeSnapshot
} from "@v-ronpa/contracts";
import { createSaveSlotSummary } from "@v-ronpa/media-save";
import {
  GAME_A_SAVE_DB_NAME,
  createGameASaveData,
  gameAManualSaveSlotCount,
  gameAQuickSaveSlotId,
  gameASaveSlotIds,
  gameASaveSlotPolicy,
  selectGameAManualSaveSlotSummaries,
  selectGameAQuickSaveSlotSummary
} from "./useGameASaveAdapter";

describe("game-a save adapter", () => {
  it("creates v6 save data from the canonical VN checkpoint", () => {
    const story = createStory(
      Array.from({ length: 25 }, (_, index) => ({
        speaker: "Mira",
        text: `Line ${index + 1}`
      }))
    );
    const originalBacklog = [...story.backlog];
    const data = createGameASaveData({ vn: createVnCheckpoint(story) });

    expect(data).toMatchObject({
      version: 6,
      gameId: "game-a",
      mode: "vn",
      vn: {
        entryId: "vn:game-a-opening",
        scriptRevision: "sha256:test",
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

  it("uses media-save as the sole slot policy authority for manual and quick saves", () => {
    expect(GAME_A_SAVE_DB_NAME).toBe("v-ronpa-game-a-saves-v8");
    expect(gameASaveSlotPolicy.namespace).toBe("game-a");
    expect(gameASaveSlotIds).toHaveLength(gameAManualSaveSlotCount);
    expect(gameASaveSlotIds.slice(0, 3)).toEqual(["slot:game-a:1", "slot:game-a:2", "slot:game-a:3"]);
    expect(gameASaveSlotIds.at(-1)).toBe("slot:game-a:40");
    expect(gameASaveSlotIds).not.toContain(gameAQuickSaveSlotId);
    expect(gameAQuickSaveSlotId).toBe("slot:game-a:quick");
    expect(gameASaveSlotPolicy.labelForSlot("slot:game-a:1")).toBe("Game A 1");
    expect(gameASaveSlotPolicy.labelForSlot(gameAQuickSaveSlotId)).toBe("Quick Save");
  });

  it("selects manual and quick summaries from media-save summary lists without local record envelopes", () => {
    const manual = createSaveSlotSummary(
      "slot:game-a:1",
      gameASaveSlotPolicy.labelForSlot("slot:game-a:1"),
      createGameASaveData({ vn: createVnCheckpoint(createStory([{ speaker: "Mira", text: "Manual." }])) })
    );
    const second = createSaveSlotSummary(
      "slot:game-a:2",
      gameASaveSlotPolicy.labelForSlot("slot:game-a:2"),
      createGameASaveData({ vn: createVnCheckpoint(createStory([{ speaker: "Mira", text: "Second." }])) })
    );
    const quick = createSaveSlotSummary(
      gameAQuickSaveSlotId,
      gameASaveSlotPolicy.labelForSlot(gameAQuickSaveSlotId),
      createGameASaveData({ vn: createVnCheckpoint(createStory([{ speaker: "Mira", text: "Quick." }])) })
    );

    expect(selectGameAManualSaveSlotSummaries([quick, second, manual])).toEqual([manual, second]);
    expect(selectGameAQuickSaveSlotSummary([manual, quick])).toBe(quick);
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

function createVnCheckpoint(story: StoryRuntimeSnapshot): SaveableVnState {
  return {
    entryId: "vn:game-a-opening",
    scriptRevision: "sha256:test",
    story: createSaveableStorySnapshot(story),
    pixiStage: createPixiStage(),
    ui: { dialog: true, commandBar: true, toastLayer: true }
  };
}
