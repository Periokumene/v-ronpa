import { describe, expect, it } from "vitest";
import { createMemorySavePort, createSaveMigrator, createSaveSlotSummary } from "./index";

const baseSave = {
  version: 1 as const,
  savedAt: "2026-06-14T00:00:00.000Z",
  mode: "navi" as const,
  story: {
    currentScriptPath: "opening.nani",
    instructionPointer: 4,
    variables: {},
    backlog: [{ speaker: "Felix", text: "A saved line." }],
    pendingChoices: [],
    ended: false
  },
  inventory: { items: { "gift:coffee": 1 } },
  evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] },
  characters: {}
};

describe("media save contracts", () => {
  it("validates saves through the versioned migrator boundary", () => {
    const result = createSaveMigrator().migrate({
      version: 1,
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "trial",
      story: {
        currentScriptPath: "trial.nani",
        instructionPointer: 4,
        variables: {},
        backlog: [],
        pendingChoices: [],
        ended: false
      },
      inventory: { items: { "gift:coffee": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] },
      characters: {},
      trial: {
        trialId: "trial:case-01",
        currentSegmentId: "debate:door",
        presentation: "debate3d",
        inputLock: "trial-targeting"
      }
    });

    expect(result).toMatchObject({
      migrated: false,
      data: {
        version: 1,
        trial: { keywordStates: {} }
      }
    });
  });

  it("derives text slot summaries from save data", () => {
    expect(createSaveSlotSummary("slot:1", "Slot 1", baseSave)).toEqual({
      id: "slot:1",
      label: "Slot 1",
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "navi",
      speaker: "Felix",
      text: "A saved line."
    });
  });

  it("lists summaries and deletes slots through the save port", async () => {
    const port = createMemorySavePort();
    const summary = createSaveSlotSummary("slot:1", "Slot 1", baseSave);

    await port.save({
      id: "slot:1",
      label: "Slot 1",
      summary,
      data: { ...baseSave, summary }
    });

    await expect(port.listSummaries()).resolves.toEqual([summary]);
    await expect(port.load("slot:1")).resolves.toMatchObject({ id: "slot:1", data: { story: { instructionPointer: 4 } } });

    await port.delete("slot:1");

    await expect(port.load("slot:1")).resolves.toBeUndefined();
    await expect(port.list()).resolves.toEqual([]);
  });

  it("returns undefined for invalid slots without mutating stored summaries", async () => {
    const summary = createSaveSlotSummary("slot:1", "Slot 1", baseSave);
    const port = createMemorySavePort([{ id: "slot:1", label: "Slot 1", summary, data: { ...baseSave, summary } }]);

    await expect(port.load("slot:missing")).resolves.toBeUndefined();
    await port.delete("slot:missing");

    await expect(port.listSummaries()).resolves.toEqual([summary]);
  });
});
