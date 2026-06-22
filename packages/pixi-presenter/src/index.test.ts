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
      runtimeCommand("charenter", "actor", {
        characterId: "character:felix",
        portraitId: "portrait:felix:neutral",
        slot: "center",
        effect: "fadeIn"
      })
    );

    expect(withBackground).toEqual({
      snapshot: {
        version: 1,
        revision: 1,
        background: { backgroundId: "bg:harness" },
        slots: {}
      },
      hints: [],
      diagnostics: []
    });
    expect(withPortrait.snapshot).toEqual({
      version: 1,
      revision: 2,
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
      hints: [{ type: "flash", color: "#ffffff", durationMs: 160 }],
      diagnostics: []
    });
    expect(reducePixiRuntimeCommand(initial, keyword)).toEqual({
      snapshot: initial,
      hints: [{ type: "trial-keyword", keywordId: "kw:door", text: "locked", evidenceId: "evidence:keycard" }],
      diagnostics: []
    });
  });

  it("diagnoses unsupported Pixi-routed runtime commands without changing the snapshot", () => {
    const initial = createInitialPixiStageSnapshot();

    expect(reducePixiRuntimeCommand(initial, runtimeCommand("focus", "effect", { target: "stage", duration: 500 }))).toEqual({
      snapshot: initial,
      hints: [],
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
      diagnostics: [
        {
          code: "unsupported-pixi-params",
          commandId: "back",
          message: "@back is routed to Pixi but cannot be consumed: missing required params: appearance."
        }
      ]
    });
    expect(
      reducePixiRuntimeCommand(
        initial,
        runtimeCommand("charenter", "actor", {
          characterId: "character:felix",
          slot: "upper-left"
        })
      )
    ).toEqual({
      snapshot: initial,
      hints: [],
      diagnostics: [
        {
          code: "unsupported-pixi-params",
          commandId: "charenter",
          message: "@charenter is routed to Pixi but cannot be consumed: unsupported slot: upper-left."
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
      runtimeCommand("charenter", "actor", {
        characterId: "character:ren",
        portraitId: "portrait:ren:neutral",
        slot: "left",
        effect: "fadeIn"
      })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("charenter", "actor", {
        characterId: "character:felix",
        portraitId: "portrait:felix:neutral",
        slot: "center",
        effect: "fadeIn"
      })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("charenter", "actor", {
        characterId: "character:mira",
        portraitId: "portrait:mira:neutral",
        slot: "right",
        effect: "fadeIn"
      })
    ).snapshot;
    const replacedCenter = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("charenter", "actor", {
        characterId: "character:felix",
        portraitId: "portrait:felix:concerned",
        slot: "center",
        effect: "fadeIn"
      })
    ).snapshot;

    expect(replacedCenter).toEqual({
      version: 1,
      revision: 5,
      background: { backgroundId: "bg:harness" },
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

    expect(second).toEqual({
      version: 1,
      revision: 2,
      background: { backgroundId: "bg:harness" },
      slots: {}
    });
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
