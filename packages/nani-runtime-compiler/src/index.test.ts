import { describe, expect, it } from "vitest";
import { PIXI_INNER_BACKGROUND_ID, PIXI_MAIN_BACKGROUND_ID } from "@v-ronpa/contracts";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "./index";
import { assertCommandNormalizerRegistry } from "./normalizers";
import { createArgumentDiagnostic } from "./validation";

function diagnosticSummaries(diagnostics: ReturnType<typeof compileRuntimeScript>["diagnostics"]) {
  return diagnostics.map(({ code, message, severity }) => ({ code, message, severity }));
}

describe("nani runtime compiler", () => {
  it("keeps an explicit normalizer for every implemented catalog command", () => {
    expect(assertCommandNormalizerRegistry).not.toThrow();
  });

  it("binds exclusively from ordered args even when derived IR projections disagree", () => {
    const parsed = parseScenario({
      sourceText: "@bgm Piano volume:0.5 if:{first} if:{ready} unless:{old} unless:{blocked}",
      scriptPath: "args-authority.nani"
    });
    const statement = parsed.scenario.statements[0];
    if (statement?.kind !== "command") throw new Error("Test fixture must parse as a command.");
    const result = compileRuntimeScript({
      ...parsed,
      scenario: {
        ...parsed.scenario,
        statements: [
          {
            ...statement,
            primary: { type: "string", value: "wrong" },
            params: { volume: { type: "string", value: "wrong" } },
            flags: { wait: true },
            condition: { source: "forged-condition" },
            unless: { source: "forged-unless" }
          }
        ]
      }
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands[0]?.params).toMatchObject({
      bgmPath: "Piano",
      volume: 0.5
    });
    expect(result.script.commands[0]?.params.wait).toBeUndefined();
    expect(result.script.commands[0]?.condition).toEqual({ type: "expression", source: "ready" });
    expect(result.script.commands[0]?.unless).toEqual({ type: "expression", source: "blocked" });
  });

  it("rejects missing argument provenance instead of degrading to a command range", () => {
    const parsed = parseScenario({ sourceText: "@bgm Piano volume:fast", scriptPath: "missing-origin.nani" });
    const command = parsed.scenario.statements[0];
    if (command?.kind !== "command") throw new Error("Test fixture must parse as a command.");

    expect(() =>
      createArgumentDiagnostic(
        { command, sourceMap: parsed.sourceMap, statementIndex: 0 },
        undefined,
        "value",
        "invalid-command-param",
        "missing origin",
        "error"
      )
    ).toThrow(/has no argument origin/u);
  });

  it("preserves corpus-style labels, assets, dependencies, source commands, and script output", () => {
    const sourceText = ["#Start", "@back bg:atrium", "@goto chapter2.nani#Entry"].join("\n");
    const parsed = parseScenario({ sourceText, scriptPath: "corpus-parity.nani" });
    const result = compileRuntimeScript({
      ...parsed,
      scenario: {
        ...parsed.scenario,
        dependencies: [{ endpoint: "chapter2.nani#Entry" }]
      }
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.script).toMatchObject({
      scriptPath: "corpus-parity.nani",
      labels: { Start: 0 },
      assets: [{ id: "bg:atrium", kind: "background", tags: [] }],
      dependencies: [{ endpoint: "chapter2.nani#Entry" }],
      commands: [
        {
          commandId: "back",
          params: {
            target: PIXI_MAIN_BACKGROUND_ID,
            appearance: "bg:atrium",
            lazy: false,
            wait: false
          },
          sourceCommand: {
            rawCommandId: "back",
            rawPrimary: "bg:atrium",
            rawParams: {},
            rawFlags: {}
          }
        },
        {
          commandId: "goto",
          params: { label: "chapter2.nani#Entry" },
          sourceCommand: {
            rawCommandId: "goto",
            rawPrimary: "chapter2.nani#Entry",
            rawParams: {},
            rawFlags: {}
          }
        }
      ]
    });
  });

  it("compiles text statements into print runtime commands", () => {
    const parsed = parseScenario({ sourceText: "Felix: Hello.|#voice_validation_0001|[>]\nMira: No voice.[>]", scriptPath: "text.nani" });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands).toEqual([
      expect.objectContaining({
        commandId: "print",
        canonicalName: "print",
        category: "text",
        source: "v-ronpa",
        status: "implemented",
        params: { text: "Hello.", speaker: "Felix", autoNext: true, textId: "voice_validation_0001" }
      }),
      expect.objectContaining({
        commandId: "print",
        params: { text: "No voice.", speaker: "Mira", autoNext: true }
      })
    ]);
    expect(result.script.commands.map((command) => command.commandId)).toEqual(["print", "print"]);
  });

  it("forwards inline text speed params on generic dialogue lines", () => {
    const parsed = parseScenario({
      sourceText: "Felix: A[< speed:0.8]B[>]\nMira: C[>]\nRen: Z[< speed:0]ero[>]",
      scriptPath: "text-speed.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "print",
        params: expect.objectContaining({ text: "AB", speaker: "Felix", speed: 0.8, autoNext: true })
      })
    );
    expect(result.script.commands[1]?.params).not.toHaveProperty("speed");
    expect(result.script.commands[2]?.params).toMatchObject({ text: "Zero", speaker: "Ren", speed: 0, autoNext: true });
  });

  it("compiles rich text to plain text params with top-level richText", () => {
    const parsed = parseScenario({
      sourceText: [
        'Felix: <strong>Stop</strong> <font color="red" face="font:serif">there</font>[>]',
        '@print "<em>Printed</em>" author:Narrator',
        '@append "<u> joined</u>"',
        '@choice "<mark>Inspect</mark>" goto:#Inspect',
        '@toast "<small>Saved</small>"'
      ].join("\n"),
      scriptPath: "rich-compile.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands[0]).toMatchObject({
      commandId: "print",
      params: { text: "Stop there", speaker: "Felix", autoNext: true },
      richText: {
        text: "Stop there",
        runs: [
          { start: 0, end: 4, style: { bold: true } },
          { start: 5, end: 10, style: { color: "red", fontId: "font:serif" } }
        ]
      }
    });
    expect(result.script.commands[1]).toMatchObject({ commandId: "print", params: { text: "Printed", speaker: "Narrator", autoNext: false } });
    expect(result.script.commands[1]?.richText).toMatchObject({ text: "Printed", runs: [{ start: 0, end: 7, style: { italic: true } }] });
    expect(result.script.commands[2]).toMatchObject({ commandId: "append", params: { text: " joined" } });
    expect(result.script.commands[3]).toMatchObject({ commandId: "choice", params: { text: "Inspect", goto: "#Inspect" } });
    expect(result.script.commands[4]).toMatchObject({ commandId: "toast", params: { text: "Saved" } });
  });

  it("normalizes visual runtime params without producing downstream command shapes", () => {
    const parsed = parseScenario({
      sourceText: [
        "@back bg:harness effect:fade",
        "@inback bg:framed-room effect:fade time:0.2 easing:linear wait!",
        "@flash color:#fff duration:120"
      ].join("\n"),
      scriptPath: "presentation.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands).toEqual([
      expect.objectContaining({
        commandId: "back",
        params: expect.objectContaining({ target: PIXI_MAIN_BACKGROUND_ID, appearance: "bg:harness", transition: "fade" })
      }),
      expect.objectContaining({
        commandId: "inback",
        params: expect.objectContaining({
          target: PIXI_INNER_BACKGROUND_ID,
          appearance: "bg:framed-room",
          transition: "fade",
          durationMs: 200,
          easing: "linear",
          wait: true
        })
      }),
      expect.objectContaining({
        commandId: "flash",
        params: expect.objectContaining({ color: "#fff", durationMs: 120, wait: false })
      })
    ]);
    expect(result.script.commands[0]?.params).not.toHaveProperty("backgroundId");
    expect(result.script.commands[1]?.params).not.toHaveProperty("id");
    expect(result.script.commands[2]?.params).not.toHaveProperty("duration");
  });

  it("warns on unsupported inner background transform params without adding v1 public surface", () => {
    const parsed = parseScenario({
      sourceText: "@inback bg:framed-room pos:50 scale:1.2 dissolve:fade",
      scriptPath: "inback-unsupported-params.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "inback",
        params: expect.objectContaining({
          target: PIXI_INNER_BACKGROUND_ID,
          appearance: "bg:framed-room"
        })
      })
    );
    expect(result.script.commands[0]?.params).not.toHaveProperty("pos");
    expect(result.script.commands[0]?.params).not.toHaveProperty("scale");
    expect(result.script.commands[0]?.params).not.toHaveProperty("dissolve");
    expect(diagnosticSummaries(result.diagnostics)).toEqual([
      {
        code: "invalid-command-param",
        message: "@inback does not declare parameter pos; commandCatalog is the authority.",
        severity: "warning"
      },
      {
        code: "invalid-command-param",
        message: "@inback does not declare parameter scale; commandCatalog is the authority.",
        severity: "warning"
      },
      {
        code: "invalid-command-param",
        message: "@inback does not declare parameter dissolve; commandCatalog is the authority.",
        severity: "warning"
      }
    ]);
  });

  it("normalizes shader weather params while leaving rain and snow controls separate", () => {
    const parsed = parseScenario({
      sourceText: [
        "@rain power:0.75 wind:0.4 hue:390 tint:1.2 time:0.3 easing:linear wait!",
        "@snow power:1 density:1.5 flakeScale:1.2 xSpeed:-0.3 ySpeed:0.8 sway:0.9 fog:0.25 noise:0.02 seed:42 time:0.2 wait!",
        "@rain legacy power:1 xSpeed:1 density:1.5"
      ].join("\n"),
      scriptPath: "snow-shader.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "rain",
        params: {
          kind: "rain",
          power: 0.75,
          wind: 0.4,
          hue: 390,
          tint: 1.2,
          durationMs: 300,
          easing: "linear",
          lazy: false,
          wait: true
        }
      })
    );
    expect(result.script.commands[0]?.params).not.toHaveProperty("xSpeed");
    expect(result.script.commands[0]?.params).not.toHaveProperty("rainSettings");
    expect(result.script.commands[1]).toEqual(
      expect.objectContaining({
        commandId: "snow",
        params: {
          kind: "snow",
          power: 1,
          xSpeed: -0.3,
          ySpeed: 0.8,
          density: 1.5,
          flakeScale: 1.2,
          sway: 0.9,
          fog: 0.25,
          noise: 0.02,
          seed: 42,
          durationMs: 200,
          lazy: false,
          wait: true
        }
      })
    );
    expect(result.script.commands[2]?.params).not.toHaveProperty("density");
    expect(result.script.commands[2]?.params).not.toHaveProperty("xSpeed");
    expect(diagnosticSummaries(result.diagnostics)).toContainEqual({
      code: "invalid-command-param",
      message: "@rain does not declare parameter xSpeed; commandCatalog is the authority.",
      severity: "warning"
    });
    expect(diagnosticSummaries(result.diagnostics)).toContainEqual({
      code: "invalid-command-param",
      message: "@rain does not declare parameter density; commandCatalog is the authority.",
      severity: "warning"
    });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("compiles rain power and tint showcase commands without exposing internal settings", () => {
    const parsed = parseScenario({
      sourceText: [
        "@rain power:0.2 wind:0 hue:215 tint:0.55 time:0.1",
        "@rain power:0.35 wind:0 hue:215 tint:0.55 time:0.1 easing:linear",
        "@rain power:0.5 wind:0 hue:215 tint:0.55 time:0.1",
        "@rain power:0.75 wind:0 hue:215 tint:0.55 time:0.1 easing:linear",
        "@rain power:1 wind:0 hue:215 tint:0.55 time:0.1",
        "@rain power:0.7 wind:0 hue:170 tint:1.25 time:0.1",
        "@rain power:0.7 wind:0 hue:300 tint:1.65 time:0.1",
        "@rain power:0.7 wind:0 hue:45 tint:1.65 time:0.1"
      ].join("\n"),
      scriptPath: "rain-showcase.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands.map((command) => command.commandId)).toEqual([
      "rain",
      "rain",
      "rain",
      "rain",
      "rain",
      "rain",
      "rain",
      "rain"
    ]);
    expect(result.script.commands[0]?.params).toMatchObject({ kind: "rain", power: 0.2, wind: 0, hue: 215, tint: 0.55 });
    expect(result.script.commands[1]?.params).toMatchObject({
      kind: "rain",
      power: 0.35,
      wind: 0,
      hue: 215,
      tint: 0.55,
      easing: "linear"
    });
    expect(result.script.commands[2]?.params).toMatchObject({ kind: "rain", power: 0.5, wind: 0, hue: 215, tint: 0.55 });
    expect(result.script.commands[3]?.params).toMatchObject({
      kind: "rain",
      power: 0.75,
      wind: 0,
      hue: 215,
      tint: 0.55,
      easing: "linear"
    });
    expect(result.script.commands[4]?.params).toMatchObject({ kind: "rain", power: 1, wind: 0, hue: 215, tint: 0.55 });
    expect(result.script.commands[5]?.params).toMatchObject({ kind: "rain", power: 0.7, wind: 0, hue: 170, tint: 1.25 });
    expect(result.script.commands[6]?.params).toMatchObject({ kind: "rain", power: 0.7, wind: 0, hue: 300, tint: 1.65 });
    expect(result.script.commands[7]?.params).toMatchObject({ kind: "rain", power: 0.7, wind: 0, hue: 45, tint: 1.65 });
    for (const command of result.script.commands) {
      expect(command.params).toMatchObject({ durationMs: 100, lazy: false, wait: false });
      expect(command.params).not.toHaveProperty("rainSettings");
      expect(command.params).not.toHaveProperty("xSpeed");
      expect(command.params).not.toHaveProperty("density");
    }
  });

  it("normalizes shader glitch params while preserving unknown-param diagnostics", () => {
    const parsed = parseScenario({
      sourceText: [
        "@glitch power:1 blockJump:1.2 burstJump:0.8 pixelScatter:1.6 colorNoise:0.75 speed:1.4 seed:99 time:0.5 wait!",
        "@glitch legacy power:0.5 ghost:2"
      ].join("\n"),
      scriptPath: "glitch-shader.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "glitch",
        params: {
          power: 1,
          blockJump: 1.2,
          burstJump: 0.8,
          pixelScatter: 1.6,
          colorNoise: 0.75,
          speed: 1.4,
          seed: 99,
          durationMs: 500,
          lazy: false,
          wait: true
        }
      })
    );
    expect(result.script.commands[1]?.params).not.toHaveProperty("ghost");
    expect(diagnosticSummaries(result.diagnostics)).toContainEqual({
      code: "invalid-command-param",
      message: "@glitch does not declare parameter ghost; commandCatalog is the authority.",
      severity: "warning"
    });
  });

  it("normalizes persistent glitchFilter params while preserving unknown-param diagnostics", () => {
    const parsed = parseScenario({
      sourceText: [
        "@glitchFilter power:0.45 blockJump:0.5 burstJump:0.25 pixelScatter:0.75 colorNoise:0.35 speed:0.8 seed:12 time:0.3 easing:linear wait!",
        "@glitchFilter legacy power:0.5 ghost:2"
      ].join("\n"),
      scriptPath: "glitch-filter.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "glitchfilter",
        canonicalName: "glitchFilter",
        params: {
          power: 0.45,
          blockJump: 0.5,
          burstJump: 0.25,
          pixelScatter: 0.75,
          colorNoise: 0.35,
          speed: 0.8,
          seed: 12,
          easing: "linear",
          durationMs: 300,
          lazy: false,
          wait: true
        }
      })
    );
    expect(result.script.commands[1]?.params).not.toHaveProperty("ghost");
    expect(diagnosticSummaries(result.diagnostics)).toContainEqual({
      code: "invalid-command-param",
      message: "@glitchFilter does not declare parameter ghost; commandCatalog is the authority.",
      severity: "warning"
    });
  });

  it("normalizes aliases, defaults, flags, and labels", () => {
    const parsed = parseScenario({
      sourceText: [
        "#Start",
        "@back bg:flower id:Flower",
        "@char Ema.Pensive1,ArmR3 pos:50",
        "@char Ema",
        "@shake actorId:stage wait!"
      ].join("\n"),
      scriptPath: "aliases.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.labels).toEqual({ Start: 0 });
    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "back",
        params: expect.objectContaining({
          target: "Flower",
          appearance: "bg:flower"
        })
      })
    );
    expect(result.script.commands[1]).toEqual(
      expect.objectContaining({
        commandId: "char",
        params: expect.objectContaining({
          target: "Ema",
          appearanceExpression: "Pensive1,ArmR3",
          pos: [50, 0],
          lazy: false,
          wait: false
        })
      })
    );
    expect(result.script.commands[2]).toEqual(
      expect.objectContaining({
        commandId: "char",
        params: expect.objectContaining({ target: "Ema", appearanceExpression: "" })
      })
    );
    expect(result.script.commands[3]).toEqual(
      expect.objectContaining({
        commandId: "shake",
        params: expect.objectContaining({ target: "stage", power: 0.5, wait: true })
      })
    );
    expect(result.script.commands[3]?.params).not.toHaveProperty("actorId");
    expect(result.script.commands[3]?.params).not.toHaveProperty("intensity");
  });

  it("owns the layered-character transition default without changing shared timing commands", () => {
    const parsed = parseScenario({
      sourceText: [
        "@char Ema.Pensive1 wait!",
        "@char Ema.Pensive2 time:0 wait!",
        "@char Ema.Pensive3 time:0.3",
        "@char Ema.Pensive4 time:{tokenSeconds}",
        "@slide Ema.Pensive5 from:50,0 to:50,0"
      ].join("\n"),
      scriptPath: "char-transition-default.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands.slice(0, 4).map((command) => command.params.durationMs)).toEqual([
      120,
      0,
      300,
      { type: "expression", source: "(tokenSeconds)*1000" }
    ]);
    expect(result.script.commands[0]?.params).toMatchObject({ wait: true, durationMs: 120 });
    expect(result.script.commands[4]?.params).not.toHaveProperty("durationMs");
  });

  it("does not treat legacy char appearance params as layered expressions", () => {
    const parsed = parseScenario({
      sourceText: "@char Ema appearance:LegacyPortrait",
      scriptPath: "char-appearance-param.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "char",
        params: expect.objectContaining({ target: "Ema", appearanceExpression: "" })
      })
    );
    expect(diagnosticSummaries(result.diagnostics)).toContainEqual({
      code: "unsupported-command-param",
      message: "@char accepts appearance:string, but the current runtime compiler does not consume it yet.",
      severity: "warning"
    });
  });

  it("does not accept comma-only character appearance as a second layered syntax", () => {
    const parsed = parseScenario({
      sourceText: ["@char Ema,ArmR3 pos:50", "@slide Ema,ArmR3 from:30,0 to:50,0"].join("\n"),
      scriptPath: "comma-only-character-expression.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "char",
        params: expect.objectContaining({ target: "Ema", appearanceExpression: "", pos: [50, 0] })
      })
    );
    expect(result.script.commands[1]).toEqual(
      expect.objectContaining({
        commandId: "slide",
        params: expect.not.objectContaining({ appearanceExpression: "ArmR3" })
      })
    );
    expect(result.script.commands[1]?.params).toMatchObject({ target: "Ema", from: [30, 0], to: [50, 0] });
  });

  it("preserves expression params in canonical fields without default fallback", () => {
    const parsed = parseScenario({
      sourceText: [
        "@flash color:#fff duration:{flashDuration}",
        "@shake actorId:hero power:{shakePower} time:{shakeDuration}",
        "@gameplay grant-item item:key quantity:{itemCount}"
      ].join("\n"),
      scriptPath: "expressions.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.script.commands[0]?.params).toEqual({
      color: "#fff",
      durationMs: { type: "expression", source: "flashDuration" },
      wait: false
    });
    expect(result.script.commands[1]?.params).toEqual({
      target: "hero",
      power: { type: "expression", source: "shakePower" },
      durationMs: { type: "expression", source: "(shakeDuration)*1000" },
      wait: false
    });
    expect(result.script.commands[2]?.params).toEqual({
      type: "grant-item",
      quantity: { type: "expression", source: "itemCount" },
      itemId: "key",
      affinityDelta: 0
    });
    expect(result.script.commands[2]?.params).not.toHaveProperty("item");
    expect(result.script.commands[2]?.sourceCommand?.rawParams).toMatchObject({
      item: "key",
      quantity: { expression: "itemCount" }
    });
  });

  it("compiles command conditions and unless expressions onto runtime commands", () => {
    const parsed = parseScenario({
      sourceText: [
        "@back bg:harness if:{showBg}",
        "@choice \"Open\" goto:#Open if:{affinity>=3}",
        "@flash duration:120 unless:{flashDisabled}"
      ].join("\n"),
      scriptPath: "conditions.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "back",
        condition: { type: "expression", source: "showBg" },
        params: expect.objectContaining({ appearance: "bg:harness" }),
        sourceCommand: expect.objectContaining({
          rawPrimary: "bg:harness",
          rawParams: {}
        })
      })
    );
    expect(result.script.commands[1]).toEqual(
      expect.objectContaining({
        commandId: "choice",
        condition: { type: "expression", source: "affinity>=3" }
      })
    );
    expect(result.script.commands[2]).toEqual(
      expect.objectContaining({
        commandId: "flash",
        unless: { type: "expression", source: "flashDisabled" }
      })
    );
  });

  it("binds identical command diagnostics to each statement's exact value span", () => {
    const sourceText = ["@back bg:harness time:fast", "@back bg:harness time:fast"].join("\n");
    const parsed = parseScenario({ sourceText, scriptPath: "duplicate-diagnostics.nani" });
    const result = compileRuntimeScript(parsed);

    expect(
      result.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        loc: diagnostic.loc,
        span: diagnostic.span,
        slice: sourceText.slice(diagnostic.span.start, diagnostic.span.end)
      }))
    ).toEqual([
      {
        code: "invalid-command-param",
        loc: {
          scriptPath: "duplicate-diagnostics.nani",
          line: 1,
          column: 1,
          raw: "@back bg:harness time:fast"
        },
        span: { start: 22, end: 26 },
        slice: "fast"
      },
      {
        code: "invalid-command-param",
        loc: {
          scriptPath: "duplicate-diagnostics.nani",
          line: 2,
          column: 1,
          raw: "@back bg:harness time:fast"
        },
        span: { start: 49, end: 53 },
        slice: "fast"
      }
    ]);
  });

  it("uses the last identical argument origin and keeps labels stable after a rejected command", () => {
    const sourceText = [
      "@bgm Piano volume:bad volume:bad",
      "#AfterRejected",
      "@end"
    ].join("\n");
    const result = compileRuntimeScript(
      parseScenario({ sourceText, scriptPath: "last-write-origin.nani" })
    );

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ code: "invalid-command-param", severity: "error" });
    expect(result.diagnostics[0]?.span.start).toBe(sourceText.lastIndexOf("bad"));
    expect(sourceText.slice(result.diagnostics[0]?.span.start, result.diagnostics[0]?.span.end)).toBe("bad");
    expect(result.script.labels).toEqual({ AfterRejected: 0 });
    expect(result.script.commands.map((command) => command.commandId)).toEqual(["end"]);
  });

  it("targets the first incompatible list item instead of the whole parameter value", () => {
    const sourceText = "@back bg:harness pos:1,bad,2";
    const parsed = parseScenario({ sourceText, scriptPath: "list-item-span.nani" });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "invalid-command-param",
      span: { start: 23, end: 26 }
    });
    expect(sourceText.slice(result.diagnostics[0]?.span.start, result.diagnostics[0]?.span.end)).toBe("bad");
  });

  it("targets each complete undeclared parameter or flag argument", () => {
    const sourceText = "@glitch value ghost:1 ghost!";
    const result = compileRuntimeScript(
      parseScenario({ sourceText, scriptPath: "undeclared-argument-span.nani" })
    );

    expect(result.diagnostics.map(({ span }) => sourceText.slice(span.start, span.end))).toEqual([
      "ghost:1",
      "ghost!"
    ]);
  });

  it("falls back from empty list items, values, and command names to visible anchors", () => {
    const listSource = "@back bg:harness pos:1,,2";
    const listResult = compileRuntimeScript(
      parseScenario({ sourceText: listSource, scriptPath: "empty-list-item-span.nani" })
    );
    expect(listResult.diagnostics[0]).toMatchObject({
      code: "invalid-command-param",
      span: { start: 23, end: 24 }
    });
    expect(listSource.slice(listResult.diagnostics[0]?.span.start, listResult.diagnostics[0]?.span.end)).toBe(",");

    const valueSource = "@back bg:harness time:";
    const valueResult = compileRuntimeScript(
      parseScenario({ sourceText: valueSource, scriptPath: "empty-value-span.nani" })
    );
    expect(valueResult.diagnostics[0]).toMatchObject({
      code: "invalid-command-param",
      span: { start: 17, end: 22 }
    });
    expect(valueSource.slice(valueResult.diagnostics[0]?.span.start, valueResult.diagnostics[0]?.span.end)).toBe("time:");

    const commandSource = "@";
    const commandResult = compileRuntimeScript(
      parseScenario({ sourceText: commandSource, scriptPath: "empty-command-name-span.nani" })
    );
    expect(commandResult.diagnostics[0]).toMatchObject({
      code: "unknown-command",
      span: { start: 0, end: 1 }
    });
    expect(commandSource.slice(commandResult.diagnostics[0]?.span.start, commandResult.diagnostics[0]?.span.end)).toBe("@");
  });

  it("keeps migrated ignored-primary diagnostics after validation errors with exact argument spans", () => {
    const sourceText = "@flash time:0.05 duration:bad";
    const parsed = parseScenario({ sourceText, scriptPath: "ignored-primary-span.nani" });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "invalid-command-param",
      "ignored-promoted-primary"
    ]);
    expect(result.diagnostics[0]?.span).toEqual({ start: 26, end: 29 });
    expect(result.diagnostics[1]).toMatchObject({
      severity: "warning",
      loc: {
        scriptPath: "ignored-primary-span.nani",
        line: 1,
        column: 1,
        raw: sourceText
      },
      span: { start: 7, end: 16 }
    });
    expect(sourceText.slice(result.diagnostics[1]?.span.start, result.diagnostics[1]?.span.end)).toBe("time:0.05");
  });

  it("appends migrated semantic warnings after all existing compiler diagnostics", () => {
    const sourceText = ["@flash bogus:1", "@back bg:harness time:fast"].join("\n");
    const result = compileRuntimeScript(
      parseScenario({ sourceText, scriptPath: "migrated-warning-order.nani" })
    );

    expect(result.diagnostics.map(({ code, loc }) => [code, loc.line])).toEqual([
      ["invalid-command-param", 2],
      ["ignored-promoted-primary", 1]
    ]);
  });

  it("locates an invalid middle UI target even when catalog validation skips compilation", () => {
    const sourceText = "@showUI uINames:dialog,inventory,toastLayer time:fast";
    const parsed = parseScenario({ sourceText, scriptPath: "ui-list-span.nani" });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands).toEqual([]);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "invalid-command-param",
      "unsupported-ui-target"
    ]);
    const uiDiagnostic = result.diagnostics[1];
    expect(uiDiagnostic).toMatchObject({
      severity: "warning",
      loc: {
        scriptPath: "ui-list-span.nani",
        line: 1,
        column: 1,
        raw: sourceText
      },
      span: { start: 23, end: 32 }
    });
    expect(sourceText.slice(uiDiagnostic?.span.start, uiDiagnostic?.span.end)).toBe("inventory");
  });

  it("trims quoted UI list-item spans without changing the bound target", () => {
    const sourceText = '@showUI uINames:"dialog, inventory,toastLayer"';
    const result = compileRuntimeScript(
      parseScenario({ sourceText, scriptPath: "ui-list-whitespace.nani" })
    );

    const diagnostic = result.diagnostics.find(({ code }) => code === "unsupported-ui-target");
    expect(diagnostic).toBeDefined();
    expect(sourceText.slice(diagnostic?.span.start, diagnostic?.span.end)).toBe("inventory");
  });

  it("propagates corrupt source-map invariants instead of guessing a diagnostic range", () => {
    const parsed = parseScenario({
      sourceText: "@back bg:harness time:fast",
      scriptPath: "corrupt-source-map.nani"
    });
    const statement = parsed.sourceMap.statements[0];
    if (!statement?.command) throw new Error("Test fixture must contain a mapped command.");
    const commandSource = statement.command;

    expect(() =>
      compileRuntimeScript({
        scenario: parsed.scenario,
        sourceMap: {
          ...parsed.sourceMap,
          statements: [
            {
              ...statement,
              command: { ...commandSource, arguments: [] }
            }
          ]
        }
      })
    ).toThrow(/Unable to resolve Nani source ref/u);
  });

  it("skips error commands while preserving warning-level compiled commands", () => {
    const parsed = parseScenario({
      sourceText: ["@back bg:harness time:fast", "@back bg:valid time:0.5"].join("\n"),
      scriptPath: "diagnostics.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands.map((command) => command.commandId)).toEqual(["back"]);
    expect(diagnosticSummaries(result.diagnostics)).toEqual([
      {
        code: "invalid-command-param",
        message: "@back parameter time expected decimal.",
        severity: "error"
      }
    ]);
  });

  it("reports unknown commands as errors because skipped commands must be error-level", () => {
    const parsed = parseScenario({
      sourceText: "@notInCatalog value",
      scriptPath: "unknown.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands).toEqual([]);
    expect(diagnosticSummaries(result.diagnostics)).toEqual([
      {
        code: "unknown-command",
        message: "Unknown .nani command: @notincatalog.",
        severity: "error"
      }
    ]);
  });

  it("diagnoses only @set parameters that its selected dynamic assignment does not consume", () => {
    const sourceText = [
      "@set expression:value",
      "@set primary expression:value",
      "@set foo:1 expression:value",
      "@set foo:1"
    ].join("\n");
    const result = compileRuntimeScript(
      parseScenario({ sourceText, scriptPath: "set-consumption.nani" })
    );

    expect(result.script.commands).toHaveLength(4);
    expect(result.diagnostics.map(({ code, loc, span }) => ({
      code,
      line: loc.line,
      slice: sourceText.slice(span.start, span.end)
    }))).toEqual([
      { code: "unsupported-command-param", line: 2, slice: "expression:value" },
      { code: "unsupported-command-param", line: 3, slice: "expression:value" }
    ]);
  });

  it("diagnoses declared-only Naninovel async track commands without skipping compilation", () => {
    const parsed = parseScenario({
      sourceText: "@async CameraPan loop!",
      scriptPath: "declared-only.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands).toHaveLength(1);
    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "async",
        status: "stubbed",
        params: expect.objectContaining({ primary: "CameraPan", loop: true })
      })
    );
    expect(diagnosticSummaries(result.diagnostics)).toContainEqual({
      code: "declared-only-command",
      message: "@async is declared for Naninovel compatibility, but this runtime does not implement its execution boundary yet.",
      severity: "warning"
    });
  });

  it("keeps @format on its explicit declared-only normalizer", () => {
    const result = compileRuntimeScript(
      parseScenario({
        sourceText: "@format bold,italic printer:dialog",
        scriptPath: "format-stub.nani"
      })
    );

    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "format",
        status: "stubbed",
        params: { templates: ["bold", "italic"], printerId: "dialog" }
      })
    );
    expect(diagnosticSummaries(result.diagnostics)).toEqual([
      {
        code: "declared-only-command",
        message: "@format is declared for Naninovel compatibility, but this runtime does not implement its execution boundary yet.",
        severity: "warning"
      }
    ]);
  });

  it("diagnoses catalog-external params without consuming them through legacy normalizer fallbacks", () => {
    const cases = [
      { source: '@append "x" speaker:Felix', absentParam: "speaker" },
      { source: '@print "x" autoNext:true', absentParam: "autoNext", expectedValue: false },
      { source: "@trialKeyword kw text:x evidenceId:e1", absentParam: "evidenceId" }
    ] as const;

    for (const testCase of cases) {
      const result = compileRuntimeScript(
        parseScenario({ sourceText: testCase.source, scriptPath: "catalog-authority.nani" })
      );
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "invalid-command-param",
          message: expect.stringContaining("commandCatalog is the authority")
        })
      );
      if ("expectedValue" in testCase) {
        expect(result.script.commands[0]?.params[testCase.absentParam]).toBe(testCase.expectedValue);
      } else {
        expect(result.script.commands[0]?.params).not.toHaveProperty(testCase.absentParam);
      }
    }
  });

  it("keeps explicit voice commands declared-only while textId dialogue audio stays app-derived", () => {
    const parsed = parseScenario({
      sourceText: "@voice voice:zh:voice_validation_0001 volume:0.5\n@stopVoice",
      scriptPath: "explicit-voice-declared-only.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands).toEqual([
      expect.objectContaining({
        commandId: "voice",
        status: "stubbed",
        params: expect.objectContaining({
          primary: "voice:zh:voice_validation_0001",
          volume: 0.5
        })
      }),
      expect.objectContaining({
        commandId: "stopvoice",
        status: "stubbed",
        params: {}
      })
    ]);
    expect(diagnosticSummaries(result.diagnostics)).toEqual([
      {
        code: "declared-only-command",
        message: "@voice is declared for Naninovel compatibility, but this runtime does not implement its execution boundary yet.",
        severity: "warning"
      },
      {
        code: "declared-only-command",
        message: "@stopVoice is declared for Naninovel compatibility, but this runtime does not implement its execution boundary yet.",
        severity: "warning"
      }
    ]);
  });

  it("diagnoses shake loop as an unsupported Pixi boundary instead of silently approximating it", () => {
    const parsed = parseScenario({
      sourceText: "@shake Camera loop! wait!",
      scriptPath: "shake-loop.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "shake",
        params: expect.objectContaining({ target: "Camera", loop: true, wait: true })
      })
    );
    expect(diagnosticSummaries(result.diagnostics)).toContainEqual({
      code: "unsupported-command-param",
      message:
        "@shake loop! is declared by Naninovel, but this Pixi runtime does not implement indefinite loop effects in the main story track; the command is diagnosed instead of approximated.",
      severity: "warning"
    });
  });

  it("normalizes non-Pixi text, UI, wait, input, media, and movie commands", () => {
    const parsed = parseScenario({
      sourceText: [
        "@append \" continued\"",
        "@resetText default",
        "@clearBacklog",
        "@showPrinter default time:0.2",
        "@showUI dialog time:0.1",
        "@hideUI commandBar time:0.1",
        "@toast \"Saved\" appearance:info time:1.5",
        "@wait i5",
        "@input playerName type:string summary:\"Name?\" value:Felix",
        "@bgm bgm:validation-main group:music volume:0.45 fade:0.2",
        "@sfx sfx:rain-inside-car-loop group:rain loop! volume:0.35",
        "@sfxFast sfx:shock-fadeout group:shock volume:0.75",
        "@stopSfx group:rain fade:0.2",
        "@stopBgm group:music fade:0.5",
        "@movie video:validation-intro block!"
      ].join("\n"),
      scriptPath: "non-pixi.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands.map((command) => command.commandId)).toEqual([
      "append",
      "resettext",
      "clearbacklog",
      "showprinter",
      "showui",
      "hideui",
      "toast",
      "wait",
      "input",
      "bgm",
      "sfx",
      "sfxfast",
      "stopsfx",
      "stopbgm",
      "movie"
    ]);
    expect(result.script.commands[3]?.params).toMatchObject({ printerId: "default", durationMs: 200 });
    expect(result.script.commands[4]?.params).toMatchObject({ target: "dialog", visible: true, durationMs: 100, wait: false });
    expect(result.script.commands[5]?.params).toMatchObject({ target: "commandBar", visible: false, durationMs: 100, wait: false });
    expect(result.script.commands[7]?.params).toEqual({ waitMode: "i5" });
    expect(result.script.commands[8]?.params).toEqual({
      variableName: "playerName",
      valueType: "string",
      summary: "Name?",
      defaultValue: "Felix"
    });
    expect(result.script.commands[9]?.params).toMatchObject({
      bgmPath: "bgm:validation-main",
      group: "music",
      volume: 0.45,
      fadeMs: 200
    });
    expect(result.script.commands[10]?.params).toMatchObject({
      sfxPath: "sfx:rain-inside-car-loop",
      group: "rain",
      loop: true,
      volume: 0.35
    });
    expect(result.script.commands[14]?.params).toEqual({
      moviePath: "video:validation-intro",
      block: true
    });
  });

  it("leaves no-target showUI and hideUI as scoped runtime UI commands", () => {
    const parsed = parseScenario({
      sourceText: ["@hideUI", "@showUI"].join("\n"),
      scriptPath: "ui-no-target.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands.map((command) => command.commandId)).toEqual(["hideui", "showui"]);
    expect(result.script.commands[0]?.params).toEqual({ visible: false, wait: false });
    expect(result.script.commands[1]?.params).toEqual({ visible: true, wait: false });
  });

  it("diagnoses unsupported media wait and advanced input/UI/sfxFast params", () => {
    const parsed = parseScenario({
      sourceText: [
        "@bgm bgm:validation-main loop:false wait!",
        "@input playerName nostop!",
        "@hideUI commandBar wait! allowToggle!",
        "@sfxFast beep restart! additive! wait!"
      ].join("\n"),
      scriptPath: "unsupported-non-pixi.nani"
    });
    const result = compileRuntimeScript(parsed);

    expect(result.script.commands.map((command) => command.commandId)).toEqual(["bgm", "input", "hideui", "sfxfast"]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported-command-param",
          message: expect.stringContaining("@bgm accepts wait!:boolean")
        }),
        expect.objectContaining({
          code: "unsupported-command-param",
          message: expect.stringContaining("@bgm accepts loop:boolean")
        }),
        expect.objectContaining({
          code: "unsupported-command-param",
          message: expect.stringContaining("@input accepts nostop!:boolean")
        }),
        expect.objectContaining({
          code: "unsupported-command-param",
          message: expect.stringContaining("@hideUI accepts allowToggle!:boolean")
        }),
        expect.objectContaining({
          code: "unsupported-command-param",
          message: expect.stringContaining("@sfxFast accepts restart!:boolean")
        }),
        expect.objectContaining({
          code: "unsupported-command-param",
          message: expect.stringContaining("@sfxFast accepts additive!:boolean")
        })
      ])
    );
    expect(result.script.commands[0]?.params).not.toHaveProperty("loop");
    expect(result.script.commands[2]?.params).toMatchObject({ target: "commandBar", visible: false, wait: true });
  });

});
