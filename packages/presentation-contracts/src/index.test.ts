import { describe, expect, it } from "vitest";
import { createMemoryPresenter } from "./index";

describe("presentation contracts", () => {
  it("records presentation commands without renderer state", () => {
    const presenter = createMemoryPresenter();

    presenter.apply({ type: "set-background", backgroundId: "bg:court" });
    presenter.apply({
      type: "char-enter",
      characterId: "character:felix",
      portraitId: "portrait:felix:neutral",
      slot: "center",
      effect: "fadeIn"
    });
    presenter.apply({ type: "shake", target: "character:felix", intensity: 0.3, durationMs: 240 });

    expect(presenter.snapshot()).toMatchInlineSnapshot(`
      {
        "activeEffects": [
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
});
