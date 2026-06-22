import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import { createPresenterTraceRecorder } from "./presenterTrace";

describe("presenter trace recorder", () => {
  it("records applied commands, persistent visuals, and active performs", () => {
    const recorder = createPresenterTraceRecorder();

    recorder.apply(runtimeCommand("back", "scene", { appearance: "bg:court" }));
    recorder.apply(
      runtimeCommand("charenter", "actor", {
        characterId: "character:felix",
        portraitId: "portrait:felix:neutral",
        slot: "center",
        effect: "fadeIn"
      })
    );
    recorder.apply(runtimeCommand("shake", "effect", { target: "character:felix", intensity: 0.3, duration: 240 }));

    const trace = recorder.getTrace();
    expect(trace.backgroundId).toBe("bg:court");
    expect(trace.commands.map((command) => command.commandId)).toEqual(["back", "charenter", "shake"]);
    expect(trace.portraits).toEqual([
      {
        characterId: "character:felix",
        portraitId: "portrait:felix:neutral",
        slot: "center"
      }
    ]);
    expect(trace.activePerforms).toMatchObject([
      {
        blocksUserNext: false,
        durationMs: 240,
        id: "shake:3",
        command: { commandId: "shake", params: { target: "character:felix", intensity: 0.3, duration: 240 } }
      }
    ]);
  });

  it("clears recorded trace data", () => {
    const recorder = createPresenterTraceRecorder();

    recorder.apply(runtimeCommand("back", "scene", { appearance: "bg:court" }));
    recorder.apply(runtimeCommand("flash", "effect", { color: "#ffffff", duration: 160 }));
    recorder.clear();

    expect(recorder.getTrace()).toEqual({
      portraits: [],
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
