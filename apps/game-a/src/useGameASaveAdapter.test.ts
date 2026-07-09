import { describe, expect, it } from "vitest";
import type { PixiStageSnapshot, StoryRuntimeSnapshot } from "@v-ronpa/contracts";
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
        entryId: "vn:game-a-opening",
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
    expect(GAME_A_SAVE_DB_NAME).toBe("v-ronpa-game-a-saves-v7");
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
      createGameASaveData({ story: createStory([{ speaker: "Mira", text: "Manual." }]), pixiStage: createPixiStage() })
    );
    const second = createSaveSlotSummary(
      "slot:game-a:2",
      gameASaveSlotPolicy.labelForSlot("slot:game-a:2"),
      createGameASaveData({ story: createStory([{ speaker: "Mira", text: "Second." }]), pixiStage: createPixiStage() })
    );
    const quick = createSaveSlotSummary(
      gameAQuickSaveSlotId,
      gameASaveSlotPolicy.labelForSlot(gameAQuickSaveSlotId),
      createGameASaveData({ story: createStory([{ speaker: "Mira", text: "Quick." }]), pixiStage: createPixiStage() })
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
