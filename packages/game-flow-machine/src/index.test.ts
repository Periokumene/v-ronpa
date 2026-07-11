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

    actor.send({ type: "OPEN_PAUSE", section: "backlog" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("paused");
    expect(actor.getSnapshot().context).toMatchObject({ activeOverlay: null, pauseSection: "backlog", resumeMode: mode });
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
    expect(actor.getSnapshot().context).toEqual({ activeOverlay: null, pauseSection: null, resumeMode: null });
  });

  it("ignores repeated pause while already paused", () => {
    const actor = createActor(gameFlowMachine).start();
    actor.send({ type: "BOOT" });
    actor.send({ type: "START_NEW_GAME", mode: "vn" });
    actor.send({ type: "OPEN_PAUSE", section: "backlog" });
    actor.send({ type: "OPEN_PAUSE", section: "save" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("paused");
    expect(actor.getSnapshot().context).toEqual({ activeOverlay: null, pauseSection: "save", resumeMode: "vn" });
  });

  it("switches pause sections without history and resumes in one action", () => {
    const actor = createActor(gameFlowMachine).start();
    actor.send({ type: "BOOT" });
    actor.send({ type: "START_NEW_GAME", mode: "vn" });
    actor.send({ type: "OPEN_PAUSE", section: "backlog" });
    actor.send({ type: "OPEN_PAUSE", section: "save" });
    actor.send({ type: "OPEN_PAUSE", section: "load" });
    actor.send({ type: "OPEN_PAUSE", section: "backlog" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("paused");
    expect(actor.getSnapshot().context.pauseSection).toBe("backlog");

    actor.send({ type: "RESUME" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("vn");
    expect(actor.getSnapshot().context).toEqual({ activeOverlay: null, pauseSection: null, resumeMode: null });
  });

  it("replaces and closes title overlays without a history stack", () => {
    const actor = createActor(gameFlowMachine).start();
    actor.send({ type: "BOOT" });
    actor.send({ type: "OPEN_OVERLAY", overlay: "title-load" });
    actor.send({ type: "OPEN_OVERLAY", overlay: "title-settings" });
    expect(actor.getSnapshot().context.activeOverlay).toBe("title-settings");
    actor.send({ type: "CLOSE_OVERLAY" });
    expect(actor.getSnapshot().context.activeOverlay).toBeNull();
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
    expect(actor.getSnapshot().context).toEqual({ activeOverlay: null, pauseSection: null, resumeMode: null });
  });
});
