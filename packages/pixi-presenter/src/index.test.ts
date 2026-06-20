import { describe, expect, it } from "vitest";
import {
  createInitialPixiStageSnapshot,
  createPixiPresenter,
  reducePixiStageCommand
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
    const withBackground = reducePixiStageCommand(initial, {
      type: "set-background",
      backgroundId: "bg:harness"
    });
    const withPortrait = reducePixiStageCommand(withBackground.snapshot, {
      type: "char-enter",
      characterId: "character:felix",
      portraitId: "portrait:felix:neutral",
      slot: "center",
      effect: "fadeIn"
    });

    expect(withBackground).toEqual({
      snapshot: {
        version: 1,
        revision: 1,
        background: { backgroundId: "bg:harness" },
        slots: {}
      },
      hints: []
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
  });

  it("keeps transient Pixi commands out of the saveable stage snapshot", () => {
    const initial = createInitialPixiStageSnapshot();
    const flash = { type: "flash", color: "#ffffff", durationMs: 160 } as const;
    const keyword = {
      type: "trial-keyword",
      keywordId: "kw:door",
      text: "locked",
      evidenceId: "evidence:keycard"
    } as const;

    expect(reducePixiStageCommand(initial, flash)).toEqual({
      snapshot: initial,
      hints: [flash]
    });
    expect(reducePixiStageCommand(initial, keyword)).toEqual({
      snapshot: initial,
      hints: [keyword]
    });
    expect(reducePixiStageCommand(initial, { type: "print", text: "UI only", autoNext: false })).toEqual({
      snapshot: initial,
      hints: []
    });
  });

  it("updates fixed portrait slots independently and preserves unrelated stage state", () => {
    let stage = reducePixiStageCommand(createInitialPixiStageSnapshot(), {
      type: "set-background",
      backgroundId: "bg:harness"
    }).snapshot;
    stage = reducePixiStageCommand(stage, {
      type: "char-enter",
      characterId: "character:ren",
      portraitId: "portrait:ren:neutral",
      slot: "left",
      effect: "fadeIn"
    }).snapshot;
    stage = reducePixiStageCommand(stage, {
      type: "char-enter",
      characterId: "character:felix",
      portraitId: "portrait:felix:neutral",
      slot: "center",
      effect: "fadeIn"
    }).snapshot;
    stage = reducePixiStageCommand(stage, {
      type: "char-enter",
      characterId: "character:mira",
      portraitId: "portrait:mira:neutral",
      slot: "right",
      effect: "fadeIn"
    }).snapshot;
    const replacedCenter = reducePixiStageCommand(stage, {
      type: "char-enter",
      characterId: "character:felix",
      portraitId: "portrait:felix:concerned",
      slot: "center",
      effect: "fadeIn"
    }).snapshot;

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
    const first = reducePixiStageCommand(createInitialPixiStageSnapshot(), {
      type: "set-background",
      backgroundId: "bg:harness"
    }).snapshot;
    const second = reducePixiStageCommand(first, {
      type: "set-background",
      backgroundId: "bg:harness"
    }).snapshot;

    expect(second).toEqual({
      version: 1,
      revision: 2,
      background: { backgroundId: "bg:harness" },
      slots: {}
    });
  });
});
