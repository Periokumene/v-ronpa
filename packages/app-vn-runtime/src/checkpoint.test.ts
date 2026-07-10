import { describe, expect, it } from "vitest";
import type { StoryRuntimeSnapshot } from "@v-ronpa/contracts";
import { createInitialPixiStageSnapshot } from "@v-ronpa/pixi-stage-model";
import { collectVnSaveCheckpoint, validateVnRestoreIdentity } from "./checkpoint";

const entry = { id: "vn:test", scriptRevision: "sha256:test" };
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
      value: { entryId: "vn:test", scriptRevision: "sha256:test", ui: { dialog: true } }
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
    ["game-mismatch", { savedGameId: "other", savedEntryId: "vn:test", savedScriptRevision: "sha256:test" }],
    ["entry-mismatch", { savedGameId: "game:test", savedEntryId: "vn:other", savedScriptRevision: "sha256:test" }],
    ["script-revision-mismatch", { savedGameId: "game:test", savedEntryId: "vn:test", savedScriptRevision: "sha256:other" }]
  ] as const)("rejects %s identity", (code, saved) => {
    expect(
      validateVnRestoreIdentity({
        expectedGameId: "game:test",
        expectedEntryId: "vn:test",
        expectedScriptRevision: "sha256:test",
        ...saved
      })
    ).toMatchObject({ ok: false, code });
  });
});

function checkpoint(story: StoryRuntimeSnapshot) {
  return collectVnSaveCheckpoint({
    active: true,
    entry,
    story,
    pixiStage: createInitialPixiStageSnapshot(),
    ui: { dialog: true, commandBar: true, toastLayer: true }
  });
}
