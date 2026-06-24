import { describe, expect, it } from "vitest";
import { Container, TilingSprite, type Ticker } from "pixi.js";
import type { PixiActorSnapshot, PixiStageSnapshot, PixiWeatherSnapshot } from "@v-ronpa/contracts";
import { createInitialPixiStageSnapshot } from "../stageSnapshot";
import { ActorSystem, FilterSystem, TransientEffectSystem, TweenSystem, WeatherSystem } from "./systems";
import { PresentationTaskController } from "./presentationTasks";

describe("pixi presentation task system integration", () => {
  it("creates and completes an actor transition task", () => {
    const { actors, tasks, tweens } = createSystems();
    actors.reconcile(stageWithActor(backgroundActor({ durationMs: 100 }), 1), true);

    expect(tasks.snapshot()).toMatchObject([{ kind: "actor-transition", target: "MainBackground", revision: 1, status: "running" }]);

    tick(tweens, 120);

    expect(tasks.snapshot()).toEqual([]);
  });

  it("does not create actor transition tasks when animation is disabled", () => {
    const { actors, tasks } = createSystems();
    actors.reconcile(stageWithActor(backgroundActor({ durationMs: 100 }), 1), false);

    expect(tasks.snapshot()).toEqual([]);
  });

  it("creates and completes no-op actor wait tasks when the snapshot transition has no visual delta", () => {
    const { actors, tasks, tweens } = createSystems();
    actors.reconcile(stageWithActor(backgroundActor({ durationMs: 0 }), 1), false);
    actors.reconcile(stageWithActor(backgroundActor({ durationMs: 100, wait: true }), 2), true);

    expect(tasks.snapshot()).toMatchObject([{ kind: "actor-transition", target: "MainBackground", revision: 2, status: "running" }]);

    tick(tweens, 120);

    expect(tasks.snapshot()).toEqual([]);
  });

  it("creates and completes flash tasks through transient effects", () => {
    const { effects, tasks, tweens } = createSystems();
    effects.run([{ type: "flash", color: "#ffffff", durationMs: 80, wait: false }], 2);

    expect(tasks.snapshot()).toMatchObject([{ kind: "flash", target: "screen", revision: 2, status: "running" }]);

    tick(tweens, 100);

    expect(tasks.snapshot()).toEqual([]);
  });

  it("creates and completes weather transition tasks for power changes", () => {
    const { tasks, tweens, weather } = createSystems();
    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 0.3, durationMs: 0 }), 1), false);

    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 0.85, durationMs: 100 }), 2), true);

    expect(tasks.snapshot()).toMatchObject([{ kind: "weather-transition", target: "rain", revision: 2, status: "running" }]);

    tick(tweens, 120);

    expect(tasks.snapshot()).toEqual([]);
  });

  it("creates and completes weather transition tasks for removal hints", () => {
    const { tasks, tweens, weather } = createSystems();
    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 0.85, durationMs: 0 }), 1), false);
    weather.reconcile(
      { ...createInitialPixiStageSnapshot(), revision: 2 },
      true,
      [{ type: "weather-remove", kind: "rain", durationMs: 100, wait: true }]
    );

    expect(tasks.snapshot()).toMatchObject([{ kind: "weather-transition", target: "rain", revision: 2, status: "running" }]);

    tick(tweens, 120);

    expect(tasks.snapshot()).toEqual([]);
  });

  it("renders snow through a shader overlay instead of legacy tiling sprites", () => {
    const { root, weather } = createSystems();
    weather.reconcile(stageWithWeather(snowWeatherSnapshot({ power: 0.9, durationMs: 0 }), 1), false);

    const snow = findWeatherContainer(root, "snow");
    expect(snow).toBeDefined();
    expect(snow?.children.some((child) => child instanceof TilingSprite)).toBe(false);
    const surface = snow?.children.find((child) => child.label === "weather:snow:shader-surface");
    expect(surface).toBeDefined();
    const filter = surface?.filters?.[0] as { resources: { snowUniforms: { uniforms: Record<string, number | Float32Array> } } } | undefined;
    const uniforms = filter?.resources.snowUniforms.uniforms;
    expect(uniforms).toMatchObject({
      uPower: 0.9,
      uDensity: 1.4,
      uFallSpeed: 0.75,
      uWind: -0.35,
      uFlakeScale: 1.25,
      uSway: 0.85,
      uFog: 0.3,
      uNoise: 0.04,
      uSeed: 23
    });

    const before = Number(uniforms?.uTime ?? 0);
    weather.tick({ deltaMS: 120 } as Ticker);

    expect(Number(uniforms?.uTime ?? 0)).toBeGreaterThan(before);
  });

  it("keeps rain and shader snow independent through animated snow cleanup", () => {
    const { root, tasks, tweens, weather } = createSystems();
    weather.reconcile(stageWithWeathers({ rain: weatherSnapshot({ power: 0.7, durationMs: 0 }), snow: snowWeatherSnapshot({ power: 0.9, durationMs: 0 }) }, 1), false);

    expect(findWeatherContainer(root, "rain")).toBeDefined();
    expect(findWeatherContainer(root, "snow")).toBeDefined();

    weather.reconcile(
      stageWithWeathers({ rain: weatherSnapshot({ power: 0.7, durationMs: 0 }) }, 2),
      true,
      [{ type: "weather-remove", kind: "snow", durationMs: 100, wait: true }]
    );

    expect(tasks.snapshot()).toMatchObject([{ kind: "weather-transition", target: "snow", revision: 2, status: "running" }]);

    tick(tweens, 120);

    expect(tasks.snapshot()).toEqual([]);
    expect(findWeatherContainer(root, "rain")).toBeDefined();
    expect(findWeatherContainer(root, "snow")).toBeUndefined();
  });

  it("creates and completes actor transition tasks for filter-only changes", () => {
    const { actors, tasks, tweens } = createSystems();
    actors.reconcile(stageWithActor(backgroundActor({ durationMs: 0 }), 1), false);
    actors.reconcile(stageWithActor({ ...backgroundActor({ durationMs: 100 }), filters: { bokeh: 0.5 } }, 2), true);

    expect(tasks.snapshot()).toMatchObject([{ kind: "actor-transition", target: "MainBackground", revision: 2, status: "running" }]);

    tick(tweens, 120);

    expect(tasks.snapshot()).toEqual([]);
  });
});

function createSystems() {
  const root = new Container({ label: "test-root" });
  const options = { root, width: () => 960, height: () => 540 };
  const filters = new FilterSystem(options);
  const tweens = new TweenSystem();
  const tasks = new PresentationTaskController();
  const actors = new ActorSystem(options, filters, tweens, tasks);
  const weather = new WeatherSystem(options, filters, tweens, tasks);
  const effects = new TransientEffectSystem(options, actors, filters, tweens, tasks);
  return { actors, effects, root, tasks, tweens, weather };
}

function tick(tweens: TweenSystem, deltaMS: number): void {
  tweens.tick({ deltaMS } as Ticker);
}

function stageWithActor(actor: PixiActorSnapshot, revision: number): PixiStageSnapshot {
  return {
    ...createInitialPixiStageSnapshot(),
    revision,
    backgroundsById: { MainBackground: actor },
    actorOrder: ["MainBackground"]
  };
}

function backgroundActor({ durationMs, wait = false }: { durationMs: number; wait?: boolean }): PixiActorSnapshot {
  return {
    id: "MainBackground",
    kind: "background",
    appearance: "bg:test",
    visible: true,
    alpha: 1,
    z: 0,
    filters: {},
    transition: { durationMs, lazy: false, wait }
  };
}

function stageWithWeather(weather: PixiWeatherSnapshot, revision: number): PixiStageSnapshot {
  return stageWithWeathers({ [weather.kind]: weather }, revision);
}

function stageWithWeathers(weather: PixiStageSnapshot["weather"], revision: number): PixiStageSnapshot {
  return {
    ...createInitialPixiStageSnapshot(),
    revision,
    weather
  };
}

function weatherSnapshot({ power, durationMs }: { power: number; durationMs: number }): PixiWeatherSnapshot {
  return {
    kind: "rain",
    power,
    transition: { durationMs, lazy: false, wait: false }
  };
}

function snowWeatherSnapshot({ power, durationMs }: { power: number; durationMs: number }): PixiWeatherSnapshot {
  return {
    kind: "snow",
    power,
    xSpeed: -0.35,
    ySpeed: 0.75,
    density: 1.4,
    flakeScale: 1.25,
    sway: 0.85,
    fog: 0.3,
    noise: 0.04,
    seed: 23,
    transition: { durationMs, lazy: false, wait: false }
  };
}

function findWeatherContainer(root: Container, kind: string): Container | undefined {
  const layers = root.children.filter((child): child is Container => child instanceof Container);
  for (const layer of layers) {
    const weather = layer.children.find((child): child is Container => child instanceof Container && child.label === `weather:${kind}`);
    if (weather) return weather;
  }
  return undefined;
}
