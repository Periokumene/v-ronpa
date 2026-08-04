import { describe, expect, it, vi } from "vitest";
import type { SaveData } from "@v-ronpa/contracts";
import { restoreGameAVnSave } from "./useGameAVnRuntime";

describe("game-a VN runtime wrapper", () => {
  it("returns restore rejection to the save controller", async () => {
    const rejection = { ok: false as const, code: "script-revision-mismatch" as const, message: "revision mismatch" };
    const restoreVnState = vi.fn(async () => rejection);
    const save = createSave();

    await expect(restoreGameAVnSave({ restoreVnState }, save)).resolves.toBe(rejection);
    expect(restoreVnState).toHaveBeenCalledWith({ gameId: "game-a", state: save.vn });
  });

  it("does not invoke VN restore for a save without VN state", () => {
    const restoreVnState = vi.fn();

    expect(restoreGameAVnSave({ restoreVnState }, { ...createSave(), mode: "navi", vn: null, navi: { substate: "walk", activeMapId: "map:test", inputLock: "none" } })).toBeUndefined();
    expect(restoreVnState).not.toHaveBeenCalled();
  });
});

function createSave(): SaveData {
  return {
    version: 11,
    gameId: "game-a",
    savedAt: "2026-07-11T00:00:00.000Z",
    mode: "vn",
    vn: {
      entryId: "vn:game-a-main",
      script: { scriptPath: "game-a/opening.nani", scriptRevision: "sha256:test" },
      story: {
        instructionPointer: 1,
        variables: {},
        backlog: [],
        pendingChoices: [],
        ended: false
      },
      pixiStage: {
        version: 6,
        revision: 0,
        backgroundsById: {},
        innerBackgroundsById: {},
        charactersById: {},
        actorOrder: [],
        weather: {},
        screenFilters: {}
      },
      media: { bgmByGroup: {}, loopingSfxByKey: {} },
      ui: { dialog: true, commandBar: true, toastLayer: true, cue: false, pinp: null }
    },
    navi: null,
    trial: null,
    inventory: { items: {} },
    evidence: { ownedEvidenceIds: [], submittedEvidenceIds: [] },
    characters: {}
  };
}
