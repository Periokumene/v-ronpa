import { describe, expect, it } from "vitest";
import { createInitialUiRuntimeState } from "@v-ronpa/app-vn-dispatch";
import { createInitialStoryState } from "@v-ronpa/story-engine";
import { createInitialPixiStageSnapshot } from "@v-ronpa/pixi-stage-model";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { parseScenario } from "@v-ronpa/nani-parser";
import { createVnRuntimeDebugSnapshot } from "./runtimeDebugSnapshot";

describe("VnRuntimeDebugSnapshot", () => {
  it("deeply detaches and freezes every debug observation", () => {
    const parsed = parseScenario({ scriptPath: "debug-snapshot.nani", sourceText: "Narrator: Immutable." });
    const script = compileRuntimeScript(parsed.scenario).script;
    const story = createInitialStoryState(script);
    const input = {
      storyRuntime: { active: true, state: story },
      pixiStageRuntime: {
        snapshot: createInitialPixiStageSnapshot(),
        hints: [],
        hintSequence: 0,
        animate: false,
        presentationTasks: []
      },
      uiRuntime: { state: createInitialUiRuntimeState() },
      runtimeDiagnostics: []
    };
    const snapshot = createVnRuntimeDebugSnapshot(input);
    const variables = snapshot.storyRuntime.state.variables;

    expect(snapshot.storyRuntime).not.toBe(input.storyRuntime);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.storyRuntime.state)).toBe(true);
    expect(Object.isFrozen(variables)).toBe(true);
    expect(() => {
      (variables as Record<string, unknown>).route = "mutated";
    }).toThrow(TypeError);
    expect(story.variables).toEqual({});
  });
});
