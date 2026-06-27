import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, NaniCommandSource, NaniCommandStatus, RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import {
  createInitialPixiStageSnapshot,
  createPixiPresenter,
  reducePixiRuntimeCommand
} from "./index";

describe("pixi presenter port", () => {
  it("queues snapshot reconciliation before mount without requiring Pixi memory behavior", () => {
    const host = {
      clientWidth: 960,
      clientHeight: 540,
      appendChild() {
        throw new Error("mount should not be required for memory behavior");
      }
    } as unknown as HTMLElement;
    const presenter = createPixiPresenter({ host });

    expect(() => presenter.reconcile(createInitialPixiStageSnapshot())).not.toThrow();
    expect(() => presenter.clear()).not.toThrow();
  });

  it("reduces persistent VN commands into a terminal Pixi stage snapshot", () => {
    const initial = createInitialPixiStageSnapshot();
    const withBackground = reducePixiRuntimeCommand(initial, runtimeCommand("back", "scene", { appearance: "bg:harness" }));
    const withCharacter = reducePixiRuntimeCommand(
      withBackground.snapshot,
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1,ArmR3",
        pos: [50, 0]
      })
    );

    expect(withBackground).toMatchObject({
      snapshot: {
        version: 3,
        revision: 1,
        backgroundsById: {
          MainBackground: { id: "MainBackground", kind: "background", appearance: "bg:harness", visible: true }
        },
        actorOrder: ["MainBackground"]
      },
      hints: [],
      diagnostics: []
    });
    expect(withBackground.snapshot).not.toHaveProperty("background");
    expect(withCharacter.snapshot).toMatchObject({
      version: 3,
      revision: 2,
      backgroundsById: {
        MainBackground: { id: "MainBackground", kind: "background", appearance: "bg:harness" }
      },
      charactersById: {
        Ema: {
          id: "Ema",
          kind: "character",
          appearanceExpression: "Pensive1,ArmR3",
          pos: [0.5, 0],
          visible: true
        }
      },
      actorOrder: ["MainBackground", "Ema"]
    });
    expect(withCharacter.snapshot).not.toHaveProperty("background");
    expect(withCharacter.snapshot).not.toHaveProperty("slots");
    expect(withCharacter.hints).toEqual([]);
    expect(withCharacter.diagnostics).toEqual([]);
  });

  it("keeps transient Pixi runtime commands out of the saveable stage snapshot", () => {
    const initial = createInitialPixiStageSnapshot();
    const flash = runtimeCommand("flash", "effect", { color: "#ffffff", duration: 160 });
    const keyword = runtimeCommand("trialkeyword", "ui", {
      keywordId: "kw:door",
      text: "locked",
      evidenceId: "evidence:keycard"
    });

    expect(reducePixiRuntimeCommand(initial, flash)).toEqual({
      snapshot: initial,
      hints: [{ type: "flash", color: "#ffffff", durationMs: 160, wait: false }],
      waitTasks: [],
      diagnostics: []
    });
    expect(reducePixiRuntimeCommand(initial, keyword)).toEqual({
      snapshot: initial,
      hints: [{ type: "trial-keyword", keywordId: "kw:door", text: "locked", evidenceId: "evidence:keycard" }],
      waitTasks: [],
      diagnostics: []
    });
  });

  it("diagnoses unsupported Pixi-routed runtime commands without changing the snapshot", () => {
    const initial = createInitialPixiStageSnapshot();

    expect(reducePixiRuntimeCommand(initial, runtimeCommand("focus", "effect", { target: "stage", duration: 500 }))).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unsupported-pixi-command",
          commandId: "focus",
          message: "@focus is routed to Pixi but is not consumed by pixi-presenter yet."
        }
      ]
    });
  });

  it("diagnoses unsupported Pixi params without writing fallback stage ids", () => {
    const initial = createInitialPixiStageSnapshot();

    expect(reducePixiRuntimeCommand(initial, runtimeCommand("back", "scene", {}))).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unsupported-pixi-params",
          commandId: "back",
          message: "@back is routed to Pixi but cannot be consumed: missing required params: appearance."
        }
      ]
    });
    expect(
      reducePixiRuntimeCommand(initial, runtimeCommand("slide", "actor", { target: "Missing", to: [50, 0] }))
    ).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unsupported-pixi-params",
          commandId: "slide",
          message: "@slide is routed to Pixi but cannot be consumed: unknown actor target: Missing."
        }
      ]
    });
  });

  it("diagnoses unresolved runtime expressions without falling back to default visual params", () => {
    const initial = createInitialPixiStageSnapshot();

    expect(
      reducePixiRuntimeCommand(
        initial,
        runtimeCommand("flash", "effect", {
          color: "#ffffff",
          duration: { type: "expression", source: "flashDuration" }
        })
      )
    ).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unresolved-runtime-expression",
          commandId: "flash",
          message: "@flash contains unresolved expression params; Pixi requires resolved runtime values."
        }
      ]
    });
  });

  it("updates layered character expressions independently and preserves unrelated stage state", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "Ren",
        appearanceExpression: "Default",
        pos: [24, 0]
      })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1",
        pos: [50, 0]
      })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "Mira",
        appearanceExpression: "Default",
        pos: [76, 0]
      })
    ).snapshot;
    const replacedCenter = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1,ArmR3"
      })
    ).snapshot;

    expect(replacedCenter).toMatchObject({
      version: 3,
      revision: 5,
      charactersById: {
        Ren: {
          id: "Ren",
          appearanceExpression: "Default",
          pos: [0.24, 0]
        },
        Ema: {
          id: "Ema",
          appearanceExpression: "Pensive1,ArmR3",
          pos: [0.5, 0]
        },
        Mira: {
          id: "Mira",
          appearanceExpression: "Default",
          pos: [0.76, 0]
        }
      },
      actorOrder: ["MainBackground", "Ren", "Ema", "Mira"]
    });
    expect(replacedCenter).not.toHaveProperty("background");
    expect(replacedCenter).not.toHaveProperty("slots");
  });

  it("uses command-count revision semantics for repeated persistent commands", () => {
    const first = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    const second = reducePixiRuntimeCommand(first, runtimeCommand("back", "scene", { appearance: "bg:harness" })).snapshot;

    expect(second).toMatchObject({
      version: 3,
      revision: 2,
      backgroundsById: {
        MainBackground: { id: "MainBackground", kind: "background", appearance: "bg:harness" }
      }
    });
    expect(second).not.toHaveProperty("background");
  });

  it("applies wildcard character commands to visible actors instead of creating a literal star actor", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("char", "actor", { target: "Ren", appearanceExpression: "Default", pos: [24, 0] })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", { target: "Mira", appearanceExpression: "Default", pos: [76, 0] })
    ).snapshot;

    const tinted = reducePixiRuntimeCommand(stage, runtimeCommand("char", "actor", { target: "*", tint: "#ffdc22" })).snapshot;

    expect(tinted.charactersById).not.toHaveProperty("*");
    expect(tinted.charactersById.Ren).toMatchObject({ tint: "#ffdc22", pos: [0.24, 0], appearanceExpression: "" });
    expect(tinted.charactersById.Mira).toMatchObject({ tint: "#ffdc22", pos: [0.76, 0], appearanceExpression: "" });
  });

  it("stores explicitly targeted background actors without legacy compatibility fields", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { target: "MainBackground", appearance: "bg:harness" })
    ).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("back", "scene", { target: "Flower", appearance: "Bloomed" })).snapshot;

    expect(stage.backgroundsById).toMatchObject({
      MainBackground: { id: "MainBackground", appearance: "bg:harness" },
      Flower: { id: "Flower", appearance: "Bloomed" }
    });
    expect(stage).not.toHaveProperty("background");
    expect(stage.actorOrder).toEqual(["MainBackground", "Flower"]);
  });

  it("uses official scene-percent positions for slide and stores from/to transition metadata", () => {
    const stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1",
        pos: [50, 0],
        visible: false
      })
    ).snapshot;
    const slid = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("slide", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1,ArmR3",
        from: [15, 50],
        to: [85, 0],
        durationMs: 500
      })
    ).snapshot;

    expect(slid.charactersById.Ema).toMatchObject({
      appearanceExpression: "Pensive1,ArmR3",
      visible: true,
      pos: [0.85, 0],
      transition: {
        name: "slide",
        durationMs: 500,
        from: [0.15, 0.5],
        to: [0.85, 0]
      }
    });
  });

  it("returns wait task descriptors for waitable Pixi presentation commands", () => {
    const withActor = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1",
        durationMs: 400,
        wait: true
      })
    );
    expect(withActor.waitTasks).toEqual([
      { kind: "actor-transition", target: "Ema", revision: withActor.snapshot.revision }
    ]);

    const flash = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("flash", "effect", { color: "#ffffff", durationMs: 120, wait: true })
    );
    expect(flash.waitTasks).toEqual([{ kind: "flash", target: "screen", revision: withActor.snapshot.revision }]);

    const glitch = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("glitch", "effect", {
        power: 0.8,
        durationMs: 240,
        blockJump: 1.2,
        burstJump: 0.7,
        pixelScatter: 1.4,
        colorNoise: 0.6,
        speed: 1.25,
        seed: 21,
        wait: true
      })
    );
    expect(glitch.hints).toEqual([
      {
        type: "glitch",
        power: 0.8,
        durationMs: 240,
        blockJump: 1.2,
        burstJump: 0.7,
        pixelScatter: 1.4,
        colorNoise: 0.6,
        speed: 1.25,
        seed: 21,
        wait: true
      }
    ]);
    expect(glitch.snapshot).toBe(withActor.snapshot);
    expect(glitch.waitTasks).toEqual([{ kind: "glitch", target: "screen", revision: withActor.snapshot.revision }]);

    const glitchFilter = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("glitchfilter", "effect", {
        power: 0.45,
        durationMs: 300,
        easing: "linear",
        blockJump: 0.5,
        burstJump: 0.25,
        pixelScatter: 0.75,
        colorNoise: 0.35,
        speed: 0.8,
        seed: 12,
        wait: true
      })
    );
    expect(glitchFilter.snapshot.screenFilters.glitch).toMatchObject({
      power: 0.45,
      blockJump: 0.5,
      burstJump: 0.25,
      pixelScatter: 0.75,
      colorNoise: 0.35,
      speed: 0.8,
      seed: 12,
      transition: { durationMs: 300, easing: "linear", lazy: false, wait: true }
    });
    expect(glitchFilter.hints).toEqual([]);
    expect(glitchFilter.waitTasks).toEqual([{ kind: "screen-filter-transition", target: "glitch", revision: glitchFilter.snapshot.revision }]);

    const glitchFilterOff = reducePixiRuntimeCommand(
      glitchFilter.snapshot,
      runtimeCommand("glitchfilter", "effect", { power: 0, durationMs: 200, easing: "linear", wait: true })
    );
    expect(glitchFilterOff.snapshot.screenFilters).not.toHaveProperty("glitch");
    expect(glitchFilterOff.hints).toEqual([{ type: "screen-filter-remove", kind: "glitch", durationMs: 200, easing: "linear", wait: true }]);
    expect(glitchFilterOff.waitTasks).toEqual([{ kind: "screen-filter-transition", target: "glitch", revision: glitchFilterOff.snapshot.revision }]);

    const rain = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("rain", "effect", { power: 0.6, durationMs: 300, wait: true })
    );
    expect(rain.waitTasks).toEqual([{ kind: "weather-transition", target: "rain", revision: rain.snapshot.revision }]);

    const rainOff = reducePixiRuntimeCommand(
      rain.snapshot,
      runtimeCommand("rain", "effect", { power: 0, durationMs: 300, wait: true })
    );
    expect(rainOff.snapshot.weather).not.toHaveProperty("rain");
    expect(rainOff.hints).toEqual([{ type: "weather-remove", kind: "rain", durationMs: 300, wait: true }]);
    expect(rainOff.waitTasks).toEqual([{ kind: "weather-transition", target: "rain", revision: rainOff.snapshot.revision }]);

    const inactiveWeatherOff = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("snow", "effect", { power: 0, durationMs: 300, wait: true })
    );
    expect(inactiveWeatherOff.hints).toEqual([]);
    expect(inactiveWeatherOff.waitTasks).toEqual([]);

    const inactiveBokehOff = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("bokeh", "effect", { power: 0, durationMs: 300, wait: true })
    );
    expect(inactiveBokehOff.waitTasks).toEqual([]);
  });

  it("diagnoses unsupported loop shake instead of creating a finite approximation", () => {
    const initial = createInitialPixiStageSnapshot();

    expect(reducePixiRuntimeCommand(initial, runtimeCommand("shake", "effect", { target: "stage", loop: true, wait: true }))).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unsupported-pixi-params",
          commandId: "shake",
          message:
            "@shake is routed to Pixi but cannot be consumed: @shake loop! is not implemented by this Pixi runtime; disable loop or issue a finite shake."
        }
      ]
    });
  });

  it("removes zero-power blur, bokeh, and weather state instead of leaving inert saved filters", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("blur", "effect", { target: "MainBackground", power: 0.4 })).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("bokeh", "effect", { focus: "MainBackground", power: 0.5 })).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("glitchfilter", "effect", { power: 0.35 })).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("rain", "effect", { power: 0.6 })).snapshot;

    const noBlur = reducePixiRuntimeCommand(stage, runtimeCommand("blur", "effect", { target: "MainBackground", power: 0 })).snapshot;
    const noBokeh = reducePixiRuntimeCommand(noBlur, runtimeCommand("bokeh", "effect", { power: 0 })).snapshot;
    const noGlitch = reducePixiRuntimeCommand(noBokeh, runtimeCommand("glitchfilter", "effect", { power: 0 })).snapshot;
    const noRain = reducePixiRuntimeCommand(noGlitch, runtimeCommand("rain", "effect", { power: 0 })).snapshot;

    const mainBackground = noRain.backgroundsById.MainBackground;
    expect(mainBackground).toBeDefined();
    expect(mainBackground?.filters).not.toHaveProperty("blur");
    expect(noRain.screenFilters).not.toHaveProperty("bokeh");
    expect(noRain.screenFilters).not.toHaveProperty("glitch");
    expect(noRain.weather).not.toHaveProperty("rain");
  });

  it("preserves shader snow controls and removes weather kinds independently", () => {
    let stage = createInitialPixiStageSnapshot();
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("rain", "effect", { power: 0.7, durationMs: 120 })).snapshot;
    const withSnow = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("snow", "effect", {
        power: 0.9,
        xSpeed: -0.35,
        ySpeed: 0.72,
        density: 1.45,
        flakeScale: 1.2,
        sway: 0.85,
        fog: 0.32,
        noise: 0.04,
        seed: 17,
        durationMs: 300,
        wait: true
      })
    );

    expect(withSnow.snapshot.weather.rain).toMatchObject({ kind: "rain", power: 0.7 });
    expect(withSnow.snapshot.weather.snow).toMatchObject({
      kind: "snow",
      power: 0.9,
      xSpeed: -0.35,
      ySpeed: 0.72,
      density: 1.45,
      flakeScale: 1.2,
      sway: 0.85,
      fog: 0.32,
      noise: 0.04,
      seed: 17
    });
    expect(withSnow.waitTasks).toEqual([{ kind: "weather-transition", target: "snow", revision: withSnow.snapshot.revision }]);

    const noSnow = reducePixiRuntimeCommand(
      withSnow.snapshot,
      runtimeCommand("snow", "effect", { power: 0, durationMs: 200, wait: true })
    );
    expect(noSnow.snapshot.weather).toHaveProperty("rain");
    expect(noSnow.snapshot.weather).not.toHaveProperty("snow");
    expect(noSnow.hints).toEqual([{ type: "weather-remove", kind: "snow", durationMs: 200, wait: true }]);
    expect(noSnow.waitTasks).toEqual([{ kind: "weather-transition", target: "snow", revision: noSnow.snapshot.revision }]);
  });
});

function runtimeCommand(
  commandId: string,
  category: NaniCommandCategory,
  params: Record<string, RuntimeValue>,
  options: {
    canonicalName?: string;
    source?: NaniCommandSource;
    status?: NaniCommandStatus;
  } = {}
): RuntimeCommand {
  return {
    commandId,
    canonicalName: options.canonicalName ?? commandId,
    category,
    source: options.source ?? "v-ronpa",
    status: options.status ?? "implemented",
    params,
    loc: { scriptPath: "pixi-presenter-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
