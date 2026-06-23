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
    const withPortrait = reducePixiRuntimeCommand(
      withBackground.snapshot,
      runtimeCommand("char", "actor", {
        target: "character:felix",
        appearance: "portrait:felix:neutral",
        pos: [50, 0]
      })
    );

    expect(withBackground).toMatchObject({
      snapshot: {
        version: 2,
        revision: 1,
        backgroundsById: {
          MainBackground: { id: "MainBackground", kind: "background", appearance: "bg:harness", visible: true }
        },
        actorOrder: ["MainBackground"],
        background: { backgroundId: "bg:harness" }
      },
      hints: [],
      diagnostics: []
    });
    expect(withPortrait.snapshot).toMatchObject({
      version: 2,
      revision: 2,
      backgroundsById: {
        MainBackground: { id: "MainBackground", kind: "background", appearance: "bg:harness" }
      },
      charactersById: {
        "character:felix": {
          id: "character:felix",
          kind: "character",
          appearance: "portrait:felix:neutral",
          pos: [0.5, 0],
          visible: true
        }
      },
      actorOrder: ["MainBackground", "character:felix"],
      background: { backgroundId: "bg:harness" },
      slots: {
        center: {
          slot: "center",
          characterId: "character:felix",
          portraitId: "portrait:felix:neutral"
        }
      }
    });
    expect(withPortrait.hints).toEqual([]);
    expect(withPortrait.diagnostics).toEqual([]);
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
      reducePixiRuntimeCommand(initial, runtimeCommand("slide", "actor", { target: "character:missing", to: [50, 0] }))
    ).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unsupported-pixi-params",
          commandId: "slide",
          message: "@slide is routed to Pixi but cannot be consumed: unknown actor target: character:missing."
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

  it("updates fixed portrait slots independently and preserves unrelated stage state", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "character:ren",
        appearance: "portrait:ren:neutral",
        pos: [24, 0]
      })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "character:felix",
        appearance: "portrait:felix:neutral",
        pos: [50, 0]
      })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "character:mira",
        appearance: "portrait:mira:neutral",
        pos: [76, 0]
      })
    ).snapshot;
    const replacedCenter = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "character:felix",
        appearance: "portrait:felix:concerned"
      })
    ).snapshot;

    expect(replacedCenter).toMatchObject({
      version: 2,
      revision: 5,
      background: { backgroundId: "bg:harness" },
      charactersById: {
        "character:ren": {
          id: "character:ren",
          appearance: "portrait:ren:neutral",
          pos: [0.24, 0]
        },
        "character:felix": {
          id: "character:felix",
          appearance: "portrait:felix:concerned",
          pos: [0.5, 0]
        },
        "character:mira": {
          id: "character:mira",
          appearance: "portrait:mira:neutral",
          pos: [0.76, 0]
        }
      },
      slots: {
        left: { slot: "left", characterId: "character:ren", portraitId: "portrait:ren:neutral" },
        center: { slot: "center", characterId: "character:felix", portraitId: "portrait:felix:concerned" },
        right: { slot: "right", characterId: "character:mira", portraitId: "portrait:mira:neutral" }
      }
    });
  });

  it("uses command-count revision semantics for repeated persistent commands", () => {
    const first = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    const second = reducePixiRuntimeCommand(first, runtimeCommand("back", "scene", { appearance: "bg:harness" })).snapshot;

    expect(second).toMatchObject({
      version: 2,
      revision: 2,
      backgroundsById: {
        MainBackground: { id: "MainBackground", kind: "background", appearance: "bg:harness" }
      },
      background: { backgroundId: "bg:harness" }
    });
  });

  it("applies wildcard character commands to visible actors instead of creating a literal star actor", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("char", "actor", { target: "character:ren", appearance: "portrait:ren:neutral", pos: [24, 0] })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", { target: "character:mira", appearance: "portrait:mira:neutral", pos: [76, 0] })
    ).snapshot;

    const tinted = reducePixiRuntimeCommand(stage, runtimeCommand("char", "actor", { target: "*", tint: "#ffdc22" })).snapshot;

    expect(tinted.charactersById).not.toHaveProperty("*");
    expect(tinted.charactersById["character:ren"]).toMatchObject({ tint: "#ffdc22", pos: [0.24, 0] });
    expect(tinted.charactersById["character:mira"]).toMatchObject({ tint: "#ffdc22", pos: [0.76, 0] });
  });

  it("stores explicitly targeted background actors without overwriting the main background compatibility field", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { target: "MainBackground", appearance: "bg:harness" })
    ).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("back", "scene", { target: "Flower", appearance: "Bloomed" })).snapshot;

    expect(stage.backgroundsById).toMatchObject({
      MainBackground: { id: "MainBackground", appearance: "bg:harness" },
      Flower: { id: "Flower", appearance: "Bloomed" }
    });
    expect(stage.background).toEqual({ backgroundId: "bg:harness" });
    expect(stage.actorOrder).toEqual(["MainBackground", "Flower"]);
  });

  it("uses official scene-percent positions for slide and stores from/to transition metadata", () => {
    const stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("char", "actor", {
        target: "character:felix",
        appearance: "portrait:felix:neutral",
        pos: [50, 0],
        visible: false
      })
    ).snapshot;
    const slid = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("slide", "actor", {
        target: "character:felix",
        appearance: "portrait:felix:concerned",
        from: [15, 50],
        to: [85, 0],
        durationMs: 500
      })
    ).snapshot;

    expect(slid.charactersById["character:felix"]).toMatchObject({
      appearance: "portrait:felix:concerned",
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
        target: "character:felix",
        appearance: "portrait:felix:neutral",
        durationMs: 400,
        wait: true
      })
    );
    expect(withActor.waitTasks).toEqual([
      { kind: "actor-transition", target: "character:felix", revision: withActor.snapshot.revision }
    ]);

    const flash = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("flash", "effect", { color: "#ffffff", durationMs: 120, wait: true })
    );
    expect(flash.waitTasks).toEqual([{ kind: "flash", target: "screen", revision: withActor.snapshot.revision }]);

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
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("rain", "effect", { power: 0.6 })).snapshot;

    const noBlur = reducePixiRuntimeCommand(stage, runtimeCommand("blur", "effect", { target: "MainBackground", power: 0 })).snapshot;
    const noBokeh = reducePixiRuntimeCommand(noBlur, runtimeCommand("bokeh", "effect", { power: 0 })).snapshot;
    const noRain = reducePixiRuntimeCommand(noBokeh, runtimeCommand("rain", "effect", { power: 0 })).snapshot;

    const mainBackground = noRain.backgroundsById.MainBackground;
    expect(mainBackground).toBeDefined();
    expect(mainBackground?.filters).not.toHaveProperty("blur");
    expect(noRain.screenFilters).not.toHaveProperty("bokeh");
    expect(noRain.weather).not.toHaveProperty("rain");
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
