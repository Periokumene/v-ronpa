import { afterEach, describe, expect, it, vi } from "vitest";
import { Assets, Container, Rectangle, Sprite, Texture, TilingSprite, type Filter, type Ticker } from "pixi.js";
import type { PixiActorSnapshot, PixiStageSnapshot, PixiWeatherSnapshot } from "@v-ronpa/contracts";
import { createInitialPixiStageSnapshot } from "../stageSnapshot";
import { ActorSystem, FilterSystem, RootFilterStack, TransientEffectSystem, TweenSystem, WeatherSystem } from "./systems";
import { PresentationTaskController } from "./presentationTasks";
import type { PixiAssetResolver, PixiPresenterDiagnostic } from "./assetResolver";
import { CharacterSystem } from "./characters";

describe("pixi presentation task system integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it("loads backgrounds through ActorSystem and character packs through CharacterSystem", async () => {
    const load = vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const fetch = installCharacterPackFetch();
    const resolverCalls: unknown[] = [];
    const { actors } = createSystems({
      assetResolver: {
        resolve(input) {
          resolverCalls.push(input);
          if (input.kind === "character-pack") return { uri: characterPackUri() };
          return { uri: `/resolved/${input.id}.png` };
        }
      }
    });

    actors.reconcile(stageWithActors(
      backgroundActor({ durationMs: 0 }),
      [characterActor("Ema", "Pensive1")]
    ), false);

    expect(resolverCalls).toEqual([
      { id: "bg:test", kind: "background" },
      { id: "Ema", kind: "character-pack" }
    ]);
    expect(load).toHaveBeenCalledWith("/resolved/bg:test.png");
    await waitFor(() => load.mock.calls.some(([uri]) => String(uri) === "https://assets.test/characters/Ema/layers/Body.png"));
    expect(load).toHaveBeenCalledWith("https://assets.test/characters/Ema/layers/Body.png");
    expect(load).toHaveBeenCalledWith("https://assets.test/characters/Ema/layers/FacePensive.png");
    expect(fetch).toHaveBeenCalledWith(characterPackUri());
    expect(fetch).toHaveBeenCalledWith("https://assets.test/characters/Ema/layers.json");
    expect(fetch).toHaveBeenCalledWith("https://assets.test/characters/Ema/compositions.json");
    expect(fetch).toHaveBeenCalledWith("https://assets.test/characters/Ema/metadata/Body.json");
    expect(fetch).toHaveBeenCalledWith("https://assets.test/characters/Ema/metadata/FacePensive.json");
    expect(fetch).not.toHaveBeenCalledWith("https://assets.test/characters/Ema/metadata/FaceNormal.json");
  });

  it("emits diagnostics for missing background and character-pack assets while keeping fallbacks", () => {
    const load = vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const { actors } = createSystems({
      assetResolver: {
        resolve(input) {
          return { diagnostic: { code: "asset-missing", severity: "error", message: `${input.id} missing` } };
        }
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    });

    actors.reconcile(stageWithActors(
      backgroundActor({ durationMs: 0 }),
      [characterActor("Ema", "Pensive1")]
    ), false);

    expect(load).not.toHaveBeenCalled();
    expect(diagnostics).toEqual([
      {
        source: "asset",
        code: "asset-missing",
        severity: "error",
        assetId: "bg:test",
        kind: "background",
        message: "bg:test missing"
      },
      {
        source: "asset",
        code: "asset-missing",
        severity: "error",
        assetId: "Ema",
        kind: "character-pack",
        message: "Ema missing"
      }
    ]);
  });

  it("atomically replaces layered character content after every active texture resolves", async () => {
    installCharacterPackFetch();
    const textureLoads = new Map<string, Deferred<Texture>>();
    vi.spyOn(Assets, "load").mockImplementation((uri) => {
      const deferred = createDeferred<Texture>();
      textureLoads.set(String(uri), deferred);
      return deferred.promise as never;
    });
    const container = new Container({ label: "actor:Ema" });
    const stale = new Container({ label: "stale-character" });
    container.addChild(stale);
    const system = new CharacterSystem({
      width: () => 960,
      height: () => 540,
      assetResolver: {
        resolve(input) {
          return input.kind === "character-pack" && input.id === "Ema" ? { uri: characterPackUri() } : {};
        }
      }
    });

    system.render(container, characterActor("Ema", "Pensive1"), 1, () => true);

    await waitFor(() => textureLoads.has("https://assets.test/characters/Ema/layers/Body.png"));
    await waitFor(() => textureLoads.has("https://assets.test/characters/Ema/layers/FacePensive.png"));
    textureLoads.get("https://assets.test/characters/Ema/layers/Body.png")?.resolve(Texture.EMPTY);
    await flushPromises();
    expect(container.children).toEqual([stale]);

    textureLoads.get("https://assets.test/characters/Ema/layers/FacePensive.png")?.resolve(Texture.EMPTY);
    await waitFor(() => container.children[0]?.label === "layered-character:Ema:1");

    const content = container.children[0] as Container;
    expect(content.children.map((child) => child.zIndex)).toEqual([1, 10]);
    const body = content.children[0] as Sprite;
    const face = content.children[1] as Sprite;
    expect(body.position.x).toBe(0);
    expect(body.position.y).toBe(-10);
    expect(face.position.x).toBe(5);
    expect(face.position.y).toBe(-20);
    expect(face.anchor.x).toBe(0.25);
    expect(face.anchor.y).toBe(0.75);
    expect(face.scale.x).toBeLessThan(0);
    expect(face.scale.y).toBeGreaterThan(0);
    expect(face.rotation).toBeCloseTo(-Math.PI / 2);
    expect(face.tint).toBe(0x804020);
    expect(face.alpha).toBe(0.5);
  });

  it("does not require inactive metadata for layers overridden by the current expression", async () => {
    const fetch = installCharacterPackFetch({ includeInactiveMetadata: false });
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const container = new Container({ label: "actor:Ema" });
    const system = new CharacterSystem({
      width: () => 960,
      height: () => 540,
      assetResolver: {
        resolve(input) {
          return input.kind === "character-pack" && input.id === "Ema" ? { uri: characterPackUri() } : {};
        }
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    });

    system.render(container, characterActor("Ema", "Pensive1"), 1, () => true);

    await waitFor(() => container.children[0]?.label === "layered-character:Ema:1");

    expect(fetch).not.toHaveBeenCalledWith("https://assets.test/characters/Ema/metadata/FaceNormal.json");
    expect(diagnostics).toEqual([]);
  });

  it("diagnoses failed active texture loads with character expression and asset path", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockImplementation((uri) => {
      if (String(uri).endsWith("/FacePensive.png")) return Promise.reject(new Error("network failed")) as never;
      return Promise.resolve(Texture.EMPTY) as never;
    });
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const container = new Container({ label: "actor:Ema" });
    container.addChild(new Container({ label: "stale-character" }));
    const system = new CharacterSystem({
      width: () => 960,
      height: () => 540,
      assetResolver: {
        resolve(input) {
          return input.kind === "character-pack" && input.id === "Ema" ? { uri: characterPackUri() } : {};
        }
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    });

    system.render(container, characterActor("Ema", "Pensive1"), 1, () => true);

    await waitFor(() => diagnostics.length > 0 && container.children[0]?.label === "empty-character:Ema");

    expect(diagnostics[0]).toMatchObject({
      code: "asset-load-failed",
      severity: "error",
      assetId: "Ema",
      kind: "character-pack"
    });
    expect(diagnostics[0]?.message).toContain("Pensive1");
    expect(diagnostics[0]?.message).toContain("FacePensive.png");
  });

  it("rejects character packs with out-of-pack layer paths before loading textures", async () => {
    installCharacterPackFetch({
      mutatePack(pack) {
        pack.layers.groups.Face.layers.FacePensive.src = "https://evil.test/FacePensive.png";
      }
    });
    const load = vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const container = new Container({ label: "actor:Ema" });
    const system = new CharacterSystem({
      width: () => 960,
      height: () => 540,
      assetResolver: {
        resolve(input) {
          return input.kind === "character-pack" && input.id === "Ema" ? { uri: characterPackUri() } : {};
        }
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    });

    system.render(container, characterActor("Ema", "Pensive1"), 1, () => true);

    await waitFor(() => diagnostics.length > 0 && container.children[0]?.label === "empty-character:Ema");

    expect(load).not.toHaveBeenCalled();
    expect(diagnostics[0]).toMatchObject({ code: "asset-load-failed", severity: "error", assetId: "Ema" });
    expect(diagnostics[0]?.message).toContain("pack-relative");
  });

  it("does not cache failed texture promises permanently", async () => {
    installCharacterPackFetch();
    let faceAttempts = 0;
    vi.spyOn(Assets, "load").mockImplementation((uri) => {
      if (String(uri).endsWith("/FacePensive.png")) {
        faceAttempts += 1;
        if (faceAttempts === 1) return Promise.reject(new Error("temporary 404")) as never;
      }
      return Promise.resolve(Texture.EMPTY) as never;
    });
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const container = new Container({ label: "actor:Ema" });
    const system = new CharacterSystem({
      width: () => 960,
      height: () => 540,
      assetResolver: {
        resolve(input) {
          return input.kind === "character-pack" && input.id === "Ema" ? { uri: characterPackUri() } : {};
        }
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    });

    system.render(container, characterActor("Ema", "Pensive1"), 1, () => true);
    await waitFor(() => container.children[0]?.label === "empty-character:Ema");

    system.render(container, characterActor("Ema", "Pensive1"), 2, () => true);
    await waitFor(() => container.children[0]?.label === "layered-character:Ema:2");

    expect(faceAttempts).toBe(2);
    expect(diagnostics).toHaveLength(1);
  });


  it("creates and completes flash tasks through transient effects", () => {
    const { effects, tasks, tweens } = createSystems();
    effects.run([{ type: "flash", color: "#ffffff", durationMs: 80, wait: false }], 2);

    expect(tasks.snapshot()).toMatchObject([{ kind: "flash", target: "screen", revision: 2, status: "running" }]);

    tick(tweens, 100);

    expect(tasks.snapshot()).toEqual([]);
  });

  it("composes screen and transient filters without overwriting unrelated filters", () => {
    const root = new Container();
    const stack = new RootFilterStack({ root, width: () => 960, height: () => 540 });
    const bokeh = { label: "bokeh" } as unknown as Filter;
    const persistent = { label: "persistent-glitch" } as unknown as Filter;
    const pulse = { label: "one-shot-glitch" } as unknown as Filter;

    stack.setScreenFilters([bokeh, persistent]);
    stack.addTransientFilter(pulse);

    expect(root.filters).toEqual([bokeh, persistent, pulse]);
    expect(root.filterArea).toEqual(new Rectangle(0, 0, 960, 540));

    stack.removeTransientFilter(pulse);
    expect(root.filters).toEqual([bokeh, persistent]);

    stack.removeScreenFilter(persistent);
    expect(root.filters).toEqual([bokeh]);

    stack.clear();
    expect(root.filters).toBeNull();
    expect(root.filterArea).toBeUndefined();
  });

  it("composes persistent and one-shot glitch filters without stale cleanup", () => {
    const { effects, filters: filterSystem, root, tasks, tweens } = createSystems();
    const stage = {
      ...createInitialPixiStageSnapshot(),
      revision: 1,
      screenFilters: {
        glitch: {
          power: 0.45,
          blockJump: 0.5,
          burstJump: 0.25,
          pixelScatter: 0.75,
          colorNoise: 0.35,
          speed: 0.8,
          seed: 12,
          transition: { durationMs: 100, easing: "linear", lazy: false, wait: true }
        }
      }
    };

    filterSystem.applyScreenFilters(stage, true);

    expect(tasks.snapshot()).toMatchObject([{ kind: "screen-filter-transition", target: "glitch", revision: 1, status: "running" }]);
    const initialFilters = root.filters as unknown as GlitchTestFilter[];
    expect(initialFilters).toHaveLength(1);
    const persistent = initialFilters[0];
    const persistentUniforms = persistent?.resources.glitchUniforms.uniforms;
    expect(persistentUniforms).toBeDefined();
    if (!persistentUniforms) throw new Error("expected persistent glitch uniforms");
    expect(persistentUniforms).toMatchObject({
      uBlockJump: 0.5,
      uBurstJump: 0.25,
      uPixelScatter: 0.75,
      uColorNoise: 0.35,
      uSpeed: 0.8,
      uSeed: 12
    });

    const persistentTime = persistentUniforms.uTime;
    filterSystem.tick({ deltaMS: 50 } as Ticker);

    expect(persistentUniforms.uTime).toBeGreaterThan(persistentTime);

    effects.run(
      [
        {
          type: "glitch",
          power: 0.8,
          durationMs: 100,
          blockJump: 1.2,
          burstJump: 0.7,
          pixelScatter: 1.4,
          colorNoise: 0.6,
          speed: 1.25,
          seed: 21,
          wait: true
        }
      ],
      2
    );

    expect(root.children.some((child) => child.label === "glitch-overlay")).toBe(false);
    expect(tasks.snapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "screen-filter-transition", target: "glitch", revision: 1, status: "running" }),
        expect.objectContaining({ kind: "glitch", target: "screen", revision: 2, status: "running" })
      ])
    );
    const filters = root.filters as unknown as GlitchTestFilter[];
    expect(filters).toHaveLength(2);
    expect(filters[0]).toBe(persistent);
    const uniforms = filters[1]?.resources.glitchUniforms.uniforms;
    expect(uniforms).toBeDefined();
    if (!uniforms) throw new Error("expected one-shot glitch shader uniforms");
    expect(uniforms).toMatchObject({
      uPower: 0.8,
      uBlockJump: 1.2,
      uBurstJump: 0.7,
      uPixelScatter: 1.4,
      uColorNoise: 0.6,
      uSpeed: 1.25,
      uSeed: 21
    });
    expect(Array.from(uniforms.uResolution)).toEqual([960, 540]);

    const before = uniforms.uTime;
    tick(tweens, 50);

    expect(uniforms.uTime).toBeGreaterThan(before);
    expect(root.filters).toHaveLength(2);

    tick(tweens, 80);

    expect(tasks.snapshot()).toEqual([]);
    expect(root.filters).toHaveLength(1);
    expect((root.filters as unknown as GlitchTestFilter[])[0]).toBe(persistent);
    const settledPersistentTime = persistentUniforms.uTime;
    filterSystem.tick({ deltaMS: 1200 } as Ticker);

    expect(persistentUniforms.uTime).toBeGreaterThan(settledPersistentTime + 1);

    filterSystem.applyScreenFilters(
      { ...createInitialPixiStageSnapshot(), revision: 3 },
      true,
      [{ type: "screen-filter-remove", kind: "glitch", durationMs: 100, easing: "linear", wait: true }]
    );

    expect(root.filters).toHaveLength(1);
    expect(tasks.snapshot()).toMatchObject([{ kind: "screen-filter-transition", target: "glitch", revision: 3, status: "running" }]);

    tick(tweens, 120);

    expect(tasks.snapshot()).toEqual([]);
    expect(root.filters).toBeNull();
    expect(root.filterArea).toBeUndefined();
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

  it("renders rain through the shader renderer instead of legacy tiling sprites", () => {
    const { root, weather } = createSystems();
    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 0.9, durationMs: 0 }), 1), false);

    const rain = findWeatherContainer(root, "rain");
    expect(rain).toBeDefined();
    expect(rain?.children.some((child) => child instanceof TilingSprite)).toBe(false);
    const shader = rain?.children.find((child): child is Container => child instanceof Container && child.label === "weather:rain:shader");
    expect(shader).toBeDefined();
    const nearSurface = shader?.children[0] as Sprite | undefined;
    const filter = nearSurface?.filters?.[0] as { resources: { rainUniforms: { uniforms: Record<string, number | number[]> } } } | undefined;
    const uniforms = filter?.resources.rainUniforms.uniforms;
    expect(uniforms?.uRainFrameSize).toEqual(expect.arrayContaining([expect.any(Number), 1]));
    expect((uniforms?.uRainFrameSize as number[] | undefined)?.[0]).toBeGreaterThan(1);
    expect((uniforms?.uGuideResolution as number[] | undefined)?.[0]).toBeGreaterThan(960);
    expect(uniforms?.uGuideResolution).toEqual(expect.arrayContaining([expect.any(Number), 540]));
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

function createSystems(overrides: { assetResolver?: PixiAssetResolver; onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void } = {}) {
  const root = new Container({ label: "test-root" });
  const options = { root, width: () => 960, height: () => 540, ...overrides };
  const tweens = new TweenSystem();
  const tasks = new PresentationTaskController();
  const rootFilters = new RootFilterStack(options);
  const filters = new FilterSystem(options, rootFilters, tweens, tasks);
  const actors = new ActorSystem(options, filters, tweens, tasks);
  const weather = new WeatherSystem(options, filters, tweens, tasks);
  const effects = new TransientEffectSystem(options, actors, rootFilters, tweens, tasks);
  return { actors, effects, filters, root, tasks, tweens, weather };
}

type GlitchTestFilter = Filter & {
  resources: {
    glitchUniforms: {
      uniforms: {
        uTime: number;
        uProgress: number;
        uResolution: Float32Array;
        uPower: number;
        uBlockJump: number;
        uBurstJump: number;
        uPixelScatter: number;
        uColorNoise: number;
        uSpeed: number;
        uSeed: number;
      };
    };
  };
};

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

function stageWithActors(background: PixiActorSnapshot, characters: PixiActorSnapshot[]): PixiStageSnapshot {
  return {
    ...createInitialPixiStageSnapshot(),
    revision: 1,
    backgroundsById: { [background.id]: background },
    charactersById: Object.fromEntries(characters.map((actor) => [actor.id, actor])),
    actorOrder: [background.id, ...characters.map((actor) => actor.id)]
  };
}

function backgroundActor({ durationMs, wait = false }: { durationMs: number; wait?: boolean }): PixiActorSnapshot {
  return {
    id: "MainBackground",
    kind: "background",
    appearance: "bg:test",
    appearanceExpression: "",
    visible: true,
    alpha: 1,
    z: 0,
    filters: {},
    transition: { durationMs, lazy: false, wait }
  };
}

function characterActor(id: string, appearanceExpression: string): PixiActorSnapshot {
  return {
    id,
    kind: "character",
    appearanceExpression,
    visible: true,
    alpha: 1,
    z: 0,
    pos: [0.5, 0],
    filters: {},
    transition: { durationMs: 0, lazy: false, wait: false }
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

function weatherSnapshot({ power, durationMs }: { power: number; durationMs: number }): Extract<PixiWeatherSnapshot, { kind: "rain" }> {
  return {
    kind: "rain",
    commandParams: { power, wind: -1, hue: 215, tint: 0.55 },
    transition: { durationMs, lazy: false, wait: false }
  };
}

function snowWeatherSnapshot({ power, durationMs }: { power: number; durationMs: number }): Extract<PixiWeatherSnapshot, { kind: "snow" }> {
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(assertion: () => void | boolean): Promise<void> {
  let lastError: unknown;
  for (let index = 0; index < 20; index += 1) {
    try {
      const passed = assertion();
      if (passed === false) throw new Error("waitFor predicate returned false");
      return;
    } catch (error) {
      lastError = error;
      await flushPromises();
    }
  }
  throw lastError;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function characterPackUri(): string {
  return "https://assets.test/characters/Ema/character.json";
}

function installCharacterPackFetch(options: {
  includeInactiveMetadata?: boolean;
  mutatePack?: (pack: ReturnType<typeof characterPackFixture>) => void;
} = {}) {
  const pack = characterPackFixture();
  options.mutatePack?.(pack);
  const responses: Record<string, unknown> = {
    [characterPackUri()]: pack.character,
    "https://assets.test/characters/Ema/layers.json": pack.layers,
    "https://assets.test/characters/Ema/compositions.json": pack.compositions,
    "https://assets.test/characters/Ema/metadata/Body.json": pack.metadata.Body,
    "https://assets.test/characters/Ema/metadata/FacePensive.json": pack.metadata.FacePensive
  };
  if (options.includeInactiveMetadata !== false) {
    responses["https://assets.test/characters/Ema/metadata/FaceNormal.json"] = pack.metadata.FaceNormal;
  }
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const uri = String(input);
    const body = responses[uri];
    if (body === undefined) {
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({})
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => body
    } as Response;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function characterPackFixture() {
  return {
    character: {
      id: "Ema",
      defaultComposition: ["Default"],
      renderSpace: { stageScale: 10, defaultBounds: { min: [-1, 0], max: [1, 4] } }
    },
    layers: {
      groups: {
        Body: { layers: { Body: { src: "layers/Body.png", metadata: "metadata/Body.json" } } },
        Face: {
          layers: {
            FaceNormal: { src: "layers/FaceNormal.png", metadata: "metadata/FaceNormal.json" },
            FacePensive: { src: "layers/FacePensive.png", metadata: "metadata/FacePensive.json" }
          }
        }
      }
    },
    compositions: {
      tokens: {
        Default: ["Body>Body", "Face>FaceNormal"],
        Pensive1: ["Face>FacePensive"]
      }
    },
    metadata: {
      Body: layerMetadata("Body", 1, { x: 0, y: 1, z: 0 }),
      FaceNormal: layerMetadata("FaceNormal", 10, { x: 0, y: 2, z: 0 }),
      FacePensive: layerMetadata("FacePensive", 10, { x: 0.5, y: 2, z: 0 }, {
        pivot: { x: 0.25, y: 0.75 },
        rotationZ: 90,
        color: { r: 0.5, g: 0.25, b: 0.125, a: 0.5 },
        flipX: true
      })
    }
  };
}

function layerMetadata(
  name: string,
  drawOrder: number,
  position: { x: number; y: number; z: number },
  options: {
    pivot?: { x: number; y: number };
    rotationZ?: number;
    color?: { r: number; g: number; b: number; a: number };
    flipX?: boolean;
  } = {}
) {
  return {
    sourcePath: `Ema/${name}`,
    drawOrder,
    texture: { fileName: `${name}.png`, mimeType: "image/png", size: { width: 100, height: 200 } },
    sprite: {
      rect: { x: 0, y: 0, width: 100, height: 200 },
      pivot: options.pivot ?? { x: 0.5, y: 0.5 },
      pixelsPerUnit: 100
    },
    localTransform: {
      position,
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: options.rotationZ ?? 0 }
    },
    renderer: {
      color: options.color ?? { r: 1, g: 1, b: 1, a: 1 },
      flipX: options.flipX ?? false,
      flipY: false
    }
  };
}
