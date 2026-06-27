import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CommandIR, NaniValue, ParseScenarioResult, TextIR } from "./index";
import { parseScenario } from "./index";

const baselineScript = `; comment
#Start
@bgm PianoTheme volume:0.6 fade:1 wait!
Felix.Happy: Hello, {playerName}. [< speed:0.5]Nice to meet you.[>]
@choice "Go left" goto:#Left if:{affinity>=3}
@choice "Go right"
    @set route:"right"
    @goto #Right

#Left
Narrator: You chose left.
@goto #End

#Right
Narrator: You chose right.

#End
@end`;

describe("nani parser", () => {
  it("parses baseline script into stable IR", () => {
    const result = parseScenario({ sourceText: baselineScript, scriptPath: "opening.nani" });

    expect(result.diagnostics).toEqual([]);
    expect(result.scenario.labels).toMatchInlineSnapshot(`
      {
        "End": 13,
        "Left": 8,
        "Right": 11,
        "Start": 1,
      }
    `);
    expect(result.scenario.statements.map((statement) => statement.kind)).toMatchInlineSnapshot(`
      [
        "comment",
        "label",
        "command",
        "text",
        "command",
        "command",
        "command",
        "command",
        "label",
        "text",
        "command",
        "label",
        "text",
        "label",
        "command",
      ]
    `);
    expect(result.scenario.statements[3]).toMatchInlineSnapshot(`
      {
        "appearance": "Happy",
        "kind": "text",
        "loc": {
          "column": 1,
          "line": 4,
          "raw": "Felix.Happy: Hello, {playerName}. [< speed:0.5]Nice to meet you.[>]",
          "scriptPath": "opening.nani",
        },
        "printParams": {
          "speed": {
            "type": "number",
            "value": 0.5,
          },
        },
        "speaker": "Felix",
        "tokens": [
          {
            "kind": "text",
            "text": "Hello, {playerName}. ",
          },
          {
            "command": {
              "args": [
                {
                  "key": "speed",
                  "kind": "param",
                  "raw": "speed:0.5",
                  "value": {
                    "type": "number",
                    "value": 0.5,
                  },
                },
              ],
              "commandId": "<",
              "flags": {},
              "inlineIndex": 1,
              "kind": "command",
              "loc": {
                "column": 35,
                "line": 4,
                "raw": "Felix.Happy: Hello, {playerName}. [< speed:0.5]Nice to meet you.[>]",
                "scriptPath": "opening.nani",
              },
              "params": {
                "speed": {
                  "type": "number",
                  "value": 0.5,
                },
              },
            },
            "kind": "inline-command",
          },
          {
            "kind": "text",
            "text": "Nice to meet you.",
          },
          {
            "command": {
              "args": [],
              "commandId": ">",
              "flags": {},
              "inlineIndex": 3,
              "kind": "command",
              "loc": {
                "column": 65,
                "line": 4,
                "raw": "Felix.Happy: Hello, {playerName}. [< speed:0.5]Nice to meet you.[>]",
                "scriptPath": "opening.nani",
              },
              "params": {},
            },
            "kind": "inline-command",
          },
        ],
      }
    `);
  });

  it("reports duplicate labels", () => {
    const result = parseScenario({
      sourceText: "#Start\n#Start",
      scriptPath: "dup.nani"
    });

    expect(result.diagnostics[0]?.message).toBe("Duplicate label: Start");
  });

  it("collects layered character pack references from char and slide commands", () => {
    const result = parseScenario({
      sourceText: [
        "@char Ema.Pensive1,ArmR3 pos:50",
        "@slide Ema from:40,0 to:50,0",
        "@slide Rina.Pensive1 from:30,0 to:50,0"
      ].join("\n"),
      scriptPath: "character-assets.nani"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.scenario.assets).toEqual([
      { id: "Ema", kind: "character-pack" },
      { id: "Rina", kind: "character-pack" }
    ]);
  });

  it("loads P1 fixture files into stable IR", () => {
    const results = [
      parseFixture("basic-navi.p1.nani"),
      parseFixture("basic-trial-discussion.p1.nani")
    ];

    expect(results.map((result) => result.diagnostics)).toEqual([[], []]);
    expect(results.map(fixtureSummary)).toMatchInlineSnapshot(`
      [
        {
          "commands": [
            {
              "commandId": "set",
              "line": 6,
              "params": {
                "route": "intro",
              },
              "primary": undefined,
            },
            {
              "commandId": "back",
              "line": 7,
              "params": {
                "bg": "harness",
                "effect": "fade",
              },
              "primary": undefined,
            },
            {
              "commandId": "char",
              "line": 8,
              "params": {
                "pos": 50,
              },
              "primary": "Ema.Pensive1",
            },
            {
              "commandId": "char",
              "line": 9,
              "params": {
                "pos": 50,
              },
              "primary": [
                "Ema.Pensive1",
                "ArmR3",
              ],
            },
            {
              "commandId": "char",
              "line": 10,
              "params": {
                "pos": 50,
              },
              "primary": [
                "Ema.Pensive1",
                "ArmR3",
                "ArmR4",
              ],
            },
            {
              "commandId": "char",
              "line": 11,
              "params": {
                "pos": 50,
              },
              "primary": [
                "Ema.Pensive1",
                "ArmR4",
                "Angle01/Head01/Facial01/Mouth01>Mouth01_Smile_Open",
              ],
            },
            {
              "commandId": "char",
              "line": 12,
              "params": {
                "pos": 50,
              },
              "primary": [
                "Ema.Pensive1",
                "ArmR4",
                "Angle01/Head01/Facial01/Sweat01+Sweat01_01",
              ],
            },
            {
              "commandId": "char",
              "line": 13,
              "params": {
                "pos": 50,
              },
              "primary": [
                "Ema.Pensive1",
                "ArmR4",
                "Angle01/Head01/Facial01/Sweat01+Sweat01_01",
                "Angle01/Head01/Facial01/Sweat01-",
              ],
            },
            {
              "commandId": "choice",
              "line": 17,
              "params": {
                "goto": "#InspectFile",
              },
              "primary": "Inspect the case file",
            },
            {
              "commandId": "choice",
              "line": 18,
              "params": {
                "goto": "#AskMira",
              },
              "primary": "Ask Mira about the lock",
            },
            {
              "commandId": "gameplay",
              "line": 21,
              "params": {
                "id": "evidence:keycard",
              },
              "primary": "grant-evidence",
            },
            {
              "commandId": "shake",
              "line": 22,
              "params": {
                "actorId": "Ema",
                "duration": 220,
                "intensity": 0.35,
              },
              "primary": undefined,
            },
            {
              "commandId": "goto",
              "line": 24,
              "params": {},
              "primary": "#End",
            },
            {
              "commandId": "flash",
              "line": 27,
              "params": {
                "color": "#8fd3ff",
                "duration": 120,
              },
              "primary": undefined,
            },
            {
              "commandId": "goto",
              "line": 29,
              "params": {},
              "primary": "#End",
            },
            {
              "commandId": "end",
              "line": 32,
              "params": {},
              "primary": undefined,
            },
          ],
          "inlineCommands": [
            {
              "appearance": "Neutral",
              "commandId": "<",
              "inlineIndex": 1,
              "line": 14,
              "params": {
                "speed": 0.8,
              },
              "speaker": "Felix",
            },
            {
              "appearance": "Neutral",
              "commandId": ">",
              "inlineIndex": 3,
              "line": 14,
              "params": {},
              "speaker": "Felix",
            },
            {
              "appearance": "Calm",
              "commandId": ">",
              "inlineIndex": 1,
              "line": 15,
              "params": {},
              "speaker": "Mira",
            },
            {
              "appearance": undefined,
              "commandId": ">",
              "inlineIndex": 1,
              "line": 23,
              "params": {},
              "speaker": "Narrator",
            },
            {
              "appearance": "Calm",
              "commandId": ">",
              "inlineIndex": 1,
              "line": 28,
              "params": {},
              "speaker": "Mira",
            },
          ],
          "labels": {
            "AskMira": 21,
            "End": 25,
            "InspectFile": 16,
            "Start": 3,
          },
          "scriptPath": "basic-navi.p1.nani",
          "statementKinds": [
            "comment",
            "comment",
            "comment",
            "label",
            "command",
            "command",
            "command",
            "command",
            "command",
            "command",
            "command",
            "command",
            "text",
            "text",
            "command",
            "command",
            "label",
            "command",
            "command",
            "text",
            "command",
            "label",
            "command",
            "text",
            "command",
            "label",
            "command",
          ],
        },
        {
          "commands": [
            {
              "commandId": "set",
              "line": 6,
              "params": {
                "trialMood": "opening",
              },
              "primary": undefined,
            },
            {
              "commandId": "back",
              "line": 7,
              "params": {
                "bg": "classroom",
                "effect": "fade",
              },
              "primary": undefined,
            },
            {
              "commandId": "char",
              "line": 8,
              "params": {
                "pos": 50,
              },
              "primary": "Ema.Pensive1",
            },
            {
              "commandId": "char",
              "line": 9,
              "params": {
                "pos": [
                  76,
                  0,
                ],
              },
              "primary": [
                "Ema.Pensive1",
                "ArmR3",
              ],
            },
            {
              "commandId": "char",
              "line": 10,
              "params": {
                "pos": [
                  76,
                  0,
                ],
              },
              "primary": [
                "Ema.Pensive1",
                "ArmR3",
                "ArmR4",
              ],
            },
            {
              "commandId": "char",
              "line": 11,
              "params": {
                "pos": [
                  76,
                  0,
                ],
              },
              "primary": [
                "Ema.Pensive1",
                "ArmR4",
                "Angle01/Head01/Facial01/Mouth01>Mouth01_Smile_Open",
              ],
            },
            {
              "commandId": "char",
              "line": 12,
              "params": {
                "pos": [
                  76,
                  0,
                ],
              },
              "primary": [
                "Ema.Pensive1",
                "ArmR4",
                "Angle01/Head01/Facial01/Sweat01+Sweat01_01",
              ],
            },
            {
              "commandId": "char",
              "line": 13,
              "params": {
                "pos": [
                  76,
                  0,
                ],
              },
              "primary": [
                "Ema.Pensive1",
                "ArmR4",
                "Angle01/Head01/Facial01/Sweat01+Sweat01_01",
                "Angle01/Head01/Facial01/Sweat01-",
              ],
            },
            {
              "commandId": "focus",
              "line": 15,
              "params": {
                "duration": 420,
              },
              "primary": "Ema",
            },
            {
              "commandId": "choice",
              "line": 18,
              "params": {
                "goto": "#PressQuestion",
              },
              "primary": "Press the question",
            },
            {
              "commandId": "choice",
              "line": 19,
              "params": {
                "goto": "#ListenLonger",
              },
              "primary": "Listen longer",
            },
            {
              "commandId": "flash",
              "line": 22,
              "params": {
                "color": "#ffe66d",
                "duration": 160,
              },
              "primary": undefined,
            },
            {
              "commandId": "goto",
              "line": 24,
              "params": {},
              "primary": "#TrialEnd",
            },
            {
              "commandId": "shake",
              "line": 27,
              "params": {
                "actorId": "Ema",
                "duration": 180,
                "intensity": 0.25,
              },
              "primary": undefined,
            },
            {
              "commandId": "goto",
              "line": 29,
              "params": {},
              "primary": "#TrialEnd",
            },
            {
              "commandId": "end",
              "line": 32,
              "params": {},
              "primary": undefined,
            },
          ],
          "inlineCommands": [
            {
              "appearance": "Serious",
              "commandId": ">",
              "inlineIndex": 1,
              "line": 14,
              "params": {},
              "speaker": "Felix",
            },
            {
              "appearance": "Calm",
              "commandId": "<",
              "inlineIndex": 1,
              "line": 16,
              "params": {
                "speed": 0.8,
              },
              "speaker": "Mira",
            },
            {
              "appearance": "Calm",
              "commandId": ">",
              "inlineIndex": 2,
              "line": 16,
              "params": {},
              "speaker": "Mira",
            },
            {
              "appearance": undefined,
              "commandId": ">",
              "inlineIndex": 1,
              "line": 23,
              "params": {},
              "speaker": "Narrator",
            },
            {
              "appearance": "Serious",
              "commandId": ">",
              "inlineIndex": 1,
              "line": 28,
              "params": {},
              "speaker": "Felix",
            },
          ],
          "labels": {
            "ListenLonger": 21,
            "PressQuestion": 17,
            "TrialEnd": 25,
            "TrialOpening": 3,
          },
          "scriptPath": "basic-trial-discussion.p1.nani",
          "statementKinds": [
            "comment",
            "comment",
            "comment",
            "label",
            "command",
            "command",
            "command",
            "command",
            "command",
            "command",
            "command",
            "command",
            "text",
            "command",
            "text",
            "command",
            "command",
            "label",
            "command",
            "text",
            "command",
            "label",
            "command",
            "text",
            "command",
            "label",
            "command",
          ],
        },
      ]
    `);
  });

  it("keeps P1 documentation code blocks synchronized with fixture files", () => {
    const docs = readFileSync(new URL("../../../docs/nani/basic-p1-example.md", import.meta.url), "utf8");

    expect(fixtureCodeBlock(docs, "basic-navi.p1.nani")).toBe(readFixture("basic-navi.p1.nani").trimEnd());
    expect(fixtureCodeBlock(docs, "basic-trial-discussion.p1.nani")).toBe(
      readFixture("basic-trial-discussion.p1.nani").trimEnd()
    );
  });

  it("reports missing local label references while preserving the partial scenario", () => {
    const result = parseScenario({
      sourceText: `#Start
@goto #Missing
@choice "Missing choice" goto:#ChoiceMissing
#Known
@goto #Known`,
      scriptPath: "missing-local-label.nani"
    });

    expect(result.scenario.labels).toEqual({ Start: 0, Known: 3 });
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Missing local label reference: #Missing",
      "Missing local label reference: #ChoiceMissing"
    ]);
    expect(result.scenario.statements).toHaveLength(5);
  });

  it("accepts known local label references in command primary and goto params", () => {
    const result = parseScenario({
      sourceText: `#Start
@choice "Known choice" goto:#Known
@goto #Known
@goto if:{ready} #Known
#Known
@end`,
      scriptPath: "known-local-label.nani"
    });

    expect(result.diagnostics).toEqual([]);
  });

  it("preserves official catalog parameter names instead of treating them as primary values", () => {
    const result = parseScenario({
      sourceText: `@camera offset:1,2 zoom:1.25 ortho:false
@char hero appearance:happy position:0.5,0,0 wait:false`,
      scriptPath: "official-params.nani"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.scenario.statements.filter(isCommand).map(commandSummary)).toEqual([
      {
        line: 1,
        commandId: "camera",
        primary: undefined,
        params: {
          offset: [1, 2],
          zoom: 1.25,
          ortho: false
        }
      },
      {
        line: 2,
        commandId: "char",
        primary: "hero",
        params: {
          appearance: "happy",
          position: [0.5, 0, 0],
          wait: false
        }
      }
    ]);
  });

  it("keeps official command parsing generic and leaves parameter semantics to StoryEngine", () => {
    const result = parseScenario({
      sourceText: "@camera offset:not-a-decimal-list zoom:fast",
      scriptPath: "generic-official-params.nani"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.scenario.statements.filter(isCommand).map(commandSummary)).toEqual([
      {
        line: 1,
        commandId: "camera",
        primary: undefined,
        params: {
          offset: "not-a-decimal-list",
          zoom: "fast"
        }
      }
    ]);
  });

  it("preserves ordered args for colon-like primary values, flags, and command conditions", () => {
    const result = parseScenario({
      sourceText: "@back bg:harness if:{showBg} wait! !lazy",
      scriptPath: "ordered-args.nani"
    });
    const command = result.scenario.statements[0] as CommandIR;

    expect(result.diagnostics).toEqual([]);
    expect(command.primary).toBeUndefined();
    expect(command.params).toEqual({
      bg: { type: "string", value: "harness" }
    });
    expect(command.condition).toEqual({ source: "showBg" });
    expect(command.args).toEqual([
      { kind: "param", raw: "bg:harness", key: "bg", value: { type: "string", value: "harness" } },
      { kind: "param", raw: "if:{showBg}", key: "if", value: { type: "expression", source: "showBg" } },
      { kind: "flag", raw: "wait!", key: "wait", value: true },
      { kind: "flag", raw: "!lazy", key: "lazy", value: false }
    ]);
  });
});

function parseFixture(name: string): ParseScenarioResult {
  return parseScenario({ sourceText: readFixture(name), scriptPath: name });
}

function readFixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

function fixtureCodeBlock(markdown: string, fixtureName: string): string {
  const escapedName = fixtureName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`## \`${escapedName}\`\\n\\n\`\`\`nani\\n([\\s\\S]*?)\\n\`\`\``));
  if (!match) throw new Error(`Missing code block for ${fixtureName}`);
  return match[1] ?? "";
}

function fixtureSummary(result: ParseScenarioResult) {
  return {
    scriptPath: result.scenario.scriptPath,
    labels: result.scenario.labels,
    statementKinds: result.scenario.statements.map((statement) => statement.kind),
    commands: result.scenario.statements.filter(isCommand).map(commandSummary),
    inlineCommands: result.scenario.statements.filter(isText).flatMap(inlineCommandSummary)
  };
}

function isCommand(statement: ParseScenarioResult["scenario"]["statements"][number]): statement is CommandIR {
  return statement.kind === "command";
}

function isText(statement: ParseScenarioResult["scenario"]["statements"][number]): statement is TextIR {
  return statement.kind === "text";
}

function commandSummary(command: CommandIR) {
  return {
    line: command.loc.line,
    commandId: command.commandId,
    primary: valueSummary(command.primary),
    params: paramsSummary(command.params)
  };
}

function inlineCommandSummary(text: TextIR) {
  return text.tokens
    .filter((token) => token.kind === "inline-command")
    .map((token) => ({
      line: text.loc.line,
      speaker: text.speaker,
      appearance: text.appearance,
      commandId: token.command.commandId,
      inlineIndex: token.command.inlineIndex,
      params: paramsSummary(token.command.params)
    }));
}

function paramsSummary(params: Record<string, NaniValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, valueSummary(value)]));
}

function valueSummary(value: NaniValue | undefined): unknown {
  if (!value) return undefined;

  switch (value.type) {
    case "string":
    case "number":
    case "boolean":
      return value.value;
    case "raw":
      return value.value;
    case "expression":
      return `{${value.source}}`;
    case "list":
      return value.value.map(valueSummary);
  }
}
