import { describe, expect, it } from "vitest";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "./index";

describe("nani runtime compiler", () => {
  it("compiles text statements into print runtime commands", () => {
    const { scenario } = parseScenario({ sourceText: "Felix: Hello.[>]", scriptPath: "text.nani" });
    const result = compileRuntimeScript(scenario);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands).toEqual([
      expect.objectContaining({
        commandId: "print",
        canonicalName: "print",
        category: "text",
        source: "v-ronpa",
        status: "implemented",
        params: { text: "Hello.", speaker: "Felix", autoNext: true }
      })
    ]);
  });

  it("normalizes visual runtime params without producing downstream command shapes", () => {
    const { scenario } = parseScenario({
      sourceText: ["@back bg:harness effect:fade", "@flash color:#fff duration:120"].join("\n"),
      scriptPath: "presentation.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands).toEqual([
      expect.objectContaining({
        commandId: "back",
        params: expect.objectContaining({ target: "MainBackground", appearance: "bg:harness", transition: "fade" })
      }),
      expect.objectContaining({
        commandId: "flash",
        params: expect.objectContaining({ color: "#fff", durationMs: 120, wait: false })
      })
    ]);
    expect(result.script.commands[0]?.params).not.toHaveProperty("backgroundId");
    expect(result.script.commands[1]?.params).not.toHaveProperty("duration");
  });

  it("normalizes shader snow params while leaving them snow-specific", () => {
    const { scenario } = parseScenario({
      sourceText: [
        "@snow power:1 density:1.5 flakeScale:1.2 xSpeed:-0.3 ySpeed:0.8 sway:0.9 fog:0.25 noise:0.02 seed:42 time:0.2 wait!",
        "@rain legacy power:1 density:1.5"
      ].join("\n"),
      scriptPath: "snow-shader.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.script.commands[0]).toEqual(
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
    expect(result.script.commands[1]?.params).not.toHaveProperty("density");
    expect(result.diagnostics).toContainEqual({
      code: "invalid-command-param",
      message: "@rain does not declare parameter density; commandCatalog is the authority.",
      severity: "warning"
    });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("normalizes shader glitch params while preserving unknown-param diagnostics", () => {
    const { scenario } = parseScenario({
      sourceText: [
        "@glitch power:1 blockJump:1.2 burstJump:0.8 pixelScatter:1.6 colorNoise:0.75 speed:1.4 seed:99 time:0.5 wait!",
        "@glitch legacy power:0.5 ghost:2"
      ].join("\n"),
      scriptPath: "glitch-shader.nani"
    });
    const result = compileRuntimeScript(scenario);

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
    expect(result.diagnostics).toContainEqual({
      code: "invalid-command-param",
      message: "@glitch does not declare parameter ghost; commandCatalog is the authority.",
      severity: "warning"
    });
  });

  it("normalizes persistent glitchFilter params while preserving unknown-param diagnostics", () => {
    const { scenario } = parseScenario({
      sourceText: [
        "@glitchFilter power:0.45 blockJump:0.5 burstJump:0.25 pixelScatter:0.75 colorNoise:0.35 speed:0.8 seed:12 time:0.3 easing:linear wait!",
        "@glitchFilter legacy power:0.5 ghost:2"
      ].join("\n"),
      scriptPath: "glitch-filter.nani"
    });
    const result = compileRuntimeScript(scenario);

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
    expect(result.diagnostics).toContainEqual({
      code: "invalid-command-param",
      message: "@glitchFilter does not declare parameter ghost; commandCatalog is the authority.",
      severity: "warning"
    });
  });

  it("normalizes aliases, defaults, flags, and labels", () => {
    const { scenario } = parseScenario({
      sourceText: [
        "#Start",
        "@back bg:flower id:Flower",
        "@char character:felix.p:felix pos:50,0",
        "@char id:* tint:#ffdc22",
        "@shake actorId:stage wait!"
      ].join("\n"),
      scriptPath: "aliases.nani"
    });
    const result = compileRuntimeScript(scenario);

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
          target: "character:felix",
          appearance: "p:felix",
          pos: [50, 0],
          lazy: false,
          wait: false
        })
      })
    );
    expect(result.script.commands[2]).toEqual(
      expect.objectContaining({
        commandId: "char",
        params: expect.objectContaining({ target: "*", tint: "#ffdc22" })
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

  it("preserves expression params in canonical fields without default fallback", () => {
    const { scenario } = parseScenario({
      sourceText: [
        "@flash color:#fff duration:{flashDuration}",
        "@shake actorId:hero power:{shakePower} time:{shakeDuration}",
        "@gameplay grant-item item:key quantity:{itemCount}"
      ].join("\n"),
      scriptPath: "expressions.nani"
    });
    const result = compileRuntimeScript(scenario);

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
    const { scenario } = parseScenario({
      sourceText: [
        "@back bg:harness if:{showBg}",
        "@choice \"Open\" goto:#Open if:{affinity>=3}",
        "@flash duration:120 unless:{flashDisabled}"
      ].join("\n"),
      scriptPath: "conditions.nani"
    });
    const result = compileRuntimeScript(scenario);

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

  it("skips error commands while preserving warning-level compiled commands", () => {
    const { scenario } = parseScenario({
      sourceText: ["@back bg:harness time:fast", "@back bg:valid time:0.5"].join("\n"),
      scriptPath: "diagnostics.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.script.commands.map((command) => command.commandId)).toEqual(["back"]);
    expect(result.diagnostics).toEqual([
      {
        code: "invalid-command-param",
        message: "@back parameter time expected decimal.",
        severity: "error"
      }
    ]);
  });

  it("reports unknown commands as errors because skipped commands must be error-level", () => {
    const { scenario } = parseScenario({
      sourceText: "@notInCatalog value",
      scriptPath: "unknown.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.script.commands).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: "unknown-command",
        message: "Unknown .nani command: @notincatalog.",
        severity: "error"
      }
    ]);
  });

  it("diagnoses declared-only Naninovel async track commands without skipping compilation", () => {
    const { scenario } = parseScenario({
      sourceText: "@async CameraPan loop!",
      scriptPath: "declared-only.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.script.commands).toHaveLength(1);
    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "async",
        status: "stubbed",
        params: expect.objectContaining({ primary: "CameraPan", loop: true })
      })
    );
    expect(result.diagnostics).toContainEqual({
      code: "declared-only-command",
      message: "@async is declared for Naninovel compatibility, but this runtime does not implement its execution boundary yet.",
      severity: "warning"
    });
  });

  it("diagnoses shake loop as an unsupported Pixi boundary instead of silently approximating it", () => {
    const { scenario } = parseScenario({
      sourceText: "@shake Camera loop! wait!",
      scriptPath: "shake-loop.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "shake",
        params: expect.objectContaining({ target: "Camera", loop: true, wait: true })
      })
    );
    expect(result.diagnostics).toContainEqual({
      code: "unsupported-command-param",
      message:
        "@shake loop! is declared by Naninovel, but this Pixi runtime does not implement indefinite loop effects in the main story track; the command is diagnosed instead of approximated.",
      severity: "warning"
    });
  });

});
