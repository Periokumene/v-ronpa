import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, RuntimeCommand, RuntimeValue, StoryRuntimeSnapshot } from "@v-ronpa/contracts";
import {
  clearMovieOverlay,
  createInitialUiRuntimeState,
  deriveUiRuntimeLifecycleState,
  dismissToast,
  reduceUiRuntimeCommand,
  reduceUiRuntimeCommands,
  startMovieOverlay
} from "./uiRuntime";

describe("UI runtime", () => {
  it("lets showUI and hideUI control only v1 runtime UI surfaces through the same visibility state", () => {
    const result = reduceUiRuntimeCommands(createInitialUiRuntimeState(), [
      runtimeCommand("hideui", "ui", { target: "dialog" }),
      runtimeCommand("showui", "ui", { target: "commandBar", visible: true }),
      runtimeCommand("hideui", "ui", { target: "toastLayer" })
    ]);

    expect(result.state.visible).toEqual({ dialog: false, commandBar: true, toastLayer: false });
    expect(result.diagnostics).toEqual([]);
  });

  it("uses no-target showUI and hideUI as scoped all-runtime-UI controls", () => {
    const hidden = reduceUiRuntimeCommand(createInitialUiRuntimeState(), runtimeCommand("hideui", "ui", {}));
    expect(hidden.state.visible).toEqual({ dialog: false, commandBar: false, toastLayer: false });
    expect(hidden.diagnostics).toEqual([]);

    const shown = reduceUiRuntimeCommand(hidden.state, runtimeCommand("showui", "ui", {}));
    expect(shown.state.visible).toEqual({ dialog: true, commandBar: true, toastLayer: true });
    expect(shown.diagnostics).toEqual([]);
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

    expect(result.state.visible.dialog).toBe(false);
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

function runtimeCommand(commandId: string, category: NaniCommandCategory, params: Record<string, RuntimeValue>): RuntimeCommand {
  return {
    commandId,
    canonicalName: commandId,
    category,
    source: "v-ronpa",
    status: "implemented",
    params,
    loc: { scriptPath: "ui-runtime-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
