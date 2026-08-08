import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { PresentationTaskController } from "../presentationTasks";
import { TweenSystem } from "./animation";
import { createEffectLabFilter, setEffectLabColor, setEffectLabResolution } from "./effectLabShader";
import { PersistentScreenEffectSystem } from "./persistentScreen";
import { RootFilterStack } from "./rootFilterStack";

describe("Pixi effect lab shaders", () => {
  it("creates deterministic private shader state and updates color and viewport", () => {
    const record = createEffectLabFilter("pulse", 960, 540);
    setEffectLabColor(record.uniforms.uColor, "#b8d6d8");
    setEffectLabResolution(record, 1280, 720);
    expect(record.uniforms.uMode).toBe(1);
    expect(record.uniforms.uColor[0]).toBeCloseTo(184 / 255);
    expect(record.uniforms.uColor[1]).toBeCloseTo(214 / 255);
    expect(record.uniforms.uColor[2]).toBeCloseTo(216 / 255);
    expect(Array.from(record.uniforms.uResolution)).toEqual([1280, 720]);
    record.filter.destroy();
  });

  it("installs persistent filters in the declared composition order and isolates timed removal", () => {
    const root = new Container();
    const options = { root, width: () => 960, height: () => 540 };
    const tweens = new TweenSystem();
    const tasks = new PresentationTaskController();
    const system = new PersistentScreenEffectSystem(options, new RootFilterStack(options), tweens, tasks);
    const snapshot = stage();
    system.reconcile(snapshot, false, []);
    const filters = root.filters as unknown as Array<{ resources?: { effectLabUniforms?: { uniforms: { uMode: number } } } }>;
    expect(filters.map((filter) => filter.resources?.effectLabUniforms?.uniforms.uMode)).toEqual([0, 1, 2, 3]);

    const withoutStatic = { ...snapshot, revision: 2, screenFilters: { ...snapshot.screenFilters, staticFilter: undefined } } as unknown as PixiStageSnapshot;
    system.reconcile(withoutStatic, true, [{ type: "screen-filter-remove", kind: "staticFilter", durationMs: 100, wait: true }]);
    expect(tasks.snapshot()).toEqual([expect.objectContaining({ kind: "screen-filter-transition", target: "staticFilter" })]);
    tweens.tick({ deltaMS: 120 } as never);
    expect(tasks.snapshot()).toEqual([]);
    expect((root.filters as unknown[])).toHaveLength(3);
    system.destroy();
    expect(root.filters).toBeNull();
  });

  it("integrates animated phases so changing speed or rate never rewinds the current phase", () => {
    const root = new Container();
    const options = { root, width: () => 960, height: () => 540 };
    const system = new PersistentScreenEffectSystem(
      options,
      new RootFilterStack(options),
      new TweenSystem(),
      new PresentationTaskController()
    );
    const first = stage();
    system.reconcile(first, false, []);
    system.tick({ deltaMS: 1_000 } as never);
    const uniforms = effectUniforms(root);
    expect(uniforms.get(0)?.uPhase).toBeCloseTo(-0.1);
    expect(uniforms.get(1)?.uPhase).toBeCloseTo(92 / 60);
    expect(uniforms.get(2)?.uPhase).toBeCloseTo(1);

    const changed = {
      ...first,
      revision: 2,
      screenFilters: {
        ...first.screenFilters,
        waterVeil: { ...first.screenFilters.waterVeil!, drift: -0.2 },
        pulse: { ...first.screenFilters.pulse!, rate: 120 },
        staticFilter: { ...first.screenFilters.staticFilter!, speed: 2 }
      }
    };
    system.reconcile(changed, false, []);
    expect(uniforms.get(0)?.uPhase).toBeCloseTo(-0.1);
    expect(uniforms.get(1)?.uPhase).toBeCloseTo(92 / 60);
    expect(uniforms.get(2)?.uPhase).toBeCloseTo(1);
    system.tick({ deltaMS: 500 } as never);
    expect(uniforms.get(0)?.uPhase).toBeCloseTo(-0.2);
    expect(uniforms.get(1)?.uPhase).toBeCloseTo(92 / 60 + 1);
    expect(uniforms.get(2)?.uPhase).toBeCloseTo(2);
    system.destroy();
  });

  it("does not replay a persistent transition when another family advances the stage revision", () => {
    const root = new Container();
    const options = { root, width: () => 960, height: () => 540 };
    const tweens = new TweenSystem();
    const tasks = new PresentationTaskController();
    const system = new PersistentScreenEffectSystem(options, new RootFilterStack(options), tweens, tasks);
    const initial = stage();
    system.reconcile(initial, false, []);
    const pulse = {
      ...initial.screenFilters.pulse!,
      power: 0.9,
      transition: { durationMs: 100, easing: "linear", lazy: false, wait: true }
    };
    const changed = {
      ...initial,
      revision: 2,
      screenFilters: { ...initial.screenFilters, pulse }
    };
    system.reconcile(changed, true, []);
    tweens.tick({ deltaMS: 55 } as never);
    system.reconcile({ ...changed, revision: 3 }, true, []);

    expect(tasks.snapshot()).toEqual([
      expect.objectContaining({ kind: "screen-filter-transition", target: "pulse", revision: 2 })
    ]);
    tweens.tick({ deltaMS: 55 } as never);
    expect(tasks.snapshot()).toEqual([]);
    system.destroy();
  });
});

function effectUniforms(root: Container): Map<number, { uPhase: number }> {
  const filters = root.filters as unknown as Array<{
    resources?: { effectLabUniforms?: { uniforms: { uMode: number; uPhase: number } } };
  }>;
  return new Map(filters.flatMap((filter) => {
    const uniforms = filter.resources?.effectLabUniforms?.uniforms;
    return uniforms ? [[uniforms.uMode, uniforms] as const] : [];
  }));
}

function stage(): PixiStageSnapshot {
  const transition = { durationMs: 0, lazy: false, wait: false };
  return {
    version: 6, revision: 1, backgroundsById: {}, innerBackgroundsById: {}, charactersById: {}, actorOrder: [], weather: {},
    screenFilters: {
      waterVeil: { power: 0.5, level: 0.18, ripple: 0.35, drift: -0.1, blur: 0.12, tint: "#6c8390", droplets: 0.5, seed: 1, transition },
      pulse: { power: 0.6, rate: 92, origin: [0.5, 0.52], echoes: 3, expansion: 0.035, edge: 0.65, distortion: 0.35, chroma: 0.18, decay: 0.72, color: "#b8d6d8", transition },
      staticFilter: { power: 0.6, density: 0.7, scanline: 0.65, jitter: 0.45, warp: 0.35, grainSize: 1, speed: 1, vignette: 0.35, palette: "cold", seed: 1, transition },
      vignette: { power: 0.5, radius: 0.62, softness: 0.3, color: "#160a10", breathe: 0.06, grain: 0.03, transition }
    }
  };
}
