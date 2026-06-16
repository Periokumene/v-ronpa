import { describe, expect, it } from "vitest";
import { StoryRuntimeSnapshotSchema } from "@v-ronpa/contracts";
import { parseScenario } from "@v-ronpa/nani-parser";
import {
  advanceToNextStop,
  chooseStoryOption,
  createInitialStoryState,
  selectCurrentStoryLine,
  storyReducer,
  storyRuntimeSnapshot
} from "./index";

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

const vnStepperScript = `#Start
@back bg:harness effect:fade
@charEnter character:felix portrait:portrait:felix:neutral slot:center
Felix: This is the first playable slice. Move, inspect, then choose a route.[>]
@choice "Return to the hallway" goto:#Return
@choice "Follow the witness into class" goto:#Classroom

#Return
@set route:"return"
Felix: Good. We stay here and keep the exploration state readable.
@end

#Classroom
@set route:"classroom"
@gameplay grant-evidence id:evidence:keycard
Mira: Then the keycard matters after all.
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

  it("advances to the next text stop, then collects contiguous choices", () => {
    const { scenario } = parseScenario({ sourceText: vnStepperScript, scriptPath: "story-vn.nani" });
    let state = createInitialStoryState(scenario);

    let result = advanceToNextStop(state, scenario);
    state = result.state;

    expect(result.diagnostics).toEqual([]);
    expect(selectCurrentStoryLine(state)).toEqual({
      speaker: "Felix",
      text: "This is the first playable slice. Move, inspect, then choose a route."
    });
    expect(state.pendingChoices).toEqual([]);

    result = advanceToNextStop(state, scenario);
    state = result.state;

    expect(result.diagnostics).toEqual([]);
    expect(state.pendingChoices).toEqual([
      { text: "Return to the hallway", goto: "#Return" },
      { text: "Follow the witness into class", goto: "#Classroom" }
    ]);
  });

  it("does not fast-forward across multiple readable lines", () => {
    const { scenario } = parseScenario({
      sourceText: `Felix: First line.
Mira: Second line.
@end`,
      scriptPath: "multi-line.nani"
    });
    let state = createInitialStoryState(scenario);

    let result = advanceToNextStop(state, scenario);
    state = result.state;
    expect(selectCurrentStoryLine(state)).toEqual({ speaker: "Felix", text: "First line." });

    result = advanceToNextStop(state, scenario);
    state = result.state;
    expect(selectCurrentStoryLine(state)).toEqual({ speaker: "Mira", text: "Second line." });
    expect(state.ended).toBe(false);
  });

  it("chooses a branch without auto-advancing, then applies branch state and gameplay effects on advance", () => {
    const { scenario } = parseScenario({ sourceText: vnStepperScript, scriptPath: "story-vn.nani" });
    let state = createInitialStoryState(scenario);
    state = advanceToNextStop(state, scenario).state;
    state = advanceToNextStop(state, scenario).state;

    let result = chooseStoryOption(state, scenario, 1);
    state = result.state;

    expect(result.diagnostics).toEqual([]);
    expect(state.instructionPointer).toBe((scenario.labels.Classroom ?? -1) + 1);
    expect(state.pendingChoices).toEqual([]);
    expect(selectCurrentStoryLine(state)).toEqual({
      speaker: "Felix",
      text: "This is the first playable slice. Move, inspect, then choose a route."
    });
    expect(state.variables.route).toBeUndefined();

    result = advanceToNextStop(state, scenario);
    state = result.state;

    expect(result.diagnostics).toEqual([]);
    expect(state.variables.route).toBe("classroom");
    expect(state.effects).toContainEqual({
      type: "gameplay-event",
      event: { type: "grant-evidence", evidenceId: "evidence:keycard" }
    });
    expect(selectCurrentStoryLine(state)).toEqual({
      speaker: "Mira",
      text: "Then the keycard matters after all."
    });
  });

  it("returns diagnostics for invalid choices and pending-choice advances without throwing", () => {
    const { scenario } = parseScenario({ sourceText: vnStepperScript, scriptPath: "story-vn.nani" });
    let state = createInitialStoryState(scenario);
    state = advanceToNextStop(state, scenario).state;
    state = advanceToNextStop(state, scenario).state;

    const invalidChoice = chooseStoryOption(state, scenario, 9);
    expect(invalidChoice.state).toBe(state);
    expect(invalidChoice.diagnostics).toEqual([
      { code: "invalid-choice", message: "Choice index 9 is not available." }
    ]);

    const pendingAdvance = advanceToNextStop(state, scenario);
    expect(pendingAdvance.state).toBe(state);
    expect(pendingAdvance.diagnostics).toEqual([
      { code: "pending-choices", message: "Story is waiting for a choice; advance did not change state." }
    ]);
  });

  it("returns an ended no-op diagnostic after the story has ended", () => {
    const { scenario } = parseScenario({ sourceText: "Felix: Done.\n@end", scriptPath: "ended.nani" });
    let state = createInitialStoryState(scenario);
    state = advanceToNextStop(state, scenario).state;
    state = advanceToNextStop(state, scenario).state;

    expect(state.ended).toBe(true);

    const result = advanceToNextStop(state, scenario);
    expect(result.state).toBe(state);
    expect(result.diagnostics).toEqual([
      { code: "story-ended-noop", message: "Story is already ended; advance did not change state." }
    ]);
  });

  it("returns a max-step diagnostic for guarded advance loops", () => {
    const { scenario } = parseScenario({ sourceText: "#Start\n@goto #Start", scriptPath: "loop.nani" });
    const state = createInitialStoryState(scenario);
    const result = advanceToNextStop(state, scenario, { maxSteps: 3 });

    expect(result.state.ended).toBe(false);
    expect(result.diagnostics).toEqual([
      { code: "max-steps", message: "Advance stopped after reaching the max step limit of 3." }
    ]);
  });

  it("keeps the public story runtime snapshot serializable", () => {
    const { scenario } = parseScenario({ sourceText: vnStepperScript, scriptPath: "story-vn.nani" });
    let state = createInitialStoryState(scenario);
    state = advanceToNextStop(state, scenario).state;
    state = advanceToNextStop(state, scenario).state;

    expect(() => StoryRuntimeSnapshotSchema.parse(storyRuntimeSnapshot(state))).not.toThrow();
  });
});
