import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { calculateInteractionCapabilities, gameFlowMachine, modeFromSnapshotValue } from "./index";

describe("game flow machine", () => {
  it("moves through top-level game modes", () => {
    const actor = createActor(gameFlowMachine).start();
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("loading");

    actor.send({ type: "BOOT" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("title");

    actor.send({ type: "START_NEW_GAME" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("navi");

    actor.send({ type: "ENTER_TRIAL" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("trial");

    actor.send({ type: "ENTER_NAVI" });
    actor.send({ type: "PAUSE" });
    actor.send({ type: "RESUME" });

    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("navi");
  });

  it("keeps overlay stack and capabilities in machine context", () => {
    const actor = createActor(gameFlowMachine).start();
    actor.send({ type: "BOOT" });
    expect(actor.getSnapshot().context.capabilities).toMatchObject({
      canStartNewGame: true,
      canLoad: true,
      canSave: false
    });

    actor.send({ type: "OPEN_OVERLAY", overlay: "title-load" });
    expect(actor.getSnapshot().context.interaction.overlayStack).toEqual(["title-load"]);

    actor.send({ type: "POP_OVERLAY" });
    expect(actor.getSnapshot().context.interaction.overlayStack).toEqual([]);

    actor.send({ type: "START_NEW_GAME" });
    actor.send({
      type: "UPDATE_CONTEXT",
      context: {
        naviSubstate: "vn2d-overlay",
        inputLock: "dialog",
        hasActiveStory: true,
        isAtStableStop: true
      }
    });
    expect(actor.getSnapshot().context.capabilities).toMatchObject({
      canSave: true,
      canOpenBacklog: true,
      canAuto: true,
      canSkip: true
    });
  });

  it("calculates capabilities from small interaction context snapshots", () => {
    expect(
      calculateInteractionCapabilities({
        mode: "title",
        overlayStack: [],
        inputLock: "none",
        hasActiveStory: false,
        storyHasChoices: false,
        storyEnded: false,
        isAtStableStop: false
      })
    ).toMatchObject({
      canStartNewGame: true,
      canLoad: true,
      canSave: false,
      canOpenBacklog: false
    });

    expect(
      calculateInteractionCapabilities({
        mode: "trial",
        overlayStack: [],
        trialPresentation: "vn2d",
        inputLock: "dialog",
        hasActiveStory: true,
        storyHasChoices: true,
        storyEnded: false,
        isAtStableStop: true
      })
    ).toMatchObject({
      canSave: true,
      canOpenBacklog: true,
      canReturnTitle: true
    });

    expect(
      calculateInteractionCapabilities({
        mode: "navi",
        overlayStack: [],
        naviSubstate: "walk",
        inputLock: "none",
        hasActiveStory: false,
        storyHasChoices: false,
        storyEnded: true,
        isAtStableStop: true
      })
    ).toMatchObject({
      canSave: true,
      canOpenBacklog: false
    });
  });
});
