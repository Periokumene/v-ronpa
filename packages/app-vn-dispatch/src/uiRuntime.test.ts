import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, RuntimeCommand, RuntimeValue, StoryRuntimeSnapshot } from "@v-ronpa/contracts";
import {
  advanceUiRuntimeTransitions,
  clearMovieOverlay,
  createUiRuntimeStateFromCheckpoint,
  createInitialUiRuntimeState,
  createVnUiCheckpoint,
  deriveUiRuntimeLifecycleState,
  dismissToast,
  hasActiveUiRuntimeTransitions,
  isUiPresentationWaitComplete,
  reduceUiRuntimeCommand,
  reduceUiRuntimeCommands,
  settleUiRuntimePresentationWait,
  settleUiRuntimeTransitions,
  startMovieOverlay
} from "./uiRuntime";

describe("UI runtime", () => {
  it("lets showUI and hideUI control runtime UI surface presentation state", () => {
    const result = reduceUiRuntimeCommands(createInitialUiRuntimeState(), [
      runtimeCommand("hideui", "ui", { target: "dialog" }),
      runtimeCommand("showui", "ui", { target: "commandBar", visible: true }),
      runtimeCommand("hideui", "ui", { target: "toastLayer" })
    ]);

    expect(result.state.surfaces.dialog).toMatchObject({ targetVisible: false, mounted: false, opacity: 0, phase: "hidden" });
    expect(result.state.surfaces.commandBar).toMatchObject({ targetVisible: true, mounted: true, opacity: 1, phase: "shown" });
    expect(result.state.surfaces.toastLayer).toMatchObject({ targetVisible: false, mounted: false, opacity: 0, phase: "hidden" });
    expect(result.diagnostics).toEqual([]);
  });

  it("uses no-target showUI and hideUI as scoped all-runtime-UI controls", () => {
    const hidden = reduceUiRuntimeCommand(createInitialUiRuntimeState(), runtimeCommand("hideui", "ui", {}));
    expect((["dialog", "commandBar", "toastLayer"] as const).every((surface) => hidden.state.surfaces[surface].phase === "hidden")).toBe(true);
    expect(hidden.state.surfaces.cue.phase).toBe("hidden");
    expect(hidden.state.surfaces.pinp.phase).toBe("hidden");
    expect(hidden.diagnostics).toEqual([]);

    const shown = reduceUiRuntimeCommand(hidden.state, runtimeCommand("showui", "ui", {}));
    expect((["dialog", "commandBar", "toastLayer"] as const).every((surface) => shown.state.surfaces[surface].phase === "shown")).toBe(true);
    expect(shown.state.surfaces.cue.phase).toBe("hidden");
    expect(shown.diagnostics).toEqual([]);
  });

  it("shows, replays, checkpoints, hides, and clears pinp content", () => {
    const command = runtimeCommand("pinp", "ui", {
      assetId: "props:milk-bag",
      positionPercent: [50, 50],
      heightPercent: 20,
      aspectRatio: [16, 9],
      alt: "牛奶袋",
      effect: "fade",
      durationMs: 180,
      visible: true
    });
    const showing = reduceUiRuntimeCommand(createInitialUiRuntimeState(), command, { nowMs: 1000 }).state;
    expect(showing.pinpSequence).toBe(1);
    expect(showing.pinp).toMatchObject({ assetId: "props:milk-bag", alt: "牛奶袋" });
    expect(showing.surfaces.pinp).toMatchObject({ phase: "showing", opacity: 0, targetVisible: true });
    expect(createVnUiCheckpoint(showing).pinp).toMatchObject({ assetId: "props:milk-bag" });

    const midway = advanceUiRuntimeTransitions(showing, 1090);
    expect(midway.surfaces.pinp.opacity).toBeCloseTo(0.5);
    const replayed = reduceUiRuntimeCommand(midway, command, { nowMs: 1090 }).state;
    expect(replayed.pinpSequence).toBe(2);
    expect(replayed.surfaces.pinp).toMatchObject({ phase: "showing", opacity: 0 });

    const hiding = reduceUiRuntimeCommand(replayed, runtimeCommand("pinp", "ui", {
      visible: false,
      effect: "fade",
      durationMs: 180
    }), { nowMs: 1180 }).state;
    expect(hiding.surfaces.pinp).toMatchObject({ phase: "hiding", opacity: 0.5, targetVisible: false });
    expect(createVnUiCheckpoint(hiding).pinp).toBeNull();
    const hidden = advanceUiRuntimeTransitions(hiding, 1360);
    expect(hidden.surfaces.pinp.phase).toBe("hidden");
    expect(hidden.pinp).toBeUndefined();
  });

  it("restores pinp to a terminal surface and rejects invalid runtime commands without changing state", () => {
    const restored = createUiRuntimeStateFromCheckpoint({
      dialog: true,
      commandBar: true,
      toastLayer: true,
      cue: false,
      pinp: {
        assetId: "props:milk-bag",
        alt: "",
        positionPercent: [40, 45],
        heightPercent: 25,
        aspectRatio: [4, 3]
      }
    });
    expect(restored.surfaces.pinp).toMatchObject({ phase: "shown", opacity: 1, mounted: true });
    const invalid = reduceUiRuntimeCommand(restored, runtimeCommand("pinp", "ui", {
      assetId: "props:bad",
      positionPercent: [50, 101],
      heightPercent: 20,
      aspectRatio: [16, 9],
      alt: "",
      effect: "fade",
      durationMs: 180,
      visible: true
    }));
    expect(invalid.state).toBe(restored);
    expect(invalid.diagnostics).toMatchObject([{ code: "invalid-pinp-command", severity: "error" }]);

    const empty = createInitialUiRuntimeState();
    expect(reduceUiRuntimeCommand(empty, runtimeCommand("pinp", "ui", {
      visible: false,
      effect: "none",
      durationMs: 0
    })).state).toBe(empty);
  });

  it("does not churn state for no-op terminal visibility commands", () => {
    const initial = createInitialUiRuntimeState();
    const result = reduceUiRuntimeCommand(initial, runtimeCommand("showui", "ui", { target: "dialog" }));

    expect(result.state).toBe(initial);
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps timed hide mounted until transition completion", () => {
    const hiding = reduceUiRuntimeCommand(
      createInitialUiRuntimeState(),
      runtimeCommand("hideui", "ui", { target: "dialog", durationMs: 200 }),
      { nowMs: 1000 }
    ).state;

    expect(hiding.surfaces.dialog).toMatchObject({
      targetVisible: false,
      mounted: true,
      opacity: 1,
      phase: "hiding",
      transition: { startedAtMs: 1000, durationMs: 200, fromOpacity: 1, toOpacity: 0, targetVisible: false }
    });

    const midway = advanceUiRuntimeTransitions(hiding, 1100);
    expect(midway.surfaces.dialog).toMatchObject({ mounted: true, opacity: 0.5, phase: "hiding" });
    expect(hasActiveUiRuntimeTransitions(midway)).toBe(true);

    const complete = advanceUiRuntimeTransitions(midway, 1200);
    expect(complete.surfaces.dialog).toMatchObject({ targetVisible: false, mounted: false, opacity: 0, phase: "hidden" });
    expect(hasActiveUiRuntimeTransitions(complete)).toBe(false);
  });

  it("shows cue immediately and keeps it mounted through hideCue fade", () => {
    const shown = reduceUiRuntimeCommand(
      createInitialUiRuntimeState(),
      runtimeCommand("cue", "text", { text: "Cue" }),
      { nowMs: 1000 }
    ).state;
    expect(shown.surfaces.cue).toMatchObject({ targetVisible: true, mounted: true, opacity: 1, phase: "shown" });
    expect(shown.surfaces.dialog.phase).toBe("shown");

    const hiding = reduceUiRuntimeCommand(
      shown,
      runtimeCommand("hidecue", "ui", { durationMs: 400, wait: true }),
      { nowMs: 1000 }
    ).state;
    expect(hiding.surfaces.cue).toMatchObject({
      targetVisible: false,
      mounted: true,
      opacity: 1,
      phase: "hiding",
      transition: { durationMs: 400, fromOpacity: 1, toOpacity: 0 }
    });
    expect(advanceUiRuntimeTransitions(hiding, 1200).surfaces.cue.opacity).toBe(0.5);
    expect(advanceUiRuntimeTransitions(hiding, 1400).surfaces.cue).toMatchObject({
      targetVisible: false,
      mounted: false,
      opacity: 0,
      phase: "hidden"
    });
  });

  it("settles zero-time and already-hidden hideCue commands without a transition", () => {
    const hidden = createInitialUiRuntimeState();
    const alreadyHidden = reduceUiRuntimeCommand(
      hidden,
      runtimeCommand("hidecue", "ui", { durationMs: 400, wait: true }),
      { nowMs: 1000 }
    ).state;
    expect(alreadyHidden.surfaces.cue).toMatchObject({ phase: "hidden", mounted: false, opacity: 0 });
    expect(alreadyHidden.surfaces.cue.transition).toBeUndefined();

    const shown = reduceUiRuntimeCommand(hidden, runtimeCommand("cue", "text", { text: "Cue" }), { nowMs: 1000 }).state;
    const zeroTime = reduceUiRuntimeCommand(
      shown,
      runtimeCommand("hidecue", "ui", { durationMs: 0, wait: true }),
      { nowMs: 1000 }
    ).state;
    expect(zeroTime.surfaces.cue).toMatchObject({ phase: "hidden", mounted: false, opacity: 0 });
    expect(zeroTime.surfaces.cue.transition).toBeUndefined();
  });

  it("keeps hideUI isolated from cue and settles cue only through its own wait", () => {
    const shown = reduceUiRuntimeCommand(createInitialUiRuntimeState(), runtimeCommand("cue", "text", { text: "Cue" })).state;
    const hiddenUi = reduceUiRuntimeCommand(shown, runtimeCommand("hideui", "ui", {})).state;
    expect(hiddenUi.surfaces.cue.phase).toBe("shown");

    const hidingCue = reduceUiRuntimeCommand(
      hiddenUi,
      runtimeCommand("hidecue", "ui", { durationMs: 400, wait: true }),
      { nowMs: 1000 }
    ).state;
    const settled = settleUiRuntimePresentationWait(hidingCue, {
      channel: "ui",
      commandId: "hidecue",
      commandIndex: 1,
      durationMs: 400,
      targets: ["cue"],
      targetVisible: false
    });
    expect(settled.surfaces.cue.phase).toBe("hidden");
    expect(settled.surfaces.dialog.phase).toBe("hidden");
  });

  it("converges cue hidden when story current switches to dialog or resets", () => {
    const shown = reduceUiRuntimeCommand(createInitialUiRuntimeState(), runtimeCommand("cue", "text", { text: "Cue" })).state;
    const cueStory = storySnapshot({
      text: { printerId: "default", visible: true, current: { channel: "cue", text: "Cue" } }
    });
    expect(deriveUiRuntimeLifecycleState(shown, cueStory).surfaces.cue.phase).toBe("shown");

    const dialogStory = storySnapshot({
      text: { printerId: "default", visible: true, current: { channel: "dialog", text: "Dialog" } }
    });
    expect(deriveUiRuntimeLifecycleState(shown, dialogStory).surfaces.cue.phase).toBe("hidden");
    expect(deriveUiRuntimeLifecycleState(shown, storySnapshot()).surfaces.cue.phase).toBe("hidden");
  });

  it("reverses timed transitions from current opacity", () => {
    const hiding = reduceUiRuntimeCommand(
      createInitialUiRuntimeState(),
      runtimeCommand("hideui", "ui", { target: "dialog", durationMs: 200 }),
      { nowMs: 1000 }
    ).state;
    const midway = advanceUiRuntimeTransitions(hiding, 1100);
    const showing = reduceUiRuntimeCommand(
      midway,
      runtimeCommand("showui", "ui", { target: "dialog", durationMs: 200 }),
      { nowMs: 1100 }
    ).state;

    expect(showing.surfaces.dialog).toMatchObject({
      targetVisible: true,
      mounted: true,
      opacity: 0.5,
      phase: "showing",
      transition: { startedAtMs: 1100, durationMs: 200, fromOpacity: 0.5, toOpacity: 1, targetVisible: true }
    });
  });

  it("settles UI presentation waits across all targets", () => {
    const hiding = reduceUiRuntimeCommand(
      createInitialUiRuntimeState(),
      runtimeCommand("hideui", "ui", { durationMs: 200 }),
      { nowMs: 1000 }
    ).state;

    expect(
      isUiPresentationWaitComplete(hiding, {
        channel: "ui",
        commandId: "hideui",
        commandIndex: 0,
        durationMs: 200,
        targets: ["dialog", "commandBar", "toastLayer"],
        targetVisible: false
      })
    ).toBe(false);

    const settled = settleUiRuntimeTransitions(hiding);
    expect(Object.values(settled.surfaces).every((surface) => surface.phase === "hidden")).toBe(true);
    expect(
      isUiPresentationWaitComplete(settled, {
        channel: "ui",
        commandId: "hideui",
        commandIndex: 0,
        durationMs: 200,
        targets: ["dialog", "commandBar", "toastLayer"],
        targetVisible: false
      })
    ).toBe(true);
  });

  it("settles UI presentation waits to the requested terminal state even without an active transition", () => {
    const drifting = {
      ...createInitialUiRuntimeState(),
      surfaces: {
        ...createInitialUiRuntimeState().surfaces,
        dialog: { targetVisible: false, mounted: true, opacity: 0.35, phase: "hiding" as const }
      }
    };

    const settled = settleUiRuntimePresentationWait(drifting, {
      channel: "ui",
      commandId: "hideui",
      commandIndex: 0,
      durationMs: 200,
      targets: ["dialog"],
      targetVisible: false
    });

    expect(settled.surfaces.dialog).toMatchObject({ targetVisible: false, mounted: false, opacity: 0, phase: "hidden" });
    expect(isUiPresentationWaitComplete(settled, {
      channel: "ui",
      commandId: "hideui",
      commandIndex: 0,
      durationMs: 200,
      targets: ["dialog"],
      targetVisible: false
    })).toBe(true);
  });

  it("rejects debug, lifecycle-owned, or trial UI targets for showUI and hideUI", () => {
    const initial = createInitialUiRuntimeState();
    for (const commandId of ["showui", "hideui"]) {
      for (const target of ["hud", "inputPrompt", "movieOverlay", "trialOverlay"]) {
        const result = reduceUiRuntimeCommand(initial, runtimeCommand(commandId, "ui", { target, visible: false }));
        expect(result.state).toBe(initial);
        expect(result.diagnostics).toEqual([
          {
            code: "unsupported-ui-target",
            commandId,
            severity: "warning",
            message: `@${commandId} target ${target} is not a v1 runtime UI surface.`
          }
        ]);
      }
    }
  });

  it("does not let hideUI grow a second visible override contract", () => {
    const initial = createInitialUiRuntimeState();
    const result = reduceUiRuntimeCommand(initial, runtimeCommand("hideui", "ui", { target: "dialog", visible: true }));

    expect(result.state.surfaces.dialog).toMatchObject({ targetVisible: false, mounted: false, opacity: 0, phase: "hidden" });
    expect(result.diagnostics).toEqual([]);
  });

  it("queues and dismisses toast state without shell overlay entries", () => {
    const result = reduceUiRuntimeCommand(
      createInitialUiRuntimeState(),
      runtimeCommand("toast", "ui", { text: "Ready", durationMs: 1200 })
    );

    expect(result.state.toasts).toEqual([{ id: "toast:1", text: "Ready", durationMs: 1200 }]);
    expect(dismissToast(result.state, "toast:1").toasts).toEqual([]);
  });

  it("derives toast identity only from input state", () => {
    const first = reduceUiRuntimeCommand(
      createInitialUiRuntimeState(),
      runtimeCommand("toast", "ui", { text: "Ready" })
    );
    const replay = reduceUiRuntimeCommand(
      createInitialUiRuntimeState(),
      runtimeCommand("toast", "ui", { text: "Ready" })
    );

    expect(first.state).toEqual(replay.state);
    expect(first.state.toasts[0]?.id).toBe("toast:1");
    const afterDismiss = reduceUiRuntimeCommand(
      dismissToast(first.state, "toast:1"),
      runtimeCommand("toast", "ui", { text: "Again" })
    );
    expect(afterDismiss.state.toasts[0]?.id).toBe("toast:2");
  });

  it("copies toast rich text snapshots from runtime commands", () => {
    const result = reduceUiRuntimeCommand(
      createInitialUiRuntimeState(),
      runtimeCommand("toast", "ui", { text: "Saved" }, { richText: { text: "Saved", runs: [{ start: 0, end: 5, style: { bold: true } }] } })
    );

    expect(result.state.toasts[0]).toMatchObject({
      id: expect.stringMatching(/^toast:/u),
      text: "Saved",
      richText: { text: "Saved", runs: [{ start: 0, end: 5, style: { bold: true } }] }
    });
  });

  it("derives input prompt from runtimeWait and clears it only when the wait clears", () => {
    const waiting = deriveUiRuntimeLifecycleState(createInitialUiRuntimeState(), storySnapshot({
      runtimeWait: {
        kind: "input",
        commandId: "input",
        commandIndex: 2,
        variableName: "codename",
        valueType: "string",
        summary: "Codename",
        defaultValue: "A"
      }
    }));

    expect(waiting.inputPrompt).toEqual({
      variableName: "codename",
      valueType: "string",
      summary: "Codename",
      defaultValue: "A"
    });
    expect(deriveUiRuntimeLifecycleState(waiting, storySnapshot()).inputPrompt).toBeUndefined();
  });

  it("keeps movie overlay lifecycle outside showUI", () => {
    const playing = startMovieOverlay(createInitialUiRuntimeState(), {
      assetId: "video/validation-intro",
      blocking: true
    });

    expect(playing.movieOverlay).toEqual({ assetId: "video/validation-intro", blocking: true });
    expect(clearMovieOverlay(playing).movieOverlay).toBeUndefined();
  });
});

function storySnapshot(overrides: Partial<StoryRuntimeSnapshot> = {}): StoryRuntimeSnapshot {
  return {
    currentScriptPath: "ui-runtime-test.nani",
    instructionPointer: 0,
    variables: {},
    backlog: [],
    pendingChoices: [],
    ended: false,
    ...overrides
  };
}

function runtimeCommand(
  commandId: string,
  category: NaniCommandCategory,
  params: Record<string, RuntimeValue>,
  options: { richText?: RuntimeCommand["richText"] } = {}
): RuntimeCommand {
  return {
    commandId,
    canonicalName: commandId,
    category,
    source: "v-ronpa",
    status: "implemented",
    params,
    ...(options.richText ? { richText: options.richText } : {}),
    loc: { scriptPath: "ui-runtime-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
