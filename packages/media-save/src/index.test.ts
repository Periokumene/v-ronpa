import { describe, expect, it } from "vitest";
import { createSaveMigrator } from "./index";

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
});
