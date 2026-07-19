import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  CommandArgIR,
  CommandIR,
  NaniCommandArgumentSourceMap,
  NaniSourceRef,
  NaniValue,
  ParseScenarioResult,
  TextIR,
  TextSpan
} from "./index";
import { parseScenario, resolveNaniSourceRef } from "./index";

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
  it("collects the same static cross-script dependencies from goto and choice", () => {
    const result = parseScenario({
      scriptPath: "game-a/opening.nani",
      sourceText: [
        "#Start",
        "@goto game-a/chapter-02.nani",
        '@choice "Continue" goto:game-a/chapter-02.nani#Start',
        "@goto #Start",
        '@choice "Again" goto:#Start'
      ].join("\n")
    });

    expect(result.scenario.dependencies).toEqual([
      { endpoint: "game-a/chapter-02.nani" },
      { endpoint: "game-a/chapter-02.nani#Start" }
    ]);
  });

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

  it("extracts Naninovel textId markers from visible text while preserving inline commands", () => {
    const result = parseScenario({
      sourceText: "Felix.Neutral: 文本|#voice_validation_0001|[>]",
      scriptPath: "textid.nani"
    });
    const text = result.scenario.statements[0] as TextIR;

    expect(result.diagnostics).toEqual([]);
    expect(text.textId).toBe("voice_validation_0001");
    expect(text.tokens).toEqual([
      { kind: "text", text: "文本" },
      expect.objectContaining({
        kind: "inline-command",
        command: expect.objectContaining({ commandId: ">" })
      })
    ]);
  });

  it("diagnoses invalid, empty, multiple, and duplicate textId markers without leaking markers into text tokens", () => {
    const result = parseScenario({
      sourceText: [
        "Felix: Empty|#|[>]",
        "Mira: Bad|#bad id|[>]",
        "Ren: Path-like|#chapter/line|[>]",
        "Narrator: Many|#one| markers|#two|[>]",
        "Felix: First duplicate|#dup_id|[>]",
        "Mira: Second duplicate|#dup_id|[>]"
      ].join("\n"),
      scriptPath: "textid-errors.nani"
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Invalid textId marker: (empty)",
      "Invalid textId marker: bad id",
      "Invalid textId marker: chapter/line",
      "Text line may contain only one textId marker.",
      "Duplicate textId: dup_id"
    ]);
    expect(
      result.scenario.statements
        .filter(isText)
        .flatMap((statement) => statement.tokens.filter((token) => token.kind === "text").map((token) => token.text))
        .join("\n")
    ).not.toContain("|#");
    expect((result.scenario.statements[0] as TextIR).textId).toBeUndefined();
    expect((result.scenario.statements[1] as TextIR).textId).toBeUndefined();
    expect((result.scenario.statements[2] as TextIR).textId).toBeUndefined();
    expect((result.scenario.statements[3] as TextIR).textId).toBeUndefined();
  });

  it("does not parse textId markers from top-level text commands", () => {
    const result = parseScenario({
      sourceText: [
        '@print "Visible marker|#print_marker|"',
        '@append "Visible marker|#append_marker|"',
        '@toast "Visible marker|#toast_marker|"'
      ].join("\n"),
      scriptPath: "textid-command-markers.nani"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.scenario.statements.map((statement) => statement.kind)).toEqual(["command", "command", "command"]);
    expect((result.scenario.statements[0] as CommandIR).primary).toEqual({
      type: "string",
      value: "Visible marker|#print_marker|"
    });
    expect((result.scenario.statements[1] as CommandIR).primary).toEqual({
      type: "string",
      value: "Visible marker|#append_marker|"
    });
    expect((result.scenario.statements[2] as CommandIR).primary).toEqual({
      type: "string",
      value: "Visible marker|#toast_marker|"
    });
  });

  it("parses first-pass HTML rich text for dialogue and text commands", () => {
    const result = parseScenario({
      sourceText: [
        'Felix: <b>Bold</b> and <font color="#ff5577" size="+1" face="font:serif">danger</font><br>next &lt;tag&gt;[>]',
        '@choice "<mark>Inspect</mark>" goto:#Inspect',
        '@toast "<small>Saved&nbsp;now</small>"',
        "#Inspect"
      ].join("\n"),
      scriptPath: "rich-text.nani"
    });
    const line = result.scenario.statements[0] as TextIR;
    const choice = result.scenario.statements[1] as CommandIR;
    const toast = result.scenario.statements[2] as CommandIR;

    expect(result.diagnostics).toEqual([]);
    expect(line.richText).toMatchObject({
      text: "Bold and danger\nnext <tag>",
      runs: [
        { start: 0, end: 4, style: { bold: true } },
        { start: 9, end: 15, style: { color: "#ff5577", sizeScale: 1.125, fontId: "font:serif" } }
      ]
    });
    expect(choice.richTextPrimary).toMatchObject({
      text: "Inspect",
      runs: [{ start: 0, end: 7, style: { markColor: "default" } }]
    });
    expect(toast.richTextPrimary).toMatchObject({
      text: "Saved\u00a0now",
      runs: [{ start: 0, end: 9, style: { sizeScale: 0.85 } }]
    });
  });

  it("keeps unsupported rich text tags visible and reports diagnostics", () => {
    const result = parseScenario({
      sourceText: 'Mira: <color=#f00>No TMP alias</color>\n@toast "<font face=\\"Georgia\\">Raw font</font>"',
      scriptPath: "rich-text-errors.nani"
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Unsupported rich text tag: color.",
      "Invalid rich text font face: Georgia."
    ]);
    expect((result.scenario.statements[0] as TextIR).richText).toBeUndefined();
    expect(((result.scenario.statements[0] as TextIR).tokens[0] as { text: string }).text).toBe("<color=#f00>No TMP alias</color>");
    expect((result.scenario.statements[1] as CommandIR).richTextPrimary).toBeUndefined();
  });

  it("keeps rich text tags with unsupported attributes visible and reports diagnostics", () => {
    const result = parseScenario({
      sourceText: [
        'Mira: <b class="loud">Bold</b>',
        '@toast "<font color=\\"red\\" onclick=\\"bad\\">Warn</font>"',
        '@print "<font color=\\"red\\" color=\\"blue\\">Duplicate</font>"',
        '@append "<font color=\\"red\\" broken>Broken</font>"'
      ].join("\n"),
      scriptPath: "rich-text-attributes.nani"
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Rich text tag 'b' does not accept attributes.",
      "Unsupported rich text font attribute: onclick.",
      "Duplicate rich text font attribute: color.",
      "Invalid rich text attribute syntax: broken."
    ]);
    expect((result.scenario.statements[0] as TextIR).richText).toBeUndefined();
    expect(((result.scenario.statements[0] as TextIR).tokens[0] as { text: string }).text).toBe('<b class="loud">Bold</b>');
    expect((result.scenario.statements[1] as CommandIR).richTextPrimary).toBeUndefined();
    expect((result.scenario.statements[2] as CommandIR).richTextPrimary).toBeUndefined();
    expect((result.scenario.statements[3] as CommandIR).richTextPrimary).toBeUndefined();
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

  it("preserves raw actor asset metadata for expression and scalar primaries", () => {
    const result = parseScenario({
      sourceText: [
        "@char {actor}",
        "@char {actor.pose}",
        "@char 50",
        "@char true",
        "@slide {actor.pose}"
      ].join("\n"),
      scriptPath: "raw-character-assets.nani"
    });

    expect(result.scenario.assets).toEqual([
      { id: "{actor}", kind: "character-pack" },
      { id: "{actor", kind: "character-pack" },
      { id: "50", kind: "character-pack" },
      { id: "true", kind: "character-pack" }
    ]);
  });

  it("collects inner background references from inback commands as background assets", () => {
    const result = parseScenario({
      sourceText: "@inback bg:framed-room effect:fade time:0.2 wait!",
      scriptPath: "inner-background-assets.nani"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.scenario.assets).toEqual([{ id: "bg:framed-room", kind: "background" }]);
    expect(result.scenario.statements[0]).toMatchObject({
      kind: "command",
      commandId: "inback"
    });
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

  it("anchors promoted raw local-label references to the whole source argument", () => {
    const source = ["@goto #:", "@goto #:x"].join("\n");
    const result = parseScenario({ sourceText: source, scriptPath: "promoted-label-spans.nani" });

    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, sourceSlice(source, diagnostic.span)])).toEqual([
      ["missing-local-label", "#:"],
      ["missing-local-label", "#:x"]
    ]);
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

  it("derives primary, params, and flags only from the ordered args projection", () => {
    const result = parseScenario({
      sourceText: "@print First text:one text:two wait! !wait if:{ready} unless:{blocked}",
      scriptPath: "ir-projection.nani"
    });
    const command = result.scenario.statements[0];
    if (command?.kind !== "command") throw new Error("Test fixture must parse as a command.");

    const projected = projectCommandArgs(command.args);
    expect(command.primary).toEqual(projected.primary);
    expect(command.params).toEqual(projected.params);
    expect(command.flags).toEqual(projected.flags);
  });

  it("warns when whitespace prevents command params from parsing normally without changing IR", () => {
    const result = parseScenario({
      sourceText: ["@bgm Piano volume :0.8", "@sfx Door volume: 0.5"].join("\n"),
      scriptPath: "param-spacing.nani"
    });

    expect(result.diagnostics.map(({ severity, message }) => ({ severity, message }))).toEqual([
      {
        severity: "warning",
        message: 'Parameter volume has whitespace before ":"; use volume:<value> so it is parsed as a parameter.'
      },
      {
        severity: "warning",
        message: 'Parameter volume has whitespace after ":"; use volume:<value> so it is parsed as a parameter.'
      }
    ]);
    expect(result.scenario.statements.filter(isCommand).map(commandSummary)).toEqual([
      {
        line: 1,
        commandId: "bgm",
        primary: "Piano",
        params: {}
      },
      {
        line: 2,
        commandId: "sfx",
        primary: "Door",
        params: {
          volume: ""
        }
      }
    ]);
  });

  it("reports unclosed command quotes and expression braces while preserving partial commands", () => {
    const result = parseScenario({
      sourceText: ['@bgm "Piano volume:0.8', "@print Hello if:{ready"].join("\n"),
      scriptPath: "unclosed-command-syntax.nani"
    });

    expect(result.diagnostics.map(({ severity, message }) => ({ severity, message }))).toEqual([
      { severity: "error", message: "Unclosed quoted command argument." },
      { severity: "error", message: "Unclosed command expression brace." }
    ]);
    expect(result.scenario.statements.filter(isCommand).map(commandSummary)).toEqual([
      {
        line: 1,
        commandId: "bgm",
        primary: "Piano volume:0.8",
        params: {}
      },
      {
        line: 2,
        commandId: "print",
        primary: "Hello",
        params: {}
      }
    ]);
  });

  it("diagnoses unsupported inline commands and invalid inline print speed", () => {
    const result = parseScenario({
      sourceText: "Felix: Hello [bogus] and [< speed:fast] world[>]",
      scriptPath: "inline-diagnostics.nani"
    });

    expect(result.diagnostics.map(({ severity, message }) => ({ severity, message }))).toEqual([
      {
        severity: "error",
        message: "Unsupported inline .nani command: [bogus]. Inline commands currently support [>] and [< speed:<decimal>]."
      },
      {
        severity: "error",
        message: "Inline print parameter speed expected decimal."
      }
    ]);
    const text = result.scenario.statements[0] as TextIR;
    expect(text.tokens.filter((token) => token.kind === "inline-command")).toHaveLength(3);
    expect(text.printParams).toEqual({ speed: { type: "string", value: "fast" } });
  });

  it("targets each invalid inline-command argument form", () => {
    const source = "Felix: [> extra] and [< other:value]";
    const result = parseScenario({ sourceText: source, scriptPath: "inline-argument-spans.nani" });

    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, sourceSlice(source, diagnostic.span)])).toEqual([
      ["invalid-inline-command-argument", "extra"],
      ["invalid-inline-command-argument", "other:value"]
    ]);
    expectCompleteSourceCoverage(source, result);
  });

  it("maps structural source refs through CRLF, emoji, repeated text, lists, flags, and inline commands", () => {
    const source = [
      "\t#Start",
      '  @choice "😀 repeated repeated" goto:#Missing,#Start wait! !lazy',
      "  Felix.Happy: 😀 before [< speed:fast] repeated|#line_id|[>]"
    ].join("\r\n");
    const result = parseScenario({ sourceText: source, scriptPath: "mapped.nani" });
    const slice = (ref: NaniSourceRef): string => sourceSlice(source, resolveNaniSourceRef(result.sourceMap, ref));

    expect(slice({ kind: "statement", statementIndex: 0, part: "marker" })).toBe("#");
    expect(slice({ kind: "label-name", statementIndex: 0 })).toBe("Start");
    expect(slice({ kind: "statement", statementIndex: 1, part: "whole" })).toBe(
      '@choice "😀 repeated repeated" goto:#Missing,#Start wait! !lazy'
    );
    expect(slice({ kind: "command-name", statementIndex: 1 })).toBe("choice");
    expect(slice({ kind: "command-argument", statementIndex: 1, argumentIndex: 0, part: "whole" })).toBe(
      '"😀 repeated repeated"'
    );
    expect(slice({ kind: "command-argument", statementIndex: 1, argumentIndex: 0, part: "value" })).toBe(
      "😀 repeated repeated"
    );
    expect(slice({ kind: "command-argument", statementIndex: 1, argumentIndex: 1, part: "key" })).toBe("goto");
    expect(slice({ kind: "command-argument", statementIndex: 1, argumentIndex: 1, part: "colon" })).toBe(":");
    expect(slice({ kind: "command-argument", statementIndex: 1, argumentIndex: 1, part: "value", itemIndex: 0 })).toBe(
      "#Missing"
    );
    expect(slice({ kind: "command-argument", statementIndex: 1, argumentIndex: 1, part: "value", itemIndex: 1 })).toBe(
      "#Start"
    );
    expect(slice({ kind: "command-argument", statementIndex: 1, argumentIndex: 2, part: "flag-marker" })).toBe("!");
    expect(slice({ kind: "command-argument", statementIndex: 1, argumentIndex: 3, part: "key" })).toBe("lazy");
    expect(slice({ kind: "text-part", statementIndex: 2, part: "speaker" })).toBe("Felix");
    expect(slice({ kind: "text-part", statementIndex: 2, part: "appearance" })).toBe("Happy");
    expect(slice({ kind: "text-part", statementIndex: 2, part: "body" })).toBe(
      "😀 before [< speed:fast] repeated|#line_id|[>]"
    );
    expect(slice({ kind: "inline-command", statementIndex: 2, tokenIndex: 1, part: "whole" })).toBe("[< speed:fast]");
    expect(slice({ kind: "inline-command", statementIndex: 2, tokenIndex: 1, part: "name" })).toBe("<");
    expect(
      slice({ kind: "inline-command-argument", statementIndex: 2, tokenIndex: 1, argumentIndex: 0, part: "value" })
    ).toBe("fast");
    expect(slice({ kind: "inline-command", statementIndex: 2, tokenIndex: 3, part: "name" })).toBe(">");
    expect(slice({ kind: "text-id", statementIndex: 2, markerIndex: 0, part: "whole" })).toBe("|#line_id|");
    expect(slice({ kind: "text-id", statementIndex: 2, markerIndex: 0, part: "value" })).toBe("line_id");
    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, sourceSlice(source, diagnostic.span)])).toEqual([
      ["invalid-inline-command-value", "fast"],
      ["missing-local-label", "#Missing"]
    ]);
    expectCompleteSourceCoverage(source, result);
  });

  it("rejects forged source refs whose list occurrence is attached to a non-value part", () => {
    const source = "@choice Pick goto:#Missing,#Other";
    const result = parseScenario({ sourceText: source, scriptPath: "forged-ref.nani" });
    const forged = {
      kind: "command-argument",
      statementIndex: 0,
      argumentIndex: 1,
      part: "key",
      itemIndex: 0
    } as unknown as NaniSourceRef;

    expect(() => resolveNaniSourceRef(result.sourceMap, forged)).toThrow(/Unable to resolve Nani source ref/u);
    expect(() =>
      resolveNaniSourceRef(
        { ...result.sourceMap, sourceLength: Number.NaN },
        { kind: "command-name", statementIndex: 0 }
      )
    ).toThrow(/outside forged-ref\.nani/u);

    const forgedRefs = [
      { kind: "bogus", statementIndex: 0 },
      { kind: "statement", statementIndex: 0, part: "bogus" },
      { kind: "statement", statementIndex: "0", part: "whole" },
      { kind: "statement", statementIndex: 0.5, part: "whole" },
      { kind: "command-argument", statementIndex: 0, argumentIndex: "0", part: "whole" },
      { kind: "command-argument", statementIndex: 0, argumentIndex: 1, part: "value", itemIndex: -1 },
      { kind: "label-name", statementIndex: 0 },
      { kind: "text-part", statementIndex: 0, part: "whole" },
      { kind: "inline-command", statementIndex: 0, tokenIndex: 0, part: "whole" },
      { kind: "text-id", statementIndex: 0, markerIndex: 0, part: "value" }
    ] as const;
    for (const invalidRef of forgedRefs) {
      expect(() =>
        resolveNaniSourceRef(result.sourceMap, invalidRef as unknown as NaniSourceRef)
      ).toThrow(/Unable to resolve Nani source ref/u);
    }

    expect(() =>
      resolveNaniSourceRef(
        {
          ...result.sourceMap,
          statements: [
            { ...result.sourceMap.statements[0]!, kind: "bogus" as "command" }
          ]
        },
        { kind: "statement", statementIndex: 0, part: "whole" }
      )
    ).toThrow(/invalid statement kind/u);
  });

  it("keeps Unicode whitespace and repeated speaker/body text structurally distinct", () => {
    const source = "\u00a0@choice Echo\u2003goto:#Missing\nEcho.Echo: Echo [< speed:fast] Echo";
    const result = parseScenario({ sourceText: source, scriptPath: "unicode-whitespace.nani" });

    expect(result.scenario.statements).toHaveLength(2);
    expect(sourceSlice(source, resolveNaniSourceRef(result.sourceMap, {
      kind: "command-argument",
      statementIndex: 0,
      argumentIndex: 1,
      part: "value"
    }))).toBe("#Missing");
    expect(sourceSlice(source, resolveNaniSourceRef(result.sourceMap, {
      kind: "text-part",
      statementIndex: 1,
      part: "speaker"
    }))).toBe("Echo");
    expect(sourceSlice(source, resolveNaniSourceRef(result.sourceMap, {
      kind: "text-part",
      statementIndex: 1,
      part: "body"
    }))).toBe("Echo [< speed:fast] Echo");
    expectCompleteSourceCoverage(source, result);
  });

  it("uses non-empty structural anchors for diagnostics on empty syntax slots", () => {
    const source = ["#", "#", "@", "Felix: []", "Felix: |#|"].join("\n");
    const result = parseScenario({ sourceText: source, scriptPath: "empty-slots.nani" });

    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, sourceSlice(source, diagnostic.span)])).toEqual([
      ["duplicate-label", "#"],
      ["unsupported-inline-command", "["],
      ["invalid-text-id", "|#|"]
    ]);
    expect(
      sourceSlice(source, resolveNaniSourceRef(result.sourceMap, { kind: "command-name", statementIndex: 2 }))
    ).toBe("@");
    expectCompleteSourceCoverage(source, result);
  });

  it("targets the whole inline argument when its value is empty", () => {
    const source = "Felix: x [< speed:]";
    const result = parseScenario({ sourceText: source, scriptPath: "empty-inline-value.nani" });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ code: "invalid-inline-command-value" });
    expect(sourceSlice(source, result.diagnostics[0]!.span)).toBe("speed:");
    expectCompleteSourceCoverage(source, result);
  });

  it("reports command scanner diagnostics from exact quote, expression, and spacing spans", () => {
    const source = [
      '@print "😀 volume : repeated',
      "@print Hello if:{ready repeated",
      "@bgm Piano volume :0.8 repeated :0",
      "@sfx Door volume:   0.5"
    ].join("\n");
    const result = parseScenario({ sourceText: source, scriptPath: "scanner-spans.nani" });

    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, sourceSlice(source, diagnostic.span)])).toEqual([
      ["unclosed-command-quote", '"😀 volume : repeated'],
      ["unclosed-command-expression", "{ready repeated"],
      ["invalid-command-param-spacing", " "],
      ["invalid-command-param-spacing", " "],
      ["invalid-command-param-spacing", "   "]
    ]);
    expectCompleteSourceCoverage(source, result);
  });

  it.each([
    ["unsupported tag name", "Mira: <color=#f00>x</color>", "color"],
    ["unsupported attribute key", 'Mira: <b class="loud">x</b>', "class"],
    ["unsupported font attribute key", '@toast "<font onclick=\\"x\\">x</font>"', "onclick"],
    ["duplicate font attribute key", '@toast "<font color=\\"red\\" color=\\"blue\\">x</font>"', "color"],
    ["invalid font attribute value", '@toast "<font color=\\"not-a-color\\">x</font>"', "not-a-color"],
    ["malformed attribute fragment", '@toast "<font broken>x</font>"', "broken"],
    ["mismatched closing tag name", "Mira: <b>x</i>", "i"],
    ["empty closing tag name", "Mira: </>", "</>"],
    ["empty self-closing tag name", "Mira: < />", "< />"],
    ["punctuation attribute fragment", "Mira: <b =>x</b>", "="],
    ["empty quoted font value", 'Mira: <font color="">x</font>', '""'],
    ["unclosed tag tail", "Mira: <b>x", "<b>x"]
  ])("anchors rich-text diagnostic to the smallest source part: %s", (_caseName, source, expectedSlice) => {
    const result = parseScenario({ sourceText: source, scriptPath: "rich-span.nani" });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("invalid-rich-text");
    expect(sourceSlice(source, result.diagnostics[0]!.span)).toBe(expectedSlice);
    expectCompleteSourceCoverage(source, result);
  });

  it("anchors textId diagnostics to invalid values, the second marker, and the duplicate value", () => {
    const source = [
      "Felix: Empty|#|",
      "Mira: Bad|#bad id|",
      "Ren: Many|#one| then |#two|",
      "Narrator: First|#dup|",
      "Narrator: Second|#dup|"
    ].join("\n");
    const result = parseScenario({ sourceText: source, scriptPath: "text-id-spans.nani" });

    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, sourceSlice(source, diagnostic.span)])).toEqual([
      ["invalid-text-id", "|#|"],
      ["invalid-text-id", "bad id"],
      ["multiple-text-ids", "|#two|"],
      ["duplicate-text-id", "dup"]
    ]);
    expectCompleteSourceCoverage(source, result);
  });
});

function sourceSlice(source: string, span: TextSpan): string {
  return source.slice(span.start, span.end);
}

function expectCompleteSourceCoverage(source: string, result: ParseScenarioResult): void {
  expect(result.sourceMap.sourceLength).toBe(source.length);
  expect(result.sourceMap.statements).toHaveLength(result.scenario.statements.length);
  for (const diagnostic of result.diagnostics) {
    expect(Number.isInteger(diagnostic.span.start)).toBe(true);
    expect(Number.isInteger(diagnostic.span.end)).toBe(true);
    expect(diagnostic.span.start).toBeGreaterThanOrEqual(0);
    expect(diagnostic.span.end).toBeGreaterThan(diagnostic.span.start);
    expect(diagnostic.span.end).toBeLessThanOrEqual(source.length);
    expect(sourceSlice(source, diagnostic.span).length).toBeGreaterThan(0);
  }

  for (const statement of result.sourceMap.statements) {
    expectSpanWithinSource(statement.span, source);
    for (const span of [
      statement.markerSpan,
      statement.nameSpan,
      statement.speakerSpan,
      statement.appearanceSpan,
      statement.bodySpan
    ]) {
      if (span) expectSpanWithinSource(span, source);
    }
    if (statement.command) expectCommandSourceWithinSource(statement.command, source);
    for (const inline of statement.inlineCommands) expectCommandSourceWithinSource(inline.command, source);
    for (const marker of statement.textIds) {
      expectSpanWithinSource(marker.span, source);
      expectSpanWithinSource(marker.valueSpan, source);
    }
  }
  for (const ref of generatedSourceRefs(result)) {
    expectSpanWithinSource(resolveNaniSourceRef(result.sourceMap, ref), source);
  }
}

function generatedSourceRefs(result: ParseScenarioResult): NaniSourceRef[] {
  const refs: NaniSourceRef[] = [];
  for (const [statementIndex, statement] of result.sourceMap.statements.entries()) {
    refs.push({ kind: "statement", statementIndex, part: "whole" });
    if (statement.markerSpan) refs.push({ kind: "statement", statementIndex, part: "marker" });
    if (statement.nameSpan) refs.push({ kind: "statement", statementIndex, part: "name" });
    if (statement.kind === "label") refs.push({ kind: "label-name", statementIndex });
    if (statement.kind === "text") {
      refs.push({ kind: "text-part", statementIndex, part: "whole" });
      if (statement.speakerSpan) refs.push({ kind: "text-part", statementIndex, part: "speaker" });
      if (statement.appearanceSpan) refs.push({ kind: "text-part", statementIndex, part: "appearance" });
      if (statement.bodySpan) refs.push({ kind: "text-part", statementIndex, part: "body" });
      for (const inline of statement.inlineCommands) {
        refs.push(
          { kind: "inline-command", statementIndex, tokenIndex: inline.tokenIndex, part: "whole" },
          { kind: "inline-command", statementIndex, tokenIndex: inline.tokenIndex, part: "marker" },
          { kind: "inline-command", statementIndex, tokenIndex: inline.tokenIndex, part: "name" }
        );
        refs.push(...commandArgumentRefs(statementIndex, inline.command.arguments, inline.tokenIndex));
      }
      for (const markerIndex of statement.textIds.keys()) {
        refs.push(
          { kind: "text-id", statementIndex, markerIndex, part: "whole" },
          { kind: "text-id", statementIndex, markerIndex, part: "value" }
        );
      }
    }
    if (statement.kind === "command" && statement.command) {
      refs.push({ kind: "command-name", statementIndex });
      refs.push(...commandArgumentRefs(statementIndex, statement.command.arguments));
    }
  }
  return refs;
}

function commandArgumentRefs(
  statementIndex: number,
  args: readonly NaniCommandArgumentSourceMap[],
  tokenIndex?: number
): NaniSourceRef[] {
  const refs: NaniSourceRef[] = [];
  for (const [argumentIndex, argument] of args.entries()) {
    const base = tokenIndex === undefined
      ? { kind: "command-argument" as const, statementIndex, argumentIndex }
      : { kind: "inline-command-argument" as const, statementIndex, tokenIndex, argumentIndex };
    refs.push({ ...base, part: "whole" });
    if (argument.keySpan) refs.push({ ...base, part: "key" });
    if (argument.colonSpan) refs.push({ ...base, part: "colon" });
    if (argument.valueSpan) refs.push({ ...base, part: "value" });
    if (argument.flagMarkerSpan) refs.push({ ...base, part: "flag-marker" });
    for (const itemIndex of argument.itemSpans.keys()) refs.push({ ...base, part: "value", itemIndex });
  }
  return refs;
}

function expectCommandSourceWithinSource(
  command: NonNullable<ParseScenarioResult["sourceMap"]["statements"][number]["command"]>,
  source: string
): void {
  for (const span of [command.span, command.markerSpan, command.nameSpan]) expectSpanWithinSource(span, source);
  for (const argument of command.arguments) {
    expectSpanWithinSource(argument.span, source);
    for (const span of [
      argument.keySpan,
      argument.colonSpan,
      argument.valueSpan,
      argument.flagMarkerSpan,
      ...argument.itemSpans
    ]) {
      if (span) expectSpanWithinSource(span, source);
    }
  }
}

function expectSpanWithinSource(span: TextSpan, source: string): void {
  expect(Number.isInteger(span.start)).toBe(true);
  expect(Number.isInteger(span.end)).toBe(true);
  expect(span.start).toBeGreaterThanOrEqual(0);
  expect(span.end).toBeGreaterThanOrEqual(span.start);
  expect(span.end).toBeLessThanOrEqual(source.length);
}

function projectCommandArgs(args: readonly CommandArgIR[]): {
  primary?: NaniValue;
  params: Record<string, NaniValue>;
  flags: Record<string, boolean>;
} {
  let primary: NaniValue | undefined;
  const params: Record<string, NaniValue> = {};
  const flags: Record<string, boolean> = {};
  for (const arg of args) {
    if (arg.kind === "value") primary ??= arg.value;
    else if (arg.kind === "flag") flags[arg.key] = arg.value;
    else if (arg.key !== "if" && arg.key !== "unless") params[arg.key] = arg.value;
  }
  return { ...(primary ? { primary } : {}), params, flags };
}

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
