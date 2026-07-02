import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, RuntimeCommand, RuntimeValue, StoryRuntimeSnapshot } from "@v-ronpa/contracts";
import {
  advanceUiRuntimeTransitions,
  clearMovieOverlay,
  createInitialUiRuntimeState,
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
    expect(Object.values(hidden.state.surfaces).every((surface) => surface.phase === "hidden")).toBe(true);
    expect(hidden.diagnostics).toEqual([]);

    const shown = reduceUiRuntimeCommand(hidden.state, runtimeCommand("showui", "ui", {}));
    expect(Object.values(shown.state.surfaces).every((surface) => surface.phase === "shown")).toBe(true);
    expect(shown.diagnostics).toEqual([]);
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
      sourceRef: "video:validation-intro",
      blocking: true
    });

    expect(playing.movieOverlay).toEqual({ sourceRef: "video:validation-intro", blocking: true });
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
