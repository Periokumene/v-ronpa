import { describe, expect, it } from "vitest";
import { createPresenterTraceRecorder } from "./presenterTrace";

describe("presenter trace recorder", () => {
  it("records applied commands, persistent visuals, and active performs", () => {
    const recorder = createPresenterTraceRecorder();

    recorder.apply({ type: "set-background", backgroundId: "bg:court" });
    recorder.apply({
      type: "char-enter",
      characterId: "character:felix",
      portraitId: "portrait:felix:neutral",
      slot: "center",
      effect: "fadeIn"
    });
    recorder.apply({ type: "shake", target: "character:felix", intensity: 0.3, durationMs: 240 });

    expect(recorder.getTrace()).toMatchInlineSnapshot(`
      {
        "activePerforms": [
          {
            "blocksUserNext": false,
            "command": {
              "durationMs": 240,
              "intensity": 0.3,
              "target": "character:felix",
              "type": "shake",
            },
            "durationMs": 240,
            "id": "shake:3",
          },
        ],
        "backgroundId": "bg:court",
        "commands": [
          {
            "backgroundId": "bg:court",
            "type": "set-background",
          },
          {
            "characterId": "character:felix",
            "effect": "fadeIn",
            "portraitId": "portrait:felix:neutral",
            "slot": "center",
            "type": "char-enter",
          },
          {
            "durationMs": 240,
            "intensity": 0.3,
            "target": "character:felix",
            "type": "shake",
          },
        ],
        "portraits": [
          {
            "characterId": "character:felix",
            "portraitId": "portrait:felix:neutral",
            "slot": "center",
          },
        ],
      }
    `);
  });

  it("clears recorded trace data", () => {
    const recorder = createPresenterTraceRecorder();

    recorder.apply({ type: "set-background", backgroundId: "bg:court" });
    recorder.apply({ type: "flash", color: "#ffffff", durationMs: 160 });
    recorder.clear();

    expect(recorder.getTrace()).toEqual({
      portraits: [],
      commands: [],
      activePerforms: []
    });
  });
});
