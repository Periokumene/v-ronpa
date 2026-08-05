import { createInitialPixiStageSnapshot } from "@v-ronpa/pixi-stage-model";
import { Container, type Sprite, type Ticker } from "pixi.js";
import { describe, expect, it } from "vitest";
import { PresentationTaskController } from "../presentationTasks";
import { TweenSystem } from "./animation";
import { PersistentScreenEffectSystem } from "./persistentScreen";
import { RootFilterStack } from "./rootFilterStack";

describe("persistent bokeh effect", () => {
  it("uses one task and one live transition for root blur and overlay", () => {
    const root = new Container();
    const tweens = new TweenSystem();
    const tasks = new PresentationTaskController();
    const rootFilters = new RootFilterStack({ root, width: () => 960, height: () => 540 });
    const screen = new PersistentScreenEffectSystem(
      { root, width: () => 960, height: () => 540 },
      rootFilters,
      tweens,
      tasks
    );
    screen.reconcile(stage(0.8, 1, 100), true, []);

    expect(tasks.snapshot()).toMatchObject([
      { kind: "screen-filter-transition", target: "bokeh", revision: 1, status: "running" }
    ]);
    const layer = root.children.find((child) => child.label === "screen-filter-overlays") as Container;
    const filter = root.filters?.[0] as unknown as { strength: number };
    expect(filter.strength).toBe(0);

    tweens.tick({ deltaMS: 50 } as Ticker);
    expect(filter.strength).toBeCloseTo(3.2);
    expect(layer.alpha).toBeCloseTo(0.63);
    expect((layer.children[0] as Sprite).alpha).toBeCloseTo(0.456);

    tweens.tick({ deltaMS: 60 } as Ticker);
    expect(tasks.snapshot()).toEqual([]);
    expect(filter.strength).toBeCloseTo(6.4);
  });

  it("atomically removes blur and overlay while preserving unrelated filters", () => {
    const root = new Container();
    const tweens = new TweenSystem();
    const tasks = new PresentationTaskController();
    const rootFilters = new RootFilterStack({ root, width: () => 960, height: () => 540 });
    const unrelated = { destroy() {} };
    rootFilters.addTransientFilter(unrelated as never);
    const screen = new PersistentScreenEffectSystem(
      { root, width: () => 960, height: () => 540 },
      rootFilters,
      tweens,
      tasks
    );
    screen.reconcile(stage(0.8, 1, 0), false, []);
    screen.reconcile(
      { ...createInitialPixiStageSnapshot(), revision: 2 },
      true,
      [{ type: "screen-filter-remove", kind: "bokeh", durationMs: 100, easing: "linear", wait: true }]
    );
    tweens.tick({ deltaMS: 120 } as Ticker);

    const layer = root.children.find((child) => child.label === "screen-filter-overlays") as Container;
    expect(layer.children).toHaveLength(0);
    expect(root.filters).toEqual([unrelated]);
    expect(tasks.snapshot()).toEqual([]);
  });
});

function stage(power: number, revision: number, durationMs: number) {
  return {
    ...createInitialPixiStageSnapshot(),
    revision,
    screenFilters: {
      bokeh: {
        power,
        transition: { durationMs, easing: "linear", lazy: false, wait: durationMs > 0 }
      }
    }
  };
}
