import { describe, expect, it, vi } from "vitest";
import { createInitialPixiStageSnapshot } from "@v-ronpa/pixi-stage-model";
import {
  mergeVisibleCharacterExpressions,
  preparePixiVnScriptPresentation
} from "./usePixiVnScriptPreparation";

describe("Pixi VN script preparation", () => {
  it("selects the target plan and merges expressions visible in a restored snapshot", async () => {
    const snapshot = createInitialPixiStageSnapshot();
    snapshot.charactersById.alice = {
      id: "alice",
      kind: "character",
      appearanceExpression: "Pensive",
      visible: true,
      alpha: 1,
      z: 1,
      filters: {},
      transition: { durationMs: 0, lazy: false, wait: false }
    };
    const plans = {
      "game/chapter.nani": [{ characterId: "alice", appearanceExpressions: ["Smile"] }]
    };
    const prepareCharacters = vi.fn(async () => ({ ok: true as const }));
    const result = await preparePixiVnScriptPresentation({
      getHandle: () => ({ ready: Promise.resolve(), prepareCharacters, captureThumbnail: async () => undefined }),
      plansByScriptPath: plans,
      waitUntilReady: async () => true
    }, {
      scriptPath: "game/chapter.nani",
      pixiStage: snapshot,
      signal: new AbortController().signal
    });

    expect(result).toEqual({ ok: true });
    expect(prepareCharacters).toHaveBeenCalledWith([
      { characterId: "alice", appearanceExpressions: ["Smile", "Pensive"] }
    ]);
  });

  it("rejects unavailable, aborted, and failed preparation without hiding the failure", async () => {
    const unavailable = await preparePixiVnScriptPresentation({
      getHandle: () => undefined,
      plansByScriptPath: {},
      waitUntilReady: async () => false
    }, { scriptPath: "game/chapter.nani", signal: new AbortController().signal });
    const abort = new AbortController();
    abort.abort();
    const aborted = await preparePixiVnScriptPresentation({
      getHandle: () => undefined,
      plansByScriptPath: {},
      waitUntilReady: async () => true
    }, { scriptPath: "game/chapter.nani", signal: abort.signal });
    const failed = await preparePixiVnScriptPresentation({
      getHandle: () => ({
        ready: Promise.resolve(),
        prepareCharacters: async () => ({
          ok: false as const,
          failures: [{ characterId: "alice", expression: "Missing", message: "missing" }]
        }),
        captureThumbnail: async () => undefined
      }),
      plansByScriptPath: { "game/chapter.nani": [] },
      waitUntilReady: async () => true
    }, { scriptPath: "game/chapter.nani", signal: new AbortController().signal });

    expect(unavailable).toMatchObject({ ok: false, code: "pixi-stage-unavailable" });
    expect(aborted).toMatchObject({ ok: false, code: "pixi-stage-unavailable" });
    expect(failed).toMatchObject({ ok: false, code: "character-prepare-failed" });
  });

  it("keeps the base plan reference when no saved characters need merging", () => {
    const plan = [{ characterId: "alice", appearanceExpressions: ["Smile"] }];
    expect(mergeVisibleCharacterExpressions(plan, undefined)).toBe(plan);
  });
});
