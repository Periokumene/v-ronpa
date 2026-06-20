import { describe, expect, it } from "vitest";
import { createGameplayState } from "@v-ronpa/gameplay";
import { parseScenario } from "@v-ronpa/nani-parser";
import { createInitialStoryState } from "@v-ronpa/story-engine";
import { createVerticalSliceSaveData, verticalSliceSaveSlotIds } from "./useVerticalSliceSaveAdapter";

describe("vertical slice save adapter", () => {
  it("collects public runtime state into versioned SaveData without UI state", () => {
    const { scenario } = parseScenario({ sourceText: "Felix: Save me.", scriptPath: "save-test.nani" });
    const story = {
      ...createInitialStoryState(scenario),
      instructionPointer: 1,
      backlog: [{ speaker: "Felix", text: "Save me." }]
    };
    const gameplay = {
      ...createGameplayState(),
      inventory: { items: { "gift:coffee": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] }
    };

    const save = createVerticalSliceSaveData({
      slotId: "slot:vertical:1",
      savedAt: "2026-06-20T00:00:00.000Z",
      navi: { substate: "vn2d-overlay", activeMapId: "map:academy-hall", inputLock: "dialog" },
      story,
      gameplay
    });

    expect(save).toMatchObject({
      version: 1,
      mode: "navi",
      summary: {
        id: "slot:vertical:1",
        label: "Slot 1",
        speaker: "Felix",
        text: "Save me."
      },
      inventory: { items: { "gift:coffee": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"] }
    });
    expect(save).not.toHaveProperty("overlayStack");
  });

  it("keeps the vertical-slice slot id policy in the app adapter layer", () => {
    expect(verticalSliceSaveSlotIds).toEqual([
      "slot:vertical:1",
      "slot:vertical:2",
      "slot:vertical:3",
      "slot:vertical:4"
    ]);
  });
});
