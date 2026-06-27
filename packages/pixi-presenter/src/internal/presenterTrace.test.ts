import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import { createPresenterTraceRecorder } from "./presenterTrace";

describe("presenter trace recorder", () => {
  it("records applied commands, persistent visuals, and active performs", () => {
    const recorder = createPresenterTraceRecorder();

    recorder.apply(runtimeCommand("back", "scene", { appearance: "bg:court" }));
    recorder.apply(
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1,ArmR3",
        pos: [0.5, 0]
      })
    );
    recorder.apply(runtimeCommand("shake", "effect", { target: "Ema", power: 0.3, durationMs: 240 }));

    const trace = recorder.getTrace();
    expect(trace.backgroundId).toBe("bg:court");
    expect(trace.commands.map((command) => command.commandId)).toEqual(["back", "char", "shake"]);
    expect(trace.characters).toEqual([
      {
        characterId: "Ema",
        appearanceExpression: "Pensive1,ArmR3"
      }
    ]);
    expect(trace.activePerforms).toMatchObject([
      {
        blocksUserNext: false,
        durationMs: 240,
        id: "shake:3",
        command: { commandId: "shake", params: { target: "Ema", power: 0.3, durationMs: 240 } }
      }
    ]);
  });

  it("clears recorded trace data", () => {
    const recorder = createPresenterTraceRecorder();

    recorder.apply(runtimeCommand("back", "scene", { appearance: "bg:court" }));
    recorder.apply(runtimeCommand("flash", "effect", { color: "#ffffff", duration: 160 }));
    recorder.clear();

    expect(recorder.getTrace()).toEqual({
      characters: [],
      commands: [],
      activePerforms: []
    });
  });
});

function runtimeCommand(commandId: string, category: NaniCommandCategory, params: Record<string, RuntimeValue>): RuntimeCommand {
  return {
    commandId,
    canonicalName: commandId,
    category,
    source: "v-ronpa",
    status: "implemented",
    params,
    loc: { scriptPath: "presenter-trace-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
