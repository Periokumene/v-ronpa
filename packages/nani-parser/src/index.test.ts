import { describe, expect, it } from "vitest";
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
});
