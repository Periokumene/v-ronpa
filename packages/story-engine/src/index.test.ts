import { describe, expect, it } from "vitest";
import {
  commandCatalog,
  StoryRuntimeSnapshotSchema,
  type NaniCommandCategory,
  type NaniCommandSource,
  type NaniCommandStatus,
  type RuntimeCommand,
  type RuntimeScript,
  type RuntimeValue
} from "@v-ronpa/contracts";
import {
  advanceToNextStop,
  chooseStoryOption,
  createInitialStoryState,
  selectCurrentStoryLine,
  storyReducer,
  storyRuntimeSnapshot
} from "./index";

const trialRuntimeScript = runtimeScript(
  "trial.nani",
  [
    runtimeCommand("back", "scene", { appearance: "bg:court", effect: "fade" }, { source: "naninovel" }),
    runtimeCommand("char", "actor", {
      target: "character:felix",
      appearance: "portrait:felix:neutral",
      pos: [0.5, 0]
    }, { source: "naninovel" }),
    runtimeCommand("print", "text", { text: "The door was locked.", speaker: "Felix", autoNext: true }),
    runtimeCommand("trialkeyword", "ui", {
      keywordId: "kw:locked",
      text: "locked",
      speakerId: "character:felix"
    }),
    runtimeCommand("choice", "choice", { text: "Object with the keycard", goto: "#Object" }, { source: "naninovel" }),
    runtimeCommand("choice", "choice", { text: "Stay silent", goto: "#End" }, { source: "naninovel" }),
    runtimeCommand("set", "state", { key: "route", value: "objected" }, { source: "naninovel" }),
    runtimeCommand("shake", "effect", { target: "character:felix", intensity: 0.5, duration: 300 }, { source: "naninovel" }),
    runtimeCommand("goto", "flow", { label: "#End" }, { source: "naninovel" }),
    runtimeCommand("end", "flow", {})
  ],
  { Start: 0, Object: 6, End: 9 }
);

const vnStepperRuntimeScript = runtimeScript(
  "story-vn.nani",
  [
    runtimeCommand("back", "scene", { appearance: "bg:harness", effect: "fade" }, { source: "naninovel" }),
    runtimeCommand("char", "actor", {
      target: "character:felix",
      appearance: "portrait:felix:neutral",
      pos: [0.5, 0]
    }, { source: "naninovel" }),
    runtimeCommand("print", "text", {
      text: "This is the first playable slice. Move, inspect, then choose a route.",
      speaker: "Felix",
      autoNext: true
    }),
    runtimeCommand("choice", "choice", { text: "Return to the hallway", goto: "#Return" }, { source: "naninovel" }),
    runtimeCommand("choice", "choice", { text: "Follow the witness into class", goto: "#Classroom" }, { source: "naninovel" }),
    runtimeCommand("set", "state", { key: "route", value: "return" }, { source: "naninovel" }),
    runtimeCommand("print", "text", {
      text: "Good. We stay here and keep the exploration state readable.",
      speaker: "Felix",
      autoNext: false
    }),
    runtimeCommand("end", "flow", {}),
    runtimeCommand("set", "state", { key: "route", value: "classroom" }, { source: "naninovel" }),
    runtimeCommand("gameplay", "state", { type: "grant-evidence", evidenceId: "evidence:keycard" }),
    runtimeCommand("print", "text", {
      text: "Then the keycard matters after all.",
      speaker: "Mira",
      autoNext: false
    }),
    runtimeCommand("end", "flow", {})
  ],
  { Start: 0, Return: 5, Classroom: 8 }
);

describe("story engine", () => {
  it("reduces runtime scripts into serializable runtime state and per-step emitted commands", () => {
    const runtimeScript = trialRuntimeScript;
    let state = createInitialStoryState(runtimeScript);
    const emittedCommandIds: string[] = [];

    let result = advanceToNextStop(state, runtimeScript);
    state = result.state;
    emittedCommandIds.push(...result.emittedRuntimeCommands.map((command) => command.commandId));

    result = advanceToNextStop(state, runtimeScript);
    state = result.state;
    emittedCommandIds.push(...result.emittedRuntimeCommands.map((command) => command.commandId));

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
          {
            "goto": "#End",
            "text": "Stay silent",
          },
        ],
        "variables": {},
      }
    `);
    expect(storyRuntimeSnapshot(state)).not.toHaveProperty("presentationCommands");
    expect(storyRuntimeSnapshot(state)).not.toHaveProperty("effects");
    expect(emittedCommandIds).toEqual(["back", "char", "print", "trialkeyword"]);

    state = reduceWithoutDiagnostics(state, { type: "CHOOSE", script: runtimeScript, index: 0 }).state;
    result = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript });
    state = result.state;
    expect(result.emittedRuntimeCommands).toEqual([]);

    result = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript });
    state = result.state;
    expect(state.variables.route).toBe("objected");
    expect(result.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["shake"]);
  });

  it("emits gameplay runtime commands without applying gameplay state in StoryEngine", () => {
    const runtimeScript = runtimeScriptFixture("grant-evidence.nani", [
      runtimeCommand("gameplay", "state", { type: "grant-evidence", evidenceId: "evidence:keycard" })
    ]);
    const result = storyReducer(createInitialStoryState(runtimeScript), { type: "STEP", script: runtimeScript });

    expect(result.diagnostics).toEqual([]);
    expect(result.emittedRuntimeCommands).toEqual([
      expect.objectContaining({
        commandId: "gameplay",
        params: expect.objectContaining({
          type: "grant-evidence",
          evidenceId: "evidence:keycard"
        })
      })
    ]);
  });

  it("advances to the next text stop, then collects contiguous choices", () => {
    const runtimeScript = vnStepperRuntimeScript;
    let state = createInitialStoryState(runtimeScript);

    let result = advanceToNextStop(state, runtimeScript);
    state = result.state;

    expect(result.diagnostics).toEqual([]);
    expect(selectCurrentStoryLine(state)).toEqual({
      speaker: "Felix",
      text: "This is the first playable slice. Move, inspect, then choose a route."
    });
    expect(state.pendingChoices).toEqual([]);
    expect(result.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["back", "char", "print"]);

    result = advanceToNextStop(state, runtimeScript);
    state = result.state;

    expect(result.diagnostics).toEqual([]);
    expect(state.pendingChoices).toEqual([
      { text: "Return to the hallway", goto: "#Return" },
      { text: "Follow the witness into class", goto: "#Classroom" }
    ]);
    expect(result.emittedRuntimeCommands).toEqual([]);
  });

  it("reports declared but unimplemented official commands as no-op diagnostics", () => {
    const runtimeScript = runtimeScriptFixture("stubbed-official-command.nani", [
      runtimeCommand("bgm", "media", { volume: 0.5 }, { source: "naninovel", status: "stubbed" })
    ]);
    const result = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);

    expect(result.emittedRuntimeCommands).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: "command-not-implemented",
        message: "@bgm is declared in commandCatalog but has no runtime handler; treated as no-op.",
        severity: "warning"
      }
    ]);
  });

  it("returns reducer diagnostics instead of silently dropping command status findings", () => {
    const runtimeScript = runtimeScriptFixture("reducer-diagnostics.nani", [
      runtimeCommand("bgm", "media", { volume: 0.5 }, { source: "naninovel", status: "stubbed" })
    ]);
    const result = storyReducer(createInitialStoryState(runtimeScript), { type: "STEP", script: runtimeScript });

    expect(result.emittedRuntimeCommands).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: "command-not-implemented",
        message: "@bgm is declared in commandCatalog but has no runtime handler; treated as no-op.",
        severity: "warning"
      }
    ]);
  });

  it("keeps implemented non-control commands as generic StoryEngine emissions", () => {
    const implementedRuntimeCommands = commandCatalog.filter((command) => command.status === "implemented");

    expect(implementedRuntimeCommands.map((command) => command.id)).toEqual([
      "arrange",
      "back",
      "blur",
      "bokeh",
      "char",
      "choice",
      "glitch",
      "goto",
      "hidechars",
      "print",
      "rain",
      "set",
      "shake",
      "slide",
      "snow",
      "sun",
      "end",
      "gameplay",
      "flash",
      "focus",
      "trialkeyword"
    ]);
  });

  it("stops on waitable presentation commands until the presenter reports completion", () => {
    const runtimeScript = runtimeScriptFixture("presentation-wait.nani", [
      runtimeCommand("char", "actor", {
        target: "character:felix",
        appearance: "portrait:felix:neutral",
        durationMs: 250,
        wait: true
      }, { source: "naninovel" }),
      runtimeCommand("print", "text", { speaker: "Felix", text: "After animation.", autoNext: false })
    ]);
    const first = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);

    expect(first.stopReason).toBe("presentation-wait");
    expect(first.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["char"]);
    expect(first.state).toMatchObject({
      instructionPointer: 1,
      presentationWait: {
        commandId: "char",
        durationMs: 250,
        target: "character:felix"
      },
      backlog: []
    });

    const blocked = advanceToNextStop(first.state, runtimeScript);
    expect(blocked.stopReason).toBe("presentation-wait");
    expect(blocked.state).toBe(first.state);
    expect(blocked.emittedRuntimeCommands).toEqual([]);

    const completed = reduceWithoutDiagnostics(first.state, { type: "PRESENTATION_COMPLETE", script: runtimeScript });
    expect(completed.state.presentationWait).toBeUndefined();

    const resumed = advanceToNextStop(completed.state, runtimeScript);
    expect(resumed.stopReason).toBe("text");
    expect(resumed.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["print"]);
    expect(resumed.state.backlog).toEqual([{ speaker: "Felix", text: "After animation." }]);
  });

  it("resolves expression params before emitting runtime commands", () => {
    const runtimeScript = runtimeScriptFixture("expression-params.nani", [
      runtimeCommand("set", "state", { key: "flashDuration", value: 240 }),
      runtimeCommand("flash", "effect", {
        color: "#ffffff",
        duration: { type: "expression", source: "flashDuration" }
      })
    ]);
    const result = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);

    expect(result.diagnostics).toEqual([]);
    expect(result.emittedRuntimeCommands).toEqual([
      expect.objectContaining({
        commandId: "flash",
        params: { color: "#ffffff", duration: 240 }
      })
    ]);
  });

  it("uses the expression resolver for set commands", () => {
    const runtimeScript = runtimeScriptFixture("expression-set.nani", [
      runtimeCommand("set", "state", { key: "score", value: 1 }),
      runtimeCommand("set", "state", { key: "score", value: { type: "expression", source: "score+1" } }),
      runtimeCommand("print", "text", { text: "Score changed.", autoNext: false })
    ]);
    const result = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);

    expect(result.diagnostics).toEqual([]);
    expect(result.state.variables.score).toBe(2);
    expect(result.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["print"]);
  });

  it("applies condition and unless expressions before command execution", () => {
    const runtimeScript = runtimeScriptFixture("expression-conditions.nani", [
      runtimeCommand("set", "state", { key: "affinity", value: 4 }),
      runtimeCommand(
        "flash",
        "effect",
        { color: "#ffffff", duration: 120 },
        { condition: { type: "expression", source: "affinity<3" } }
      ),
      runtimeCommand(
        "flash",
        "effect",
        { color: "#ffffff", duration: 120 },
        { unless: { type: "expression", source: "affinity>=3" } }
      ),
      runtimeCommand(
        "choice",
        "choice",
        { text: "Open the door", goto: "#Open" },
        { source: "naninovel", condition: { type: "expression", source: "affinity>=3" } }
      )
    ]);
    const result = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);

    expect(result.diagnostics).toEqual([]);
    expect(result.state.pendingChoices).toEqual([{ text: "Open the door", goto: "#Open" }]);
    expect(result.emittedRuntimeCommands).toEqual([]);
  });

  it("returns an expression diagnostic without emitting commands on unresolved variables", () => {
    const runtimeScript = runtimeScriptFixture("unresolved-expression.nani", [
      runtimeCommand("flash", "effect", {
        color: "#ffffff",
        duration: { type: "expression", source: "missingDuration" }
      })
    ]);
    const initialState = createInitialStoryState(runtimeScript);
    const result = advanceToNextStop(initialState, runtimeScript);

    expect(result.state).toBe(initialState);
    expect(result.emittedRuntimeCommands).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: "expression-unresolved",
        message: "@flash expression missingDuration could not be resolved: Parameter duration: Unknown variable missingDuration.",
        severity: "error"
      }
    ]);
  });

  it("does not fast-forward across multiple readable lines", () => {
    const runtimeScript = runtimeScriptFixture("multi-line.nani", [
      runtimeCommand("print", "text", { speaker: "Felix", text: "First line.", autoNext: false }),
      runtimeCommand("print", "text", { speaker: "Mira", text: "Second line.", autoNext: false }),
      runtimeCommand("end", "flow", {})
    ]);
    let state = createInitialStoryState(runtimeScript);

    let result = advanceToNextStop(state, runtimeScript);
    state = result.state;
    expect(selectCurrentStoryLine(state)).toEqual({ speaker: "Felix", text: "First line." });

    result = advanceToNextStop(state, runtimeScript);
    state = result.state;
    expect(selectCurrentStoryLine(state)).toEqual({ speaker: "Mira", text: "Second line." });
    expect(state.ended).toBe(false);
  });

  it("chooses a branch without auto-advancing, then applies branch state and emits gameplay on advance", () => {
    const runtimeScript = vnStepperRuntimeScript;
    let state = createInitialStoryState(runtimeScript);
    state = advanceToNextStop(state, runtimeScript).state;
    state = advanceToNextStop(state, runtimeScript).state;

    let result = chooseStoryOption(state, runtimeScript, 1);
    state = result.state;

    expect(result.diagnostics).toEqual([]);
    expect(state.instructionPointer).toBe(runtimeScript.labels.Classroom);
    expect(state.pendingChoices).toEqual([]);
    expect(selectCurrentStoryLine(state)).toEqual({
      speaker: "Felix",
      text: "This is the first playable slice. Move, inspect, then choose a route."
    });
    expect(state.variables.route).toBeUndefined();

    result = advanceToNextStop(state, runtimeScript);
    state = result.state;

    expect(result.diagnostics).toEqual([]);
    expect(state.variables.route).toBe("classroom");
    expect(result.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["gameplay", "print"]);
    expect(selectCurrentStoryLine(state)).toEqual({
      speaker: "Mira",
      text: "Then the keycard matters after all."
    });
  });

  it("returns diagnostics for invalid choices and pending-choice advances without throwing", () => {
    const runtimeScript = vnStepperRuntimeScript;
    let state = createInitialStoryState(runtimeScript);
    state = advanceToNextStop(state, runtimeScript).state;
    state = advanceToNextStop(state, runtimeScript).state;

    const invalidChoice = chooseStoryOption(state, runtimeScript, 9);
    expect(invalidChoice.state).toBe(state);
    expect(invalidChoice.diagnostics).toEqual([
      { code: "invalid-choice", message: "Choice index 9 is not available." }
    ]);

    const pendingAdvance = advanceToNextStop(state, runtimeScript);
    expect(pendingAdvance.state).toBe(state);
    expect(pendingAdvance.diagnostics).toEqual([
      { code: "pending-choices", message: "Story is waiting for a choice; advance did not change state." }
    ]);
  });

  it("returns an ended no-op diagnostic after the story has ended", () => {
    const runtimeScript = runtimeScriptFixture("ended.nani", [
      runtimeCommand("print", "text", { speaker: "Felix", text: "Done.", autoNext: false }),
      runtimeCommand("end", "flow", {})
    ]);
    let state = createInitialStoryState(runtimeScript);
    state = advanceToNextStop(state, runtimeScript).state;
    state = advanceToNextStop(state, runtimeScript).state;

    expect(state.ended).toBe(true);

    const result = advanceToNextStop(state, runtimeScript);
    expect(result.state).toBe(state);
    expect(result.diagnostics).toEqual([
      { code: "story-ended-noop", message: "Story is already ended; advance did not change state." }
    ]);
  });

  it("returns a max-step diagnostic for guarded advance loops", () => {
    const runtimeScript = runtimeScriptFixture(
      "loop.nani",
      [runtimeCommand("goto", "flow", { label: "#Start" }, { source: "naninovel" })],
      { Start: 0 }
    );
    const state = createInitialStoryState(runtimeScript);
    const result = advanceToNextStop(state, runtimeScript, { maxSteps: 3 });

    expect(result.state.ended).toBe(false);
    expect(result.diagnostics).toEqual([
      { code: "max-steps", message: "Advance stopped after reaching the max step limit of 3." }
    ]);
  });

  it("keeps the public story runtime snapshot serializable", () => {
    const runtimeScript = vnStepperRuntimeScript;
    let state = createInitialStoryState(runtimeScript);
    state = advanceToNextStop(state, runtimeScript).state;
    state = advanceToNextStop(state, runtimeScript).state;

    expect(() => StoryRuntimeSnapshotSchema.parse(storyRuntimeSnapshot(state))).not.toThrow();
  });
});

function reduceWithoutDiagnostics(
  state: ReturnType<typeof createInitialStoryState>,
  event: Parameters<typeof storyReducer>[1]
): ReturnType<typeof storyReducer> {
  const result = storyReducer(state, event);
  expect(result.diagnostics).toEqual([]);
  return result;
}

function runtimeScriptFixture(
  scriptPath: string,
  commands: RuntimeCommand[],
  labels: Record<string, number> = {}
): RuntimeScript {
  return runtimeScript(scriptPath, commands, labels);
}

function runtimeScript(
  scriptPath: string,
  commands: RuntimeCommand[],
  labels: Record<string, number> = {}
): RuntimeScript {
  return { scriptPath, commands, labels, assets: [], dependencies: [] };
}

function runtimeCommand(
  commandId: string,
  category: NaniCommandCategory,
  params: Record<string, RuntimeValue>,
  options: {
    canonicalName?: string;
    source?: NaniCommandSource;
    status?: NaniCommandStatus;
    condition?: RuntimeCommand["condition"];
    unless?: RuntimeCommand["unless"];
  } = {}
): RuntimeCommand {
  return {
    commandId,
    canonicalName: options.canonicalName ?? commandId,
    category,
    source: options.source ?? "v-ronpa",
    status: options.status ?? "implemented",
    params,
    ...(options.condition ? { condition: options.condition } : {}),
    ...(options.unless ? { unless: options.unless } : {}),
    loc: {
      scriptPath: "story-engine-test.nani",
      line: 1,
      column: 1,
      raw: `@${commandId}`
    }
  };
}
