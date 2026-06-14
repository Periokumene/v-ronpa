import { describe, expect, it } from "vitest";
import { parseScenario } from "@v-ronpa/nani-parser";
import { createInitialStoryState, storyReducer, storyRuntimeSnapshot } from "./index";

const script = `#Start
@back bg:court effect:fade
@charEnter character:felix portrait:portrait:felix:neutral slot:center
Felix: The door was locked.[>]
@trialKeyword kw:locked text:"locked" speaker:character:felix
@choice "Object with the keycard" goto:#Object
@choice "Stay silent" goto:#End
#Object
@set route:objected
@shake character:felix intensity:0.5 duration:300
@goto #End
#End
@end`;

describe("story engine", () => {
  it("reduces script statements into serializable runtime state", () => {
    const { scenario } = parseScenario({ sourceText: script, scriptPath: "trial.nani" });
    let state = createInitialStoryState(scenario);

    for (let i = 0; i < 6; i += 1) {
      state = storyReducer(state, { type: "STEP", scenario });
    }

    expect(storyRuntimeSnapshot(state)).toMatchInlineSnapshot(`
      {
        "backlog": [
          {
            "speaker": "Felix",
            "text": "The door was locked.",
          },
        ],
        "currentScriptPath": "trial.nani",
        "ended": false,
        "instructionPointer": 6,
        "pendingChoices": [
          {
            "goto": "#Object",
            "text": "Object with the keycard",
          },
        ],
        "variables": {},
      }
    `);

    expect(state.presentationCommands).toHaveLength(4);
    expect(state.effects).toHaveLength(4);
    expect(state.effects.at(-1)).toMatchObject({
      type: "presentation",
      command: { type: "trial-keyword", keywordId: "kw:locked" }
    });

    state = storyReducer(state, { type: "CHOOSE", scenario, index: 0 });
    state = storyReducer(state, { type: "STEP", scenario });
    state = storyReducer(state, { type: "STEP", scenario });

    expect(state.variables.route).toBe("objected");
    expect(state.presentationCommands.at(-1)).toMatchObject({ type: "shake" });
    expect(state.effects.at(-1)).toMatchObject({ type: "presentation", command: { type: "shake" } });
  });

  it("emits typed gameplay events without handling evidence submission", () => {
    const { scenario } = parseScenario({
      sourceText: "@gameplay grant-evidence id:evidence:keycard",
      scriptPath: "grant-evidence.nani"
    });
    const state = storyReducer(createInitialStoryState(scenario), { type: "STEP", scenario });

    expect(state.effects).toEqual([
      {
        type: "gameplay-event",
        event: { type: "grant-evidence", evidenceId: "evidence:keycard" }
      }
    ]);
  });
});
