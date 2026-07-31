import { describe, expect, it } from "vitest";
import type { StoryRuntimeSnapshot } from "@v-ronpa/contracts";
import { createInitialPixiStageSnapshot } from "@v-ronpa/pixi-stage-model";
import { collectVnSaveCheckpoint, validateVnRestoreIdentity } from "./checkpoint";

const entryId = "vn:test";
const script = { scriptPath: "test.nani", scriptRevision: "sha256:test" };
const stableStory: StoryRuntimeSnapshot = {
  currentScriptPath: "test.nani",
  instructionPointer: 1,
  variables: {},
  backlog: [],
  pendingChoices: [],
  ended: false
};

describe("VN checkpoint authority", () => {
  it("creates a complete stable checkpoint", () => {
    expect(checkpoint(stableStory)).toMatchObject({
      ok: true,
      value: {
        entryId: "vn:test",
        script,
        media: { bgmByGroup: { music: { sourceRef: "bgm:main", volume: 0.4 } } },
        ui: { dialog: true }
      }
    });
  });

  it.each([
    ["input-wait", { runtimeWait: { kind: "input", commandId: "input", commandIndex: 1, variableName: "name", valueType: "string" } }],
    ["movie-wait", { runtimeWait: { kind: "movie", commandId: "movie", commandIndex: 1, moviePath: "video:test", allowSkip: true } }],
    ["pause-wait", { runtimeWait: { kind: "pause", commandId: "wait", commandIndex: 1, mode: "confirm" } }],
    ["ui-wait", { presentationWait: { channel: "ui", commandId: "hideui", commandIndex: 1, durationMs: 100, targets: ["dialog"], targetVisible: false } }],
    ["pixi-wait", { presentationWait: { channel: "pixi", commandId: "flash", commandIndex: 1, expectedTasks: [] } }]
  ] as const)("rejects %s without stripping the wait", (code, patch) => {
    expect(checkpoint({ ...stableStory, ...patch } as StoryRuntimeSnapshot)).toMatchObject({ ok: false, code });
  });

  it.each([
    ["game-mismatch", { savedGameId: "other", savedEntryId: "vn:test", savedScript: script }],
    ["entry-mismatch", { savedGameId: "game:test", savedEntryId: "vn:other", savedScript: script }],
    ["script-revision-mismatch", { savedGameId: "game:test", savedEntryId: "vn:test", savedScript: { ...script, scriptRevision: "sha256:other" } }]
  ] as const)("rejects %s identity", (code, saved) => {
    expect(
      validateVnRestoreIdentity({
        expectedGameId: "game:test",
        expectedEntryId: "vn:test",
        expectedScript: script,
        ...saved
      })
    ).toMatchObject({ ok: false, code });
  });
});

function checkpoint(story: StoryRuntimeSnapshot) {
  return collectVnSaveCheckpoint({
    active: true,
    entryId,
    script,
    story,
    pixiStage: createInitialPixiStageSnapshot(),
    media: {
      bgmByGroup: { music: { sourceRef: "bgm:main", volume: 0.4 } },
      loopingSfxByKey: { rain: { sourceRef: "sfx:rain", volume: 0.3, group: "rain" } }
    },
    ui: { dialog: true, commandBar: true, toastLayer: true, cue: false }
  });
}
