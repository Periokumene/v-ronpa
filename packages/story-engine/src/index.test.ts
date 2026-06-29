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
      target: "Ema",
      appearanceExpression: "Pensive1,ArmR3",
      pos: [0.5, 0]
    }, { source: "naninovel" }),
    runtimeCommand("print", "text", { text: "The door was locked.", speaker: "Felix", autoNext: true }),
    runtimeCommand("trialkeyword", "ui", {
      keywordId: "kw:locked",
      text: "locked",
      speakerId: "Ema"
    }),
    runtimeCommand("choice", "choice", { text: "Object with the keycard", goto: "#Object" }, { source: "naninovel" }),
    runtimeCommand("choice", "choice", { text: "Stay silent", goto: "#End" }, { source: "naninovel" }),
    runtimeCommand("set", "state", { key: "route", value: "objected" }, { source: "naninovel" }),
    runtimeCommand("shake", "effect", { target: "Ema", intensity: 0.5, duration: 300 }, { source: "naninovel" }),
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
      target: "Ema",
      appearanceExpression: "",
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
            "enabled": true,
            "goto": "#Object",
            "text": "Object with the keycard",
          },
          {
            "enabled": true,
            "goto": "#End",
            "text": "Stay silent",
          },
        ],
        "text": {
          "current": {
            "speaker": "Felix",
            "text": "The door was locked.",
          },
          "printerId": "default",
          "visible": true,
        },
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
      { text: "Return to the hallway", goto: "#Return", enabled: true },
      { text: "Follow the witness into class", goto: "#Classroom", enabled: true }
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
      "append",
      "arrange",
      "back",
      "bgm",
      "blur",
      "bokeh",
      "char",
      "choice",
      "clearbacklog",
      "clearchoice",
      "glitch",
      "glitchfilter",
      "goto",
      "hidechars",
      "hideui",
      "input",
      "movie",
      "print",
      "rain",
      "resettext",
      "set",
      "sfx",
      "sfxfast",
      "shake",
      "showprinter",
      "showui",
      "slide",
      "snow",
      "stopbgm",
      "stopsfx",
      "sun",
      "toast",
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
        target: "Ema",
        appearanceExpression: "Pensive1",
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
        target: "Ema"
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
    expect(result.state.pendingChoices).toEqual([{ text: "Open the door", goto: "#Open", enabled: true }]);
    expect(result.emittedRuntimeCommands).toEqual([]);
  });

  it("keeps current text separate from backlog for append, resetText, clearBacklog, and showPrinter", () => {
    const runtimeScript = runtimeScriptFixture("text-state.nani", [
      runtimeCommand("append", "text", { text: "Draft" }),
      runtimeCommand("showprinter", "text", { printerId: "say" }),
      runtimeCommand("resettext", "text", {}),
      runtimeCommand("append", "text", { text: "Fresh" }),
      runtimeCommand("print", "text", { speaker: "Felix", text: "Logged.", autoNext: false }),
      runtimeCommand("clearbacklog", "text", {}),
      runtimeCommand("print", "text", { speaker: "Mira", text: "After clear.", autoNext: false })
    ]);

    let state = createInitialStoryState(runtimeScript);
    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(selectCurrentStoryLine(state)).toEqual({ text: "Draft" });
    expect(state.backlog).toEqual([]);

    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(state.text?.printerId).toBe("say");

    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(selectCurrentStoryLine(state)).toBeUndefined();

    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(selectCurrentStoryLine(state)).toEqual({ text: "Fresh" });
    expect(state.backlog).toEqual([]);

    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(state.backlog).toEqual([{ speaker: "Felix", text: "Logged." }]);

    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(state.backlog).toEqual([]);
    expect(selectCurrentStoryLine(state)).toEqual({ speaker: "Felix", text: "Logged." });

    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(state.backlog).toEqual([{ speaker: "Mira", text: "After clear." }]);
  });

  it("stores rich text snapshots for print, append, backlog, and choices", () => {
    const runtimeScript = runtimeScriptFixture("rich-story.nani", [
      runtimeCommand(
        "print",
        "text",
        { speaker: "Felix", text: "Bold", autoNext: false },
        { richText: { text: "Bold", runs: [{ start: 0, end: 4, style: { bold: true } }] } }
      ),
      runtimeCommand(
        "append",
        "text",
        { text: " marked" },
        { richText: { text: " marked", runs: [{ start: 1, end: 7, style: { markColor: "default" } }] } }
      ),
      runtimeCommand("choice", "choice", { text: "Inspect", goto: "#Inspect" }, { richText: { text: "Inspect", runs: [{ start: 0, end: 7, style: { italic: true } }] } })
    ]);

    let state = createInitialStoryState(runtimeScript);
    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(state.text?.current?.richText).toEqual({ text: "Bold", runs: [{ start: 0, end: 4, style: { bold: true } }] });
    expect(state.backlog.at(-1)?.richText).toEqual({ text: "Bold", runs: [{ start: 0, end: 4, style: { bold: true } }] });

    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(selectCurrentStoryLine(state)).toEqual({
      speaker: "Felix",
      text: "Bold marked",
      richText: {
        text: "Bold marked",
        runs: [
          { start: 0, end: 4, style: { bold: true } },
          { start: 5, end: 11, style: { markColor: "default" } }
        ]
      }
    });

    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(state.pendingChoices[0]).toMatchObject({
      text: "Inspect",
      richText: { text: "Inspect", runs: [{ start: 0, end: 7, style: { italic: true } }] }
    });
  });

  it("emits print textId for app adapters without persisting it into current text or backlog", () => {
    const runtimeScript = runtimeScriptFixture("textid-story.nani", [
      runtimeCommand("print", "text", { speaker: "Felix", text: "Voiced line.", autoNext: false, textId: "voice_validation_0001" })
    ]);

    const result = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);

    expect(result.emittedRuntimeCommands).toEqual([
      expect.objectContaining({
        commandId: "print",
        params: expect.objectContaining({ textId: "voice_validation_0001" })
      })
    ]);
    expect(result.state.backlog).toEqual([{ speaker: "Felix", text: "Voiced line." }]);
    expect(result.state.text?.current).toEqual({ speaker: "Felix", text: "Voiced line." });
    expect(storyRuntimeSnapshot(result.state).backlog).toEqual([{ speaker: "Felix", text: "Voiced line." }]);
  });

  it("blocks on wait runtimeWait until a matching completion event arrives", () => {
    const runtimeScript = runtimeScriptFixture("wait.nani", [
      runtimeCommand("wait", "text", { waitMode: "i5" }),
      runtimeCommand("print", "text", { speaker: "Felix", text: "Resumed.", autoNext: false })
    ]);
    const first = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);

    expect(first.stopReason).toBe("runtime-wait");
    expect(first.state.runtimeWait).toEqual({
      kind: "pause",
      commandId: "wait",
      commandIndex: 0,
      mode: "timer-or-confirm",
      durationMs: 5000
    });
    expect(advanceToNextStop(first.state, runtimeScript)).toMatchObject({
      state: first.state,
      stopReason: "runtime-wait",
      diagnostics: [{ code: "runtime-wait", message: "Story is waiting for a runtime command to complete; advance did not change state." }]
    });

    const wrongCompletion = storyReducer(first.state, { type: "RUNTIME_WAIT_COMPLETE", script: runtimeScript, kind: "movie" });
    expect(wrongCompletion.state).toBe(first.state);
    expect(wrongCompletion.diagnostics).toEqual([
      {
        code: "invalid-runtime-wait-completion",
        message: "Runtime wait completion movie does not match the active wait."
      }
    ]);

    const completed = reduceWithoutDiagnostics(first.state, { type: "RUNTIME_WAIT_COMPLETE", script: runtimeScript, kind: "pause" });
    const resumed = advanceToNextStop(completed.state, runtimeScript);
    expect(resumed.stopReason).toBe("text");
    expect(selectCurrentStoryLine(resumed.state)).toEqual({ speaker: "Felix", text: "Resumed." });
  });

  it("validates input submissions as the only input completion path", () => {
    const runtimeScript = runtimeScriptFixture("input.nani", [
      runtimeCommand("input", "text", { variableName: "score", valueType: "number", summary: "Score" }),
      runtimeCommand("print", "text", { speaker: "Felix", text: "Captured.", autoNext: false })
    ]);
    const first = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);

    expect(first.stopReason).toBe("runtime-wait");
    expect(first.state.runtimeWait).toMatchObject({
      kind: "input",
      commandId: "input",
      commandIndex: 0,
      variableName: "score",
      valueType: "number",
      summary: "Score"
    });

    const invalid = storyReducer(first.state, { type: "SUBMIT_INPUT", script: runtimeScript, value: "NaN" });
    expect(invalid.state).toBe(first.state);
    expect(invalid.diagnostics).toEqual([
      { code: "input-validation", message: "Input value NaN is not a valid number.", severity: "warning" }
    ]);

    const completed = reduceWithoutDiagnostics(first.state, { type: "SUBMIT_INPUT", script: runtimeScript, value: "42" });
    expect(completed.state.variables.score).toBe(42);
    expect(completed.state.runtimeWait).toBeUndefined();
    expect(storyReducer(completed.state, { type: "RUNTIME_WAIT_COMPLETE", script: runtimeScript, kind: "pause" }).diagnostics).toEqual([
      {
        code: "invalid-runtime-wait-completion",
        message: "Runtime wait completion pause does not match the active wait."
      }
    ]);
  });

  it("emits media/UI commands while movie block:true creates a runtimeWait", () => {
    const runtimeScript = runtimeScriptFixture("media-ui.nani", [
      runtimeCommand("bgm", "media", { bgmPath: "bgm:main", group: "music" }),
      runtimeCommand("sfx", "media", { sfxPath: "sfx:loop", group: "rain", loop: true }),
      runtimeCommand("hideui", "ui", { target: "dialog", visible: false }),
      runtimeCommand("hideui", "ui", { target: "commandBar" }),
      runtimeCommand("toast", "ui", { text: "Ready" }),
      runtimeCommand("movie", "media", { moviePath: "movie:intro", block: false }),
      runtimeCommand("movie", "media", { moviePath: "movie:blocked", block: true }),
      runtimeCommand("print", "text", { speaker: "Felix", text: "After movie.", autoNext: false })
    ]);

    const result = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);

    expect(result.stopReason).toBe("runtime-wait");
    expect(result.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["bgm", "sfx", "hideui", "hideui", "toast", "movie", "movie"]);
    expect(result.state.runtimeWait).toEqual({
      kind: "movie",
      commandId: "movie",
      commandIndex: 6,
      moviePath: "movie:blocked",
      allowSkip: true
    });

    const completed = reduceWithoutDiagnostics(result.state, { type: "RUNTIME_WAIT_COMPLETE", script: runtimeScript, kind: "movie" });
    const resumed = advanceToNextStop(completed.state, runtimeScript);
    expect(resumed.stopReason).toBe("text");
    expect(selectCurrentStoryLine(resumed.state)).toEqual({ speaker: "Felix", text: "After movie." });
  });

  it("supports choice ids, disabled choices, clearChoice, and choice set expressions", () => {
    const runtimeScript = runtimeScriptFixture("choices.nani", [
      runtimeCommand("choice", "choice", { id: "a", text: "A", goto: "#A", setExpression: "route:a" }),
      runtimeCommand("choice", "choice", { id: "b", text: "B", goto: "#B", enabled: false }),
      runtimeCommand("clearchoice", "choice", { id: "missing" }),
      runtimeCommand("clearchoice", "choice", { id: "b" }),
      runtimeCommand("print", "text", { text: "Skipped.", autoNext: false }),
      runtimeCommand("print", "text", { text: "A path.", autoNext: false }),
      runtimeCommand("print", "text", { text: "B path.", autoNext: false })
    ], { Start: 0, A: 5, B: 6 });

    let state = createInitialStoryState(runtimeScript);
    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;

    expect(state.pendingChoices).toEqual([
      { id: "a", text: "A", goto: "#A", enabled: true, setExpression: "route:a" },
      { id: "b", text: "B", goto: "#B", enabled: false }
    ]);
    expect(chooseStoryOption(state, runtimeScript, 1).diagnostics).toEqual([
      { code: "invalid-choice", message: "Choice index 1 is disabled." }
    ]);

    const missingClear = storyReducer(state, { type: "STEP", script: runtimeScript });
    expect(missingClear.diagnostics).toEqual([
      { code: "invalid-choice", message: "Choice id missing is not available." }
    ]);
    state = missingClear.state;

    state = reduceWithoutDiagnostics(state, { type: "STEP", script: runtimeScript }).state;
    expect(state.pendingChoices).toEqual([{ id: "a", text: "A", goto: "#A", enabled: true, setExpression: "route:a" }]);

    const chosen = chooseStoryOption(state, runtimeScript, 0);
    expect(chosen.diagnostics).toEqual([]);
    expect(chosen.state.variables.route).toBe("a");
    expect(chosen.state.instructionPointer).toBe(runtimeScript.labels.A);
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

  it("diagnoses unsupported or missing goto targets instead of silently dropping them", () => {
    const runtimeScript = runtimeScriptFixture(
      "goto-boundary.nani",
      [
        runtimeCommand("goto", "flow", { label: "other.nani#Start" }, { source: "naninovel" }),
        runtimeCommand("goto", "flow", { label: "#Missing" }, { source: "naninovel" }),
        runtimeCommand("print", "text", { speaker: "Mira", text: "After invalid goto.", autoNext: false })
      ],
      { Start: 0 }
    );
    let state = createInitialStoryState(runtimeScript);

    const crossScript = storyReducer(state, { type: "STEP", script: runtimeScript });
    expect(crossScript.state.instructionPointer).toBe(1);
    expect(crossScript.diagnostics).toEqual([
      {
        code: "unsupported-command-param",
        message: "@goto target other.nani#Start is outside this task's local-label boundary; cross-script goto is not implemented.",
        severity: "warning"
      }
    ]);

    state = crossScript.state;
    const missing = storyReducer(state, { type: "STEP", script: runtimeScript });
    expect(missing.state.instructionPointer).toBe(2);
    expect(missing.diagnostics).toEqual([
      {
        code: "invalid-goto",
        message: "@goto target #Missing does not exist in goto-boundary.nani.",
        severity: "warning"
      }
    ]);

    const resumed = reduceWithoutDiagnostics(missing.state, { type: "STEP", script: runtimeScript });
    expect(selectCurrentStoryLine(resumed.state)).toEqual({ speaker: "Mira", text: "After invalid goto." });
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
    richText?: RuntimeCommand["richText"];
  } = {}
): RuntimeCommand {
  return {
    commandId,
    canonicalName: options.canonicalName ?? commandId,
    category,
    source: options.source ?? "v-ronpa",
    status: options.status ?? "implemented",
    params,
    ...(options.richText ? { richText: options.richText } : {}),
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
