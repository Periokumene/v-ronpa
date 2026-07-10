import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import {
  createGameFlowSnapshot,
  deriveGameInteractionState,
  gameFlowMachine,
  modeFromSnapshotValue,
  type PlayableGameMode
} from "./index";

describe("game flow machine", () => {
  it.each(["vn", "navi", "trial"] satisfies PlayableGameMode[])("starts and resumes the explicit %s mode", (mode) => {
    const actor = createActor(gameFlowMachine).start();
    actor.send({ type: "BOOT" });
    actor.send({ type: "START_NEW_GAME", mode });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe(mode);

    actor.send({ type: "PAUSE" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("paused");
    expect(actor.getSnapshot().context).toMatchObject({ overlayStack: ["pause-menu"], resumeMode: mode });
    const pausedInteraction = deriveGameInteractionState({
      flow: createGameFlowSnapshot(actor.getSnapshot().value, actor.getSnapshot().context),
      vn: { hasActiveStory: true, storyHasChoices: false, storyEnded: false, isAtStableStop: true, inputLock: "dialog" }
    });
    expect(pausedInteraction.capabilities).toMatchObject({
      canOpenBacklog: mode === "vn",
      canSave: true,
      canAuto: false,
      canSkip: false
    });
    actor.send({ type: "RESUME" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe(mode);
    expect(actor.getSnapshot().context).toEqual({ overlayStack: [], resumeMode: null });
  });

  it("ignores repeated pause while already paused", () => {
    const actor = createActor(gameFlowMachine).start();
    actor.send({ type: "BOOT" });
    actor.send({ type: "START_NEW_GAME", mode: "vn" });
    actor.send({ type: "PAUSE" });
    actor.send({ type: "PAUSE" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("paused");
    expect(actor.getSnapshot().context).toEqual({ overlayStack: ["pause-menu"], resumeMode: "vn" });
  });

  it("closes nested pause sections before resuming the root pause surface", () => {
    const actor = createActor(gameFlowMachine).start();
    actor.send({ type: "BOOT" });
    actor.send({ type: "START_NEW_GAME", mode: "vn" });
    actor.send({ type: "PAUSE" });
    actor.send({ type: "OPEN_OVERLAY", overlay: "vn-save" });
    actor.send({ type: "POP_OVERLAY" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("paused");
    expect(actor.getSnapshot().context.overlayStack).toEqual(["pause-menu"]);

    actor.send({ type: "POP_OVERLAY" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("vn");
  });

  it("derives context and capabilities without mutating machine context", () => {
    const actor = createActor(gameFlowMachine).start();
    actor.send({ type: "BOOT" });
    actor.send({ type: "START_NEW_GAME", mode: "navi" });
    const flow = createGameFlowSnapshot(actor.getSnapshot().value, actor.getSnapshot().context);
    const interaction = deriveGameInteractionState({
      flow,
      host: { naviSubstate: "vn2d-overlay" },
      vn: {
        hasActiveStory: true,
        storyHasChoices: false,
        storyEnded: false,
        isAtStableStop: true,
        inputLock: "dialog"
      }
    });

    expect(interaction.context).toMatchObject({ mode: "navi", naviSubstate: "vn2d-overlay", inputLock: "dialog" });
    expect(interaction.capabilities).toMatchObject({ canSave: true, canOpenBacklog: true, canAuto: true, canSkip: true });
    expect(actor.getSnapshot().context).toEqual({ overlayStack: [], resumeMode: null });
  });
});
