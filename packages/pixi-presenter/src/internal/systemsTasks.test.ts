import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureSource, TilingSprite, type Filter, type Renderer, type Ticker } from "pixi.js";
import type { PixiActorSnapshot, PixiStageSnapshot, PixiWeatherSnapshot } from "@v-ronpa/contracts";
import { INNER_BACKGROUND_ID, createInitialPixiStageSnapshot } from "@v-ronpa/pixi-stage-model";
import {
  ActorSystem,
  ActorFilterSystem,
  resolveInnerBackgroundFrameRect
} from "./systems";
import { PresentationTaskController } from "./presentationTasks";
import type { PixiAssetResolver, PixiPresenterDiagnostic } from "./assetResolver";
import { CharacterSystem } from "./characters";
import { TrialOverlaySystem } from "./effects/trialOverlay";
import { PersistentScreenEffectSystem } from "./effects/persistentScreen";
import { TweenSystem } from "./effects/animation";
import { RootFilterStack } from "./effects/rootFilterStack";
import { TransientEffectSystem } from "./effects/transient/system";
import { WeatherSystem } from "./effects/weather/system";

describe("pixi presentation task system integration", () => {
  const innerBackgroundImageInsetPx = 8;

  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
  });

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

  it("preloads character packs before ActorSystem starts synchronous reconciliation", async () => {
    const load = vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const fetch = installCharacterPackFetch();
    const resolverCalls: unknown[] = [];
    const { actors } = createSystems({
      assetResolver: {
        resolve(input) {
          resolverCalls.push(input);
          if (input.capability === "json") return { uri: characterPackUri() };
          return { uri: `/resolved/${input.id}.png` };
        }
      }
    });

    await actors.preloadCharacters([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);
    actors.reconcile(stageWithActors(
      backgroundActor({ durationMs: 0 }),
      [characterActor("Ema", "Pensive1")]
    ), false);

    expect(resolverCalls).toEqual([
      { id: "char/ema", capability: "json" },
      { id: "bg/test", capability: "image" }
    ]);
    expect(load).toHaveBeenCalledWith("/resolved/bg/test.png");
    expect(load).toHaveBeenCalledWith("https://assets.test/characters/Ema/layers/Body.png");
    expect(load).toHaveBeenCalledWith("https://assets.test/characters/Ema/layers/FacePensive.png");
    expect(fetch).toHaveBeenCalledWith(characterPackUri());
    expect(fetch).toHaveBeenCalledWith("https://assets.test/characters/Ema/layers.json");
    expect(fetch).toHaveBeenCalledWith("https://assets.test/characters/Ema/compositions.json");
    expect(fetch).toHaveBeenCalledWith("https://assets.test/characters/Ema/metadata/Body.json");
    expect(fetch).toHaveBeenCalledWith("https://assets.test/characters/Ema/metadata/FacePensive.json");
    expect(fetch).not.toHaveBeenCalledWith("https://assets.test/characters/Ema/metadata/FaceNormal.json");
  });

  it("renders inner backgrounds in a dedicated framed layer between main backgrounds and weather", async () => {
    const load = vi.spyOn(Assets, "load").mockResolvedValue(Texture.WHITE as never);
    const { actors, root } = createSystems({
      assetResolver: {
        resolve(input) {
          return { uri: `/resolved/${input.id}.png` };
        }
      }
    });

    actors.reconcile(stageWithInnerBackground(), false);

    const layers = root.children.filter((child): child is Container => child instanceof Container);
    expect(layers.map((layer) => [layer.label, layer.zIndex])).toEqual(
      expect.arrayContaining([
        ["backgrounds", 0],
        ["inner-backgrounds", 2],
        ["weather-back", 5],
        ["characters", 10],
        ["weather-front", 20]
      ])
    );
    const innerLayer = layers.find((layer) => layer.label === "inner-backgrounds");
    const innerActor = innerLayer?.children.find((child): child is Container => child instanceof Container && child.label === `actor:${INNER_BACKGROUND_ID}`);
    expect(innerActor).toBeDefined();
    const frameRoot = findDescendant(innerActor, `inner-background-frame:${INNER_BACKGROUND_ID}`, Container);
    const content = findDescendant(innerActor, `inner-background-content:${INNER_BACKGROUND_ID}`, Container);
    const matte = findDescendant(innerActor, "inner-background-matte");
    const mask = findDescendant(innerActor, `inner-background-mask:${INNER_BACKGROUND_ID}`);
    const stroke = findDescendant(innerActor, "inner-background-stroke");
    const fallback = findDescendant(innerActor, `fallback:${INNER_BACKGROUND_ID}`, Container);

    expect(frameRoot).toBeDefined();
    expect(matte).toBeDefined();
    expect(content?.mask).toBe(mask);
    expect(stroke).toBeDefined();
    expect(fallback?.visible).toBe(true);
    expect(load).toHaveBeenCalledWith("/resolved/bg/test.png");
    expect(load).toHaveBeenCalledWith("/resolved/bg/inner.png");

    const frame = resolveInnerBackgroundFrameRect(960, 540);
    const imageRect = insetFrame(frame, innerBackgroundImageInsetPx);
    await waitFor(() => {
      const sprite = findFirstDescendant(content, Sprite);
      expect(sprite?.visible).toBe(true);
      expect(sprite?.x).toBeLessThanOrEqual(imageRect.x);
      expect(sprite?.y).toBeLessThanOrEqual(imageRect.y);
      expect((sprite?.x ?? 0) + (sprite?.width ?? 0)).toBeGreaterThanOrEqual(imageRect.x + imageRect.width);
      expect((sprite?.y ?? 0) + (sprite?.height ?? 0)).toBeGreaterThanOrEqual(imageRect.y + imageRect.height);
      expect(fallback?.visible).toBe(false);
    });
  });

  it("uses a stable reference-style wide rect for inner background frames", () => {
    expect(resolveInnerBackgroundFrameRect(960, 540)).toEqual({ x: 112, y: 75, width: 735, height: 302 });
    expect(resolveInnerBackgroundFrameRect(1000, 1000)).toEqual({ x: 117, y: 138, width: 766, height: 559 });
  });

  it("relayouts main and inner backgrounds against the resized viewport without a new snapshot", async () => {
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.WHITE as never);
    const { actors, root, viewport } = createSystems({
      assetResolver: {
        resolve(input) {
          return { uri: `/resolved/${input.id}.png` };
        }
      }
    });

    actors.reconcile(stageWithInnerBackground({ includeCharacter: false }), false);

    const mainActor = findDescendant(root, "actor:MainBackground", Container);
    const mainSprite = findFirstDescendant(mainActor, Sprite);
    const innerActor = findDescendant(root, `actor:${INNER_BACKGROUND_ID}`, Container);
    const innerContent = findDescendant(innerActor, `inner-background-content:${INNER_BACKGROUND_ID}`, Container);
    const innerSprite = findFirstDescendant(innerContent, Sprite);
    await waitFor(() => {
      expect(mainSprite?.visible).toBe(true);
      expect(innerSprite?.visible).toBe(true);
    });

    viewport.width = 1280;
    viewport.height = 720;
    actors.relayoutViewport();

    const frame = resolveInnerBackgroundFrameRect(1280, 720);
    const imageRect = insetFrame(frame, innerBackgroundImageInsetPx);
    expect(mainSprite?.width).toBeCloseTo(1280);
    expect(mainSprite?.height).toBeCloseTo(1280);
    expect(mainSprite?.x).toBeCloseTo(0);
    expect(mainSprite?.y).toBeCloseTo(-280);
    expect(innerSprite?.x).toBeLessThanOrEqual(imageRect.x);
    expect(innerSprite?.y).toBeLessThanOrEqual(imageRect.y);
    expect((innerSprite?.x ?? 0) + (innerSprite?.width ?? 0)).toBeGreaterThanOrEqual(imageRect.x + imageRect.width);
    expect((innerSprite?.y ?? 0) + (innerSprite?.height ?? 0)).toBeGreaterThanOrEqual(imageRect.y + imageRect.height);
  });

  it("reprojects active actor position transitions on resize without settling presentation tasks", () => {
    const { actors, root, tasks, tweens, viewport } = createSystems();
    const first = { ...characterActor("Ema", "Pensive1"), pos: [0.2, 0] as [number, number] };
    const second = {
      ...characterActor("Ema", "Pensive1"),
      pos: [0.8, 0] as [number, number],
      transition: { durationMs: 100, easing: "linear", lazy: false, wait: true }
    };
    actors.reconcile(stageWithActors(backgroundActor({ durationMs: 0 }), [first], 1), false);
    actors.reconcile(stageWithActors(backgroundActor({ durationMs: 0 }), [second], 2), true);

    const ema = findDescendant(root, "actor:Ema", Container);
    tick(tweens, 50);
    expect(ema?.x).toBeCloseTo(480);
    expect(tasks.snapshot()).toMatchObject([{ kind: "actor-transition", target: "Ema", revision: 2, status: "running" }]);

    viewport.width = 1920;
    viewport.height = 1080;
    actors.relayoutViewport();

    expect(ema?.x).toBeCloseTo(960);
    expect(ema?.y).toBeCloseTo(972);
    expect(tasks.snapshot()).toMatchObject([{ kind: "actor-transition", target: "Ema", revision: 2, status: "running" }]);

    tick(tweens, 60);

    expect(ema?.x).toBeCloseTo(1536);
    expect(tasks.snapshot()).toEqual([]);
  });

  it("settles missing planned character packs to empty before reconciliation", async () => {
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

    await actors.preloadCharacters([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);
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
        assetId: "char/ema",
        capability: "json",
        message: "char/ema missing"
      },
      {
        source: "asset",
        code: "asset-missing",
        severity: "error",
        assetId: "bg/test",
        capability: "image",
        message: "bg/test missing"
      }
    ]);
  });

  it("emits diagnostics for missing inner background assets while keeping the framed fallback", () => {
    const load = vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const { actors, root } = createSystems({
      assetResolver: {
        resolve(input) {
          return { diagnostic: { code: "asset-missing", severity: "error", message: `${input.id} missing` } };
        }
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    });

    actors.reconcile(stageWithInnerBackground({ includeMainBackground: false, includeCharacter: false }), false);

    const innerActor = findDescendant(root, `actor:${INNER_BACKGROUND_ID}`, Container);
    expect(load).not.toHaveBeenCalled();
    expect(findDescendant(innerActor, `fallback:${INNER_BACKGROUND_ID}`, Container)).toBeDefined();
    expect(diagnostics).toEqual([
      {
        source: "asset",
        code: "asset-missing",
        severity: "error",
        assetId: "bg/inner",
        capability: "image",
        message: "bg/inner missing"
      }
    ]);
  });

  it("preloads every active layer before synchronous character instantiation", async () => {
    installCharacterPackFetch();
    const textureLoads = new Map<string, Deferred<Texture>>();
    vi.spyOn(Assets, "load").mockImplementation((uri) => {
      const deferred = createDeferred<Texture>();
      textureLoads.set(String(uri), deferred);
      return deferred.promise as never;
    });
    const upload = vi.fn().mockResolvedValue(undefined);
    const system = createCharacterSystem({
      renderer: { prepare: { upload } } as unknown as Renderer
    });

    const preload = system.preload([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);
    await waitFor(() => textureLoads.has("https://assets.test/characters/Ema/layers/Body.png"));
    await waitFor(() => textureLoads.has("https://assets.test/characters/Ema/layers/FacePensive.png"));
    textureLoads.get("https://assets.test/characters/Ema/layers/Body.png")?.resolve(textureWithSize(200, 400));
    await flushPromises();
    expect(upload).not.toHaveBeenCalled();
    textureLoads.get("https://assets.test/characters/Ema/layers/FacePensive.png")?.resolve(textureWithSize(300, 600));
    await preload;

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0]).toHaveLength(2);
    const presentation = system.createPresentation("Ema");
    presentation.replace(system.instantiate(characterActor("Ema", "Pensive1")), false);

    expect(presentation.root.label).toBe("final-character-root:Ema");
    expect(presentation.root.children).toHaveLength(1);
    expect(presentation.root.filters).toBeFalsy();
    const composition = presentation.root.children[0] as Container;
    expect(composition.label).toBe("layered-character:Ema:Pensive1");
    expect(composition.filters).toHaveLength(1);
    expect(outlineOpacity(composition)).toBe(1);
    const outlineFragment = (composition.filters?.[0] as Filter & { glProgram: { fragment: string } }).glProgram.fragment;
    expect(outlineFragment).toContain("vec4 outlinedColor = vec4(center.rgb + vec3(outerAlpha), center.a + outerAlpha);");
    expect(outlineFragment).toContain("finalColor = outlinedColor * uOpacity;");
    expect(composition.children).toHaveLength(2);
    expect(composition.children.map((child) => child.zIndex)).toEqual([1, 10]);
    const body = composition.children[0] as Sprite;
    const face = composition.children[1] as Sprite;
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

  it("applies one global tone after complete character composition and before outline", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockImplementation((uri) => Promise.resolve(
      String(uri).endsWith("/Body.png") ? textureWithSize(200, 400) : textureWithSize(300, 600)
    ) as never);
    const { actors, root } = createSystems({
      assetResolver: {
        resolve(input) {
          return input.capability === "json" && input.id === "char/ema"
            ? { uri: characterPackUri() }
            : { uri: `/resolved/${input.id}.png` };
        }
      }
    });
    await actors.preloadCharacters([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);
    actors.reconcile({
      ...stageWithActors(backgroundActor({ durationMs: 0 }), [characterActor("Ema", "Pensive1")], 1),
      characterTone: {
        preset: "rain",
        amount: 1,
        scopeScriptPath: "tone-test.nani",
        transition: { durationMs: 0, wait: false }
      }
    }, false);

    const presentation = findDescendant(root, "final-character-root:Ema", Container);
    const composition = presentation?.children[0] as Container;
    expect(composition.filters).toHaveLength(2);
    expect(filterResourceNames(composition)).toEqual([
      "characterToneUniforms",
      "characterOutlineUniforms"
    ]);
    expect(characterToneUniforms(composition).uToneAmount).toBe(1);
    expect(composition.children.every((child) => !child.filters?.length)).toBe(true);
    expect(findDescendant(root, "characters", Container)?.filters).toBeFalsy();
    expect(findDescendant(root, "actor:MainBackground", Container)?.filters).toBeFalsy();
    expect(outlineOpacity(composition)).toBe(1);
  });

  it("shares the live tone across expression crossfade sides and future characters", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const { actors, root } = createSystems({
      assetResolver: {
        resolve(input) {
          return input.capability === "json" && input.id === "char/ema" ? { uri: characterPackUri() } : {};
        }
      }
    });
    await actors.preloadCharacters([{ characterId: "Ema", appearanceExpressions: ["", "Pensive1"] }]);
    const toned = {
      ...stageWithActors(backgroundActor({ durationMs: 0 }), [], 1),
      characterTone: {
        preset: "fog" as const,
        amount: 1.25,
        scopeScriptPath: "tone-test.nani",
        transition: { durationMs: 0, wait: false }
      }
    };
    actors.reconcile(toned, false);
    actors.reconcile({
      ...toned,
      revision: 2,
      charactersById: { Ema: characterActor("Ema", "") },
      actorOrder: ["MainBackground", "Ema"]
    }, false);
    actors.reconcile({
      ...toned,
      revision: 3,
      charactersById: {
        Ema: {
          ...characterActor("Ema", "Pensive1"),
          transition: { durationMs: 200, easing: "linear", lazy: false, wait: true }
        }
      },
      actorOrder: ["MainBackground", "Ema"]
    }, true);

    const presentation = findDescendant(root, "final-character-root:Ema", Container);
    expect(presentation?.children).toHaveLength(2);
    const amounts = presentation?.children.map((child) => characterToneUniforms(child as Container).uToneAmount);
    expect(amounts).toEqual([1.25, 1.25]);
    expect(presentation?.children.map((child) => filterResourceNames(child as Container))).toEqual([
      ["characterToneUniforms", "characterOutlineUniforms"],
      ["characterToneUniforms", "characterOutlineUniforms"]
    ]);
  });

  it("runs one tone task without characters, continues interruption from live values, and cleans removal", () => {
    const { actors, root, tasks, tweens } = createSystems();
    actors.reconcile({
      ...createInitialPixiStageSnapshot(),
      revision: 1,
      characterTone: {
        preset: "rain",
        amount: 1,
        scopeScriptPath: "tone-test.nani",
        transition: { durationMs: 100, wait: true }
      }
    }, true);
    expect(tasks.snapshot()).toMatchObject([{
      kind: "character-tone-transition",
      target: "character-tone",
      revision: 1,
      status: "running"
    }]);

    tick(tweens, 50);
    actors.reconcile({
      ...createInitialPixiStageSnapshot(),
      revision: 2,
      characterTone: {
        preset: "sunset",
        amount: 2,
        scopeScriptPath: "tone-test.nani",
        transition: { durationMs: 100, wait: true }
      }
    }, true);
    expect(tasks.snapshot()).toMatchObject([{
      kind: "character-tone-transition",
      target: "character-tone",
      revision: 2,
      status: "running"
    }]);

    tick(tweens, 110);
    expect(tasks.snapshot()).toEqual([]);
    actors.reconcile(
      { ...createInitialPixiStageSnapshot(), revision: 3 },
      true,
      [{ type: "character-tone-remove", durationMs: 100, scopeScriptPath: "tone-test.nani", wait: true }]
    );
    expect(tasks.snapshot()).toMatchObject([{
      kind: "character-tone-transition",
      target: "character-tone",
      revision: 3,
      status: "running"
    }]);
    tick(tweens, 110);
    expect(tasks.snapshot()).toEqual([]);
    expect(findDescendant(root, "characters", Container)?.filters).toBeFalsy();
  });

  it("deduplicates pack, metadata, textures, and GPU uploads across planned expressions", async () => {
    const fetch = installCharacterPackFetch();
    const bodyTexture = textureWithSize(200, 400);
    const normalTexture = textureWithSize(300, 600);
    const pensiveTexture = textureWithSize(300, 600);
    const load = vi.spyOn(Assets, "load").mockImplementation((uri) => {
      const value = String(uri);
      if (value.endsWith("/FaceNormal.png")) return Promise.resolve(normalTexture) as never;
      if (value.endsWith("/FacePensive.png")) return Promise.resolve(pensiveTexture) as never;
      return Promise.resolve(bodyTexture) as never;
    });
    const upload = vi.fn().mockResolvedValue(undefined);
    const system = createCharacterSystem({
      renderer: { prepare: { upload } } as unknown as Renderer
    });

    await system.preload([{ characterId: "Ema", appearanceExpressions: ["", "Pensive1"] }]);

    expect(fetch).toHaveBeenCalledTimes(6);
    expect(load).toHaveBeenCalledTimes(3);
    expect(load.mock.calls.filter(([uri]) => String(uri).endsWith("/Body.png"))).toHaveLength(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([bodyTexture, normalTexture, pensiveTexture]));
  });

  it("mixes complete outlined compositions additively inside one isolated transition target", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockImplementation((uri) => Promise.resolve(
      String(uri).endsWith("/Body.png") ? textureWithSize(200, 400) : textureWithSize(300, 600)
    ) as never);
    const system = createCharacterSystem();
    await system.preload([{ characterId: "Ema", appearanceExpressions: ["", "Pensive1"] }]);
    const presentation = system.createPresentation("Ema");

    presentation.replace(system.instantiate(characterActor("Ema", "")), false);
    const outgoingComposition = presentation.root.children[0] as Container;
    const outgoingFilter = outgoingComposition.filters?.[0] as Filter & { glProgram: unknown };
    const outgoingDestroy = vi.spyOn(outgoingFilter, "destroy");
    const transition = presentation.replace(system.instantiate(characterActor("Ema", "Pensive1")), true);
    const incomingComposition = presentation.root.children[1] as Container;
    const incomingFilter = incomingComposition.filters?.[0] as Filter & { glProgram: unknown };
    const isolationFilter = presentation.root.filters?.[0] as Filter & { glProgram: { fragment: string } };

    expect(presentation.root.filters).toEqual([isolationFilter]);
    expect(isolationFilter.blendMode).toBe("normal");
    expect(isolationFilter.padding).toBe(2);
    expect(isolationFilter.glProgram.fragment).toContain("finalColor = texture(uTexture, vTextureCoord) * uOpacity;");
    expect(presentation.root.children).toHaveLength(2);
    expect(presentation.root.children.every((child) => child.alpha === 1)).toBe(true);
    expect(transition?.outgoing.value).toBe(1);
    expect(transition?.incoming.value).toBe(0);
    expect(outlineOpacity(outgoingComposition)).toBe(1);
    expect(outlineOpacity(incomingComposition)).toBe(0);
    expect(outgoingFilter).not.toBe(incomingFilter);
    expect(outgoingFilter.glProgram).toBe(incomingFilter.glProgram);
    expect(outgoingFilter.blendMode).toBe("normal");
    expect(incomingFilter.blendMode).toBe("add");
    const outgoingBody = outgoingComposition.children[0] as Sprite;
    const incomingBody = incomingComposition.children[0] as Sprite;
    expect(incomingBody.texture).toBe(outgoingBody.texture);
    expect(matrixValues(incomingBody.getGlobalTransform())).toEqual(matrixValues(outgoingBody.getGlobalTransform()));
    expect(presentation.root.children.map((child) => child.label)).toEqual([
      "layered-character:Ema:default",
      "layered-character:Ema:Pensive1"
    ]);

    transition?.settle();
    expect(presentation.root.filters).toBeNull();
    expect(presentation.root.children).toHaveLength(1);
    expect(presentation.root.children[0]?.label).toBe("layered-character:Ema:Pensive1");
    expect(presentation.root.children[0]?.alpha).toBe(1);
    expect(presentation.root.children[0]?.filters).toEqual([incomingFilter]);
    expect(incomingFilter.blendMode).toBe("normal");
    expect(outlineOpacity(presentation.root.children[0] as Container)).toBe(1);
    expect(outgoingDestroy).toHaveBeenCalledTimes(1);
  });

  it("starts the full actor-transition clock only after both crossfade compositions exist", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const { actors, root, tasks, tweens } = createSystems({
      assetResolver: {
        resolve(input) {
          return input.capability === "json" && input.id === "char/ema" ? { uri: characterPackUri() } : { uri: `/resolved/${input.id}.png` };
        }
      }
    });
    await actors.preloadCharacters([{ characterId: "Ema", appearanceExpressions: ["", "Pensive1"] }]);
    const initial = characterActor("Ema", "");
    actors.reconcile(stageWithActors(backgroundActor({ durationMs: 0 }), [initial], 1), false);
    const next = {
      ...characterActor("Ema", "Pensive1"),
      transition: { durationMs: 200, easing: "linear", lazy: false, wait: true }
    };

    actors.reconcile(stageWithActors(backgroundActor({ durationMs: 0 }), [next], 2), true);

    const finalRoot = findDescendant(root, "final-character-root:Ema", Container);
    expect(finalRoot?.children).toHaveLength(2);
    expect(finalRoot?.filters).toHaveLength(1);
    expect(finalRoot?.children.map((child) => child.alpha)).toEqual([1, 1]);
    expect(finalRoot?.children.map((child) => outlineOpacity(child as Container))).toEqual([1, 0]);
    expect(finalRoot?.children.map((child) => child.filters?.[0]?.blendMode)).toEqual(["normal", "add"]);
    expect(tasks.snapshot()).toMatchObject([{
      kind: "actor-transition",
      target: "Ema",
      revision: 2,
      durationMs: 200,
      status: "running",
      startedAtMs: 0
    }]);

    tick(tweens, 100);
    expect(finalRoot?.children.map((child) => child.alpha)).toEqual([1, 1]);
    expect(outlineOpacity(finalRoot?.children[0] as Container)).toBeCloseTo(0.5);
    expect(outlineOpacity(finalRoot?.children[1] as Container)).toBeCloseTo(0.5);
    const checkpoints = [0, 0.25, 0.5, 0.75, 1];
    expect(checkpoints.map((progress) => premultipliedCrossfadeAlpha(1, 1, progress))).toEqual([1, 1, 1, 1, 1]);
    expect(checkpoints.map((progress) => premultipliedCrossfadeAlpha(1, 0, progress))).toEqual([1, 0.75, 0.5, 0.25, 0]);
    expect(checkpoints.map((progress) => premultipliedCrossfadeAlpha(0, 1, progress))).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(checkpoints.map((progress) => sourceOverCrossfadeAlpha(1, 1, progress))).toEqual([1, 0.8125, 0.75, 0.8125, 1]);
    expect(tasks.snapshot()).toHaveLength(1);

    tick(tweens, 110);
    expect(finalRoot?.children).toHaveLength(1);
    expect(finalRoot?.filters).toBeNull();
    expect(finalRoot?.children[0]?.label).toBe("layered-character:Ema:Pensive1");
    expect(tasks.snapshot()).toEqual([]);
  });

  it("settles parent alpha and content to target when animation is synchronously skipped", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const { actors, root, tasks } = createSystems({
      assetResolver: {
        resolve(input) {
          return input.capability === "json" && input.id === "char/ema" ? { uri: characterPackUri() } : {};
        }
      }
    });
    await actors.preloadCharacters([{ characterId: "Ema", appearanceExpressions: [""] }]);
    const actor = {
      ...characterActor("Ema", ""),
      transition: { durationMs: 200, easing: "linear", lazy: false, wait: true }
    };

    actors.reconcile(stageWithActors(backgroundActor({ durationMs: 0 }), [actor], 1), true);
    const actorRoot = findDescendant(root, "actor:Ema", Container);
    const finalRoot = findDescendant(root, "final-character-root:Ema", Container);
    expect(actorRoot?.alpha).toBe(1);
    expect(outlineOpacity(finalRoot?.children[0] as Container)).toBe(0);
    expect(tasks.snapshot()).toHaveLength(1);

    tasks.settleAllNonHold();

    expect(actorRoot?.alpha).toBe(1);
    expect(outlineOpacity(finalRoot?.children[0] as Container)).toBe(1);
    expect(actorRoot?.visible).toBe(true);
    expect(tasks.snapshot()).toEqual([]);
  });

  it("settles an interrupted token transition to its target before starting the replacement", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const { actors, root, tasks, tweens } = createSystems({
      assetResolver: {
        resolve(input) {
          return input.capability === "json" && input.id === "char/ema" ? { uri: characterPackUri() } : {};
        }
      }
    });
    await actors.preloadCharacters([{ characterId: "Ema", appearanceExpressions: ["", "Pensive1"] }]);
    actors.reconcile(stageWithActors(backgroundActor({ durationMs: 0 }), [characterActor("Ema", "")], 1), false);
    const transition = { durationMs: 200, easing: "linear", lazy: false, wait: true };
    actors.reconcile(stageWithActors(backgroundActor({ durationMs: 0 }), [{
      ...characterActor("Ema", "Pensive1"),
      transition
    }], 2), true);
    const firstIsolationFilter = findDescendant(root, "final-character-root:Ema", Container)?.filters?.[0];
    tick(tweens, 50);

    actors.reconcile(stageWithActors(backgroundActor({ durationMs: 0 }), [{
      ...characterActor("Ema", ""),
      transition
    }], 3), true);

    const finalRoot = findDescendant(root, "final-character-root:Ema", Container);
    expect(finalRoot?.filters?.[0]).toBe(firstIsolationFilter);
    expect(finalRoot?.children.map((child) => [child.label, outlineOpacity(child as Container)])).toEqual([
      ["layered-character:Ema:Pensive1", 1],
      ["layered-character:Ema:default", 0]
    ]);
    expect(tasks.snapshot()).toMatchObject([{ revision: 3, status: "running" }]);

    tick(tweens, 210);
    expect(finalRoot?.children.map((child) => child.label)).toEqual(["layered-character:Ema:default"]);
    expect(finalRoot?.filters).toBeNull();
    expect(tasks.snapshot()).toEqual([]);
  });

  it("uses isolated complete-composition mixing when outlines are disabled", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const system = createCharacterSystem({ characterOutlineEnabled: false });
    await system.preload([{ characterId: "Ema", appearanceExpressions: ["", "Pensive1"] }]);
    const presentation = system.createPresentation("Ema");

    presentation.replace(system.instantiate(characterActor("Ema", "")), false);
    const transition = presentation.replace(system.instantiate(characterActor("Ema", "Pensive1")), true);

    expect(presentation.root.filters).toHaveLength(1);
    expect(presentation.root.children).toHaveLength(2);
    expect(presentation.root.children.map((child) => child.filters?.length)).toEqual([1, 1]);
    const disabledFilters = [
      presentation.root.filters?.[0],
      presentation.root.children[0]?.filters?.[0],
      presentation.root.children[1]?.filters?.[0]
    ] as Array<Filter & { glProgram: unknown }>;
    expect(disabledFilters.every((filter) => filter.glProgram === disabledFilters[0]?.glProgram)).toBe(true);
    expect(presentation.root.children.map((child) => child.filters?.[0]?.blendMode)).toEqual(["normal", "add"]);
    expect(presentation.root.children.map((child) => child.alpha)).toEqual([1, 1]);
    expect(presentation.root.children.map((child) => finalOpacity(child as Container))).toEqual([1, 0]);
    if (transition) {
      transition.outgoing.value = 0.5;
      transition.incoming.value = 0.5;
      transition.syncOutgoing();
      transition.syncIncoming();
    }
    expect(presentation.root.children.map((child) => finalOpacity(child as Container))).toEqual([0.5, 0.5]);
    transition?.settle();
    expect(presentation.root.filters).toBeNull();
    expect(presentation.root.children).toHaveLength(1);
    expect(presentation.root.children[0]?.filters).toBeNull();
  });

  it("isolates disabled-outline actor opacity only while a final-output pass is required", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const system = createCharacterSystem({ characterOutlineEnabled: false });
    await system.preload([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);
    const presentation = system.createPresentation("Ema");
    presentation.replace(system.instantiate(characterActor("Ema", "Pensive1")), false);
    const composition = presentation.root.children[0] as Container;
    expect(composition.filters).toBeFalsy();

    presentation.opacity.value = 0.5;
    presentation.syncOpacity();
    const opacityFilter = composition.filters?.[0] as Filter;
    const destroy = vi.spyOn(opacityFilter, "destroy");
    expect(composition.alpha).toBe(1);
    expect(finalOpacity(composition)).toBe(0.5);

    presentation.opacity.value = 1;
    presentation.syncOpacity();
    expect(composition.filters).toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("applies actor alpha after the outline instead of attenuating Filter input coverage", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const { actors, root, tweens } = createSystems({
      assetResolver: {
        resolve(input) {
          return input.capability === "json" && input.id === "char/ema" ? { uri: characterPackUri() } : {};
        }
      }
    });
    await actors.preloadCharacters([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);
    const initial = {
      ...characterActor("Ema", "Pensive1"),
      alpha: 0.5,
      transition: { durationMs: 0, easing: "linear", lazy: false, wait: false }
    };
    actors.reconcile(stageWithActors(backgroundActor({ durationMs: 0 }), [initial], 1), false);

    const actorRoot = findDescendant(root, "actor:Ema", Container);
    const finalRoot = findDescendant(root, "final-character-root:Ema", Container);
    const composition = finalRoot?.children[0] as Container;
    expect(actorRoot?.alpha).toBe(1);
    expect(finalRoot?.alpha).toBe(1);
    expect(composition.alpha).toBe(1);
    expect(outlineOpacity(composition)).toBe(0.5);

    actors.reconcile(stageWithActors(backgroundActor({ durationMs: 0 }), [{
      ...initial,
      alpha: 0.25,
      transition: { durationMs: 200, easing: "linear", lazy: false, wait: true }
    }], 2), true);
    tick(tweens, 100);

    expect(actorRoot?.alpha).toBe(1);
    expect(composition.alpha).toBe(1);
    expect(outlineOpacity(composition)).toBeCloseTo(0.375);
  });

  it("derives the outline sampling vectors from one source texel and the full actor transform", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const viewport = { height: 540 };
    const system = createCharacterSystem({ height: () => viewport.height });
    await system.preload([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);
    const actorRoot = new Container();
    actorRoot.scale.set(1.5);
    actorRoot.rotation = Math.PI / 2;
    const presentation = system.createPresentation("Ema");
    actorRoot.addChild(presentation.root);
    presentation.replace(system.instantiate(characterActor("Ema", "Pensive1")), false);

    viewport.height = 1080;
    presentation.relayout();
    presentation.syncOutlineTransform();

    const composition = presentation.root.children[0] as Container;
    const uniforms = outlineUniforms(composition);
    expect(Math.hypot(...uniforms.uStepX)).toBeCloseTo(0.3);
    expect(Math.hypot(...uniforms.uStepY)).toBeCloseTo(0.3);
    expect(Math.abs(uniforms.uStepX[0] ?? 0)).toBeLessThan(1e-6);
    expect(Math.abs(uniforms.uStepY[1] ?? 0)).toBeLessThan(1e-6);
    expect((composition.filters?.[0] as Filter).padding).toBe(2);
  });

  it("keeps a legitimately empty planned expression empty without loading textures", async () => {
    installCharacterPackFetch();
    const load = vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const system = createCharacterSystem({ onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) });

    await system.preload([{ characterId: "Ema", appearanceExpressions: ["Body-,Face-"] }]);
    const instance = system.instantiate(characterActor("Ema", "Body-,Face-"));

    expect(instance.container.label).toBe("layered-character:Ema:Body-,Face-");
    expect(instance.container.children).toEqual([]);
    expect(load).not.toHaveBeenCalled();
    expect(diagnostics).toEqual([]);
  });

  it("caches failed planned expressions as strict empty results and never retries at runtime", async () => {
    installCharacterPackFetch();
    let faceAttempts = 0;
    vi.spyOn(Assets, "load").mockImplementation((uri) => {
      if (String(uri).endsWith("/FacePensive.png")) {
        faceAttempts += 1;
        return Promise.reject(new Error("network failed")) as never;
      }
      return Promise.resolve(Texture.EMPTY) as never;
    });
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const system = createCharacterSystem({ onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) });

    await system.preload([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);
    const first = system.instantiate(characterActor("Ema", "Pensive1"));
    const second = system.instantiate(characterActor("Ema", "Pensive1"));

    expect(first.container.label).toBe("empty-character:Ema:Pensive1");
    expect(second.container.label).toBe("empty-character:Ema:Pensive1");
    expect(faceAttempts).toBe(1);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("FacePensive.png");
  });

  it("settles GPU upload failures to diagnosed empty results instead of rejecting readiness", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const system = createCharacterSystem({
      renderer: {
        prepare: { upload: vi.fn().mockRejectedValue(new Error("context upload failed")) }
      } as unknown as Renderer,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    });

    await expect(system.preload([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }])).resolves.toEqual({
      ok: false,
      failures: [{ characterId: "Ema", expression: "Pensive1" }]
    });
    const instance = system.instantiate(characterActor("Ema", "Pensive1"));

    expect(instance.container.label).toBe("empty-character:Ema:Pensive1");
    expect(diagnostics).toMatchObject([{ code: "asset-load-failed", assetId: "Ema" }]);
    expect(diagnostics[0]?.message).toContain("context upload failed");
  });

  it("rejects unplanned expressions synchronously without resolving or loading assets", async () => {
    const resolve = vi.fn();
    const load = vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const system = createCharacterSystem({
      assetResolver: { resolve },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    });
    await system.preload([]);

    const first = system.instantiate(characterActor("Ema", "Pensive1"));
    const second = system.instantiate(characterActor("Ema", "Pensive1"));

    expect(first.container.label).toBe("empty-character:Ema:Pensive1");
    expect(second.container.label).toBe("empty-character:Ema:Pensive1");
    expect(resolve).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(diagnostics).toMatchObject([{ code: "asset-unprepared-character-expression", assetId: "Ema" }]);
  });

  it("rejects invalid source-pixel scale without an unoutlined fallback", async () => {
    installCharacterPackFetch({
      mutateMetadata(metadata) {
        metadata.FacePensive.localTransform.scale.x = 0;
      }
    });
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const system = createCharacterSystem({ onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) });

    await system.preload([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);
    const instance = system.instantiate(characterActor("Ema", "Pensive1"));

    expect(instance.container.label).toBe("empty-character:Ema:Pensive1");
    expect(diagnostics).toMatchObject([{
      code: "asset-invalid-character-source-pixel-scale",
      severity: "error",
      assetId: "Ema",
      capability: "json"
    }]);
  });

  it("does not load metadata hidden by a planned expression", async () => {
    const fetch = installCharacterPackFetch({ includeInactiveMetadata: false });
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const diagnostics: PixiPresenterDiagnostic[] = [];
    const system = createCharacterSystem({ onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) });

    await system.preload([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);

    expect(fetch).not.toHaveBeenCalledWith("https://assets.test/characters/Ema/metadata/FaceNormal.json");
    expect(diagnostics).toEqual([]);
  });

  it("destroys the active composition filter without destroying Assets-owned textures", async () => {
    installCharacterPackFetch();
    const bodyTexture = textureWithSize(200, 400);
    const faceTexture = textureWithSize(300, 600);
    const bodyDestroy = vi.spyOn(bodyTexture, "destroy");
    const faceDestroy = vi.spyOn(faceTexture, "destroy");
    vi.spyOn(Assets, "load").mockImplementation((uri) => Promise.resolve(
      String(uri).endsWith("/FacePensive.png") ? faceTexture : bodyTexture
    ) as never);
    const system = createCharacterSystem();
    await system.preload([{ characterId: "Ema", appearanceExpressions: ["Pensive1"] }]);
    const presentation = system.createPresentation("Ema");
    presentation.replace(system.instantiate(characterActor("Ema", "Pensive1")), false);
    const filter = presentation.root.children[0]?.filters?.[0] as Filter;
    const filterDestroy = vi.spyOn(filter, "destroy");

    presentation.destroy();
    presentation.destroy();
    system.destroy();

    expect(filterDestroy).toHaveBeenCalledTimes(1);
    expect(bodyDestroy).not.toHaveBeenCalled();
    expect(faceDestroy).not.toHaveBeenCalled();
  });

  it("destroys the lazily shared crossfade isolation filter with the presentation", async () => {
    installCharacterPackFetch();
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    const system = createCharacterSystem();
    await system.preload([{ characterId: "Ema", appearanceExpressions: ["", "Pensive1"] }]);
    const presentation = system.createPresentation("Ema");
    presentation.replace(system.instantiate(characterActor("Ema", "")), false);
    presentation.replace(system.instantiate(characterActor("Ema", "Pensive1")), true);
    const isolationFilter = presentation.root.filters?.[0] as Filter;
    const destroy = vi.spyOn(isolationFilter, "destroy");

    presentation.destroy();
    presentation.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
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
    const viewport = { width: 960, height: 540 };
    const stack = new RootFilterStack({ root, width: () => viewport.width, height: () => viewport.height });
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

    viewport.width = 1280;
    viewport.height = 720;
    stack.relayoutViewport();
    expect(root.filterArea).toEqual(new Rectangle(0, 0, 1280, 720));

    stack.clear();
    expect(root.filters).toBeNull();
    expect(root.filterArea).toBeUndefined();
  });

  it("relayouts bokeh overlays for the resized viewport without a new reconcile", () => {
    const { root, screen, viewport } = createSystems();
    screen.reconcile(stageWithBokeh(0.8, 1), false, []);
    const layer = findDescendant(root, "screen-filter-overlays", Container);
    const firstBefore = layer?.children[0] as Sprite | undefined;
    expect(firstBefore).toBeDefined();
    const beforeX = firstBefore?.x ?? 0;

    viewport.width = 1280;
    viewport.height = 720;
    screen.relayoutViewport();

    const firstAfter = layer?.children[0] as Sprite | undefined;
    expect(firstAfter).toBeDefined();
    expect(firstAfter).not.toBe(firstBefore);
    expect(firstAfter?.x).toBeGreaterThan(beforeX);
    expect(firstAfter?.x).toBeLessThanOrEqual(1280);
    expect(firstAfter?.y).toBeLessThanOrEqual(720);
  });

  it("interpolates bokeh blur and overlay power without repopulating during tween", () => {
    const { root, screen, tweens } = createSystems();
    screen.reconcile(stageWithBokeh(0.2, 1), false, []);
    const layer = findDescendant(root, "screen-filter-overlays", Container);
    expect(layer?.children).toHaveLength(3);

    screen.reconcile(stageWithBokeh(0.8, 2, 100), true, []);
    const firstAfterLayoutSwitch = layer?.children[0];

    expect(layer?.children).toHaveLength(6);
    expect(bokehFilter(root).strength).toBeCloseTo(1.6);

    tick(tweens, 50);

    expect(layer?.children[0]).toBe(firstAfterLayoutSwitch);
    expect(layer?.alpha).toBeCloseTo(0.675);
    expect((layer?.children[0] as Sprite | undefined)?.alpha).toBeCloseTo(0.49);
    expect(bokehFilter(root).strength).toBeCloseTo(4);

    tick(tweens, 60);

    expect(layer?.children[0]).toBe(firstAfterLayoutSwitch);
    expect(layer?.alpha).toBeCloseTo(0.81);
    expect(bokehFilter(root).strength).toBeCloseTo(6.4);
  });

  it("fades bokeh overlays and root blur to zero before cleanup", () => {
    const { root, screen, tweens } = createSystems();
    screen.reconcile(stageWithBokeh(0.8, 1), false, []);
    const layer = findDescendant(root, "screen-filter-overlays", Container);
    const removalHints = [{ type: "screen-filter-remove" as const, kind: "bokeh" as const, durationMs: 100, easing: "linear", wait: true }];
    const empty = { ...createInitialPixiStageSnapshot(), revision: 2 };

    screen.reconcile(empty, true, removalHints);

    expect(layer?.children.length).toBeGreaterThan(0);
    expect(root.filters).not.toBeNull();

    tick(tweens, 50);

    expect(layer?.alpha).toBeCloseTo(0.63);
    expect(bokehFilter(root).strength).toBeCloseTo(3.2);

    tick(tweens, 60);

    expect(layer?.children).toHaveLength(0);
    expect(root.filters).toBeNull();
  });

  it("composes persistent and one-shot glitch filters without stale cleanup", () => {
    const { effects, screen, root, tasks, tweens } = createSystems();
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

    screen.reconcile(stage, true, []);

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
    screen.tick({ deltaMS: 50 } as Ticker);

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
    screen.tick({ deltaMS: 1200 } as Ticker);

    expect(persistentUniforms.uTime).toBeGreaterThan(settledPersistentTime + 1);

    screen.reconcile(
      { ...createInitialPixiStageSnapshot(), revision: 3 },
      true,
      [{ type: "screen-filter-remove", kind: "glitch", durationMs: 100, easing: "linear", wait: true }]
    );

    expect(root.filters).toHaveLength(1);
    expect(tasks.snapshot()).toMatchObject([{ kind: "screen-filter-transition", target: "glitch", revision: 3, status: "running" }]);

    tick(tweens, 50);

    expect(persistentUniforms.uPower).toBeCloseTo(0.225);
    expect(root.filters).toHaveLength(1);

    tick(tweens, 70);

    expect(tasks.snapshot()).toEqual([]);
    expect(root.filters).toBeNull();
    expect(root.filterArea).toBeUndefined();
  });

  it("interpolates persistent glitch filter params and switches seed immediately", () => {
    const { screen, root, tweens } = createSystems();
    const initial: PixiStageSnapshot = {
      ...createInitialPixiStageSnapshot(),
      revision: 1,
      screenFilters: {
        glitch: {
          power: 0.2,
          blockJump: 0.2,
          speed: 0.4,
          seed: 3,
          transition: { durationMs: 0, easing: "linear", lazy: false, wait: false }
        }
      }
    };
    screen.reconcile(initial, false, []);
    const uniforms = ((root.filters as unknown as GlitchTestFilter[])[0]?.resources.glitchUniforms.uniforms);
    expect(uniforms).toBeDefined();
    if (!uniforms) throw new Error("expected glitch uniforms");

    screen.reconcile(
      {
        ...createInitialPixiStageSnapshot(),
        revision: 2,
        screenFilters: {
          glitch: {
            power: 0.8,
            blockJump: 1.2,
            speed: 1.4,
            seed: 9,
            transition: { durationMs: 100, easing: "linear", lazy: false, wait: true }
          }
        }
      },
      true,
      []
    );

    expect(uniforms.uSeed).toBe(9);
    expect(uniforms.uPower).toBeCloseTo(0.2);
    expect(uniforms.uBlockJump).toBeCloseTo(0.2);
    expect(uniforms.uSpeed).toBeCloseTo(0.4);

    tick(tweens, 50);

    expect(uniforms.uPower).toBeCloseTo(0.5);
    expect(uniforms.uBlockJump).toBeCloseTo(0.7);
    expect(uniforms.uSpeed).toBeCloseTo(0.9);

    tick(tweens, 60);

    expect(uniforms.uPower).toBeCloseTo(0.8);
    expect(uniforms.uBlockJump).toBeCloseTo(1.2);
    expect(uniforms.uSpeed).toBeCloseTo(1.4);
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

  it("interpolates rain live shader params and alpha over the requested duration", () => {
    const { root, tasks, tweens, weather } = createSystems();
    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 1, durationMs: 500 }), 1), true);
    const rain = findWeatherContainer(root, "rain");
    expect(rain?.alpha).toBeCloseTo(0);
    expect((rainUniforms(root).uMidDensity as number[])[0]).toBeCloseTo(0);

    tick(tweens, 250);

    const midDensity = (rainUniforms(root).uMidDensity as number[])[0] ?? 0;
    expect(rain?.alpha).toBeCloseTo(0.5);
    expect(midDensity).toBeGreaterThan(0);
    expect(midDensity).toBeLessThan(2);
    expect(tasks.snapshot()).toMatchObject([{ kind: "weather-transition", target: "rain", revision: 1, status: "running" }]);

    tick(tweens, 260);

    expect(rain?.alpha).toBeCloseTo(1);
    expect((rainUniforms(root).uMidDensity as number[])[0]).toBeCloseTo(2);
    expect(tasks.snapshot()).toEqual([]);
  });

  it("continues interrupted rain transitions from the current live power", () => {
    const { root, tweens, weather } = createSystems();
    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 0.8, durationMs: 1000 }), 1), true);
    const rain = findWeatherContainer(root, "rain");
    tick(tweens, 250);
    expect(rain?.alpha).toBeCloseTo(0.2);

    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 0.4, durationMs: 500 }), 2), true);

    expect(rain?.alpha).toBeCloseTo(0.2);
    tick(tweens, 250);
    expect(rain?.alpha).toBeCloseTo(0.3);
  });

  it("settles an interrupted rain task when the replacement transition is immediate", () => {
    const { root, tasks, tweens, weather } = createSystems();
    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 1, durationMs: 1000 }), 1), true);
    const rain = findWeatherContainer(root, "rain");
    tick(tweens, 250);
    expect(rain?.alpha).toBeCloseTo(0.25);
    expect(tasks.snapshot()).toMatchObject([{ kind: "weather-transition", target: "rain", revision: 1, status: "running" }]);

    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 0.3, durationMs: 0 }), 2), true);

    expect(rain?.alpha).toBeCloseTo(0.3);
    expect(tasks.snapshot()).toEqual([]);
  });

  it("fades rain live power to zero before removing the weather record", () => {
    const { root, tweens, weather } = createSystems();
    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 0.8, durationMs: 0 }), 1), false);
    const rain = findWeatherContainer(root, "rain");
    weather.reconcile(
      { ...createInitialPixiStageSnapshot(), revision: 2 },
      true,
      [{ type: "weather-remove", kind: "rain", durationMs: 100, easing: "linear", wait: true }]
    );

    expect(rain?.alpha).toBeCloseTo(0.8);
    tick(tweens, 50);

    expect(rain?.alpha).toBeCloseTo(0.4);
    expect((rainUniforms(root).uMidDensity as number[])[0]).toBeGreaterThan(0);

    tick(tweens, 60);

    expect(findWeatherContainer(root, "rain")).toBeUndefined();
  });

  it("interpolates shader snow controls while switching seed immediately", () => {
    const { root, tweens, weather } = createSystems();
    weather.reconcile(stageWithWeather(snowWeatherSnapshot({ power: 0.2, density: 0.4, seed: 7, durationMs: 0 }), 1), false);
    weather.reconcile(stageWithWeather(snowWeatherSnapshot({ power: 0.8, density: 1.4, seed: 23, durationMs: 100 }), 2), true);
    const uniforms = snowUniforms(root);

    expect(uniforms.uSeed).toBe(23);
    expect(uniforms.uPower).toBeCloseTo(0.2);
    expect(uniforms.uDensity).toBeCloseTo(0.4);

    tick(tweens, 50);

    expect(uniforms.uSeed).toBe(23);
    expect(uniforms.uPower).toBeCloseTo(0.5);
    expect(uniforms.uDensity).toBeCloseTo(0.9);

    tick(tweens, 60);

    expect(uniforms.uPower).toBeCloseTo(0.8);
    expect(uniforms.uDensity).toBeCloseTo(1.4);
  });

  it("interpolates sun power and scale while keeping the filter stable", () => {
    const { root, tweens, weather } = createSystems();
    weather.reconcile(stageWithWeather(sunWeatherSnapshot({ power: 0.2, scale: 1, durationMs: 0 }), 1), false);
    const sun = findWeatherContainer(root, "sun");
    const particle = sun?.children[0] as Sprite | undefined;
    const initialFilter = sun?.filters?.[0] as { gain?: number } | undefined;

    expect(sun?.alpha).toBeCloseTo(0.2);
    expect(particle?.scale.x).toBeCloseTo(2.4);
    expect(initialFilter?.gain).toBeCloseTo(0.35);

    weather.reconcile(stageWithWeather(sunWeatherSnapshot({ power: 0.8, scale: 1.6, durationMs: 100 }), 2), true);
    tick(tweens, 50);

    const midFilter = sun?.filters?.[0] as { gain?: number } | undefined;
    expect(midFilter).toBe(initialFilter);
    expect(sun?.alpha).toBeCloseTo(0.5);
    expect(midFilter?.gain).toBeCloseTo(0.5);
    expect(particle?.scale.x).toBeCloseTo(3.12);

    tick(tweens, 60);

    const targetFilter = sun?.filters?.[0] as { gain?: number } | undefined;
    expect(targetFilter).toBe(initialFilter);
    expect(sun?.alpha).toBeCloseTo(0.8);
    expect(targetFilter?.gain).toBeCloseTo(0.8);
    expect(particle?.scale.x).toBeCloseTo(3.84);
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

  it("relayouts weather shader surfaces on viewport changes", () => {
    const { root, viewport, weather } = createSystems();
    weather.reconcile(
      stageWithWeathers({
        rain: weatherSnapshot({ power: 0.7, durationMs: 0 }),
        snow: snowWeatherSnapshot({ power: 0.9, durationMs: 0 })
      }, 1),
      false
    );

    viewport.width = 1280;
    viewport.height = 720;
    weather.relayoutViewport();

    const rain = findWeatherContainer(root, "rain");
    const rainShader = rain?.children.find((child): child is Container => child instanceof Container && child.label === "weather:rain:shader");
    const rainSurface = rainShader?.children[0] as Sprite | undefined;
    expect(rainSurface?.width).toBeCloseTo(1280);
    expect(rainSurface?.height).toBeCloseTo(720);

    const snow = findWeatherContainer(root, "snow");
    const snowSurface = snow?.children.find((child) => child.label === "weather:snow:shader-surface");
    const snowFilter = snowSurface?.filters?.[0] as { resources: { snowUniforms: { uniforms: Record<string, Float32Array> } } } | undefined;
    expect(snowSurface?.filterArea).toEqual(new Rectangle(0, 0, 1280, 720));
    expect(Array.from(snowFilter?.resources.snowUniforms.uniforms.uResolution ?? [])).toEqual([1280, 720]);
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

  it("interpolates actor blur filters and removes them after fading to zero", () => {
    const { actors, root, tweens } = createSystems();
    const blurredBackground = (durationMs: number, blur?: number): PixiActorSnapshot => {
      const actor = backgroundActor({ durationMs });
      return {
        ...actor,
        filters: blur === undefined ? {} : { blur },
        transition: { ...actor.transition, easing: "linear" }
      };
    };
    actors.reconcile(stageWithActor(blurredBackground(0, 0.2), 1), false);
    const actor = findDescendant(root, "actor:MainBackground", Container);
    const initialFilter = actor?.filters?.[0];

    actors.reconcile(stageWithActor(blurredBackground(100, 0.8), 2), true);
    tick(tweens, 50);

    const midFilter = actor?.filters?.[0] as { strength?: number } | undefined;
    expect(midFilter).toBe(initialFilter);
    expect(midFilter?.strength).toBeCloseTo(3);

    tick(tweens, 60);

    const targetFilter = actor?.filters?.[0] as { strength?: number } | undefined;
    expect(targetFilter).toBe(initialFilter);
    expect(targetFilter?.strength).toBeCloseTo(4.8);

    actors.reconcile(stageWithActor(blurredBackground(100), 3), true);
    tick(tweens, 50);

    const removingFilter = actor?.filters?.[0] as { strength?: number } | undefined;
    expect(removingFilter).toBe(initialFilter);
    expect(removingFilter?.strength).toBeCloseTo(2.4);

    tick(tweens, 60);

    expect(actor?.filters).toBeNull();
  });

  it("relayouts transient viewport effects without cancelling active tasks", () => {
    const { effects, root, tasks, trial, viewport } = createSystems();
    effects.run(
      [
        { type: "flash", color: "#ffffff", durationMs: 100, wait: true },
        {
          type: "glitch",
          power: 0.8,
          durationMs: 100,
          blockJump: 1,
          burstJump: 1,
          pixelScatter: 1,
          colorNoise: 1,
          speed: 1,
          seed: 7,
          wait: true
        }
      ],
      3
    );
    trial.run([{ type: "trial-keyword", keywordId: "kw:test", text: "resize", evidenceId: "ev:test" }]);

    viewport.width = 1280;
    viewport.height = 720;
    effects.relayoutViewport();
    trial.relayoutViewport();

    const transientLayer = findDescendant(root, "transient-effects", Container);
    const flash = findDescendant(transientLayer, "flash-overlay", Graphics);
    expect(flash?.width).toBeCloseTo(1280);
    expect(flash?.height).toBeCloseTo(720);
    const glitchFilter = (root.filters as unknown as GlitchTestFilter[] | null)?.find((filter) => filter.resources?.glitchUniforms);
    expect(Array.from(glitchFilter?.resources.glitchUniforms.uniforms.uResolution ?? [])).toEqual([1280, 720]);
    const trialLayer = findDescendant(root, "trial-overlay", Container);
    expect(trialLayer?.children[0]?.x).toBe(920);
    expect(tasks.snapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "flash", target: "screen", revision: 3, status: "running" }),
        expect.objectContaining({ kind: "glitch", target: "screen", revision: 3, status: "running" })
      ])
    );
  });
});

function createSystems(overrides: {
  assetResolver?: PixiAssetResolver;
  characterOutlineEnabled?: boolean;
  onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void;
  viewport?: { width: number; height: number };
} = {}) {
  const root = new Container({ label: "test-root" });
  const viewport = overrides.viewport ?? { width: 960, height: 540 };
  const options = {
    root,
    width: () => viewport.width,
    height: () => viewport.height,
    characterOutlineEnabled: overrides.characterOutlineEnabled ?? true,
    characterAssetIdByCharacterId: { Ema: "char/ema" },
    ...(overrides.assetResolver ? { assetResolver: overrides.assetResolver } : {}),
    ...(overrides.onDiagnostic ? { onDiagnostic: overrides.onDiagnostic } : {})
  };
  const tweens = new TweenSystem();
  const tasks = new PresentationTaskController();
  const rootFilters = new RootFilterStack(options);
  const filters = new ActorFilterSystem(options);
  const actors = new ActorSystem(options, filters, tweens, tasks);
  const weather = new WeatherSystem(options, tweens, tasks);
  const screen = new PersistentScreenEffectSystem(options, rootFilters, tweens, tasks);
  const effects = new TransientEffectSystem(options, actors, rootFilters, tweens, tasks);
  const trial = new TrialOverlaySystem(options);
  return { actors, effects, filters, root, screen, tasks, trial, tweens, viewport, weather };
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

function stageWithActors(background: PixiActorSnapshot, characters: PixiActorSnapshot[], revision = 1): PixiStageSnapshot {
  return {
    ...createInitialPixiStageSnapshot(),
    revision,
    backgroundsById: { [background.id]: background },
    charactersById: Object.fromEntries(characters.map((actor) => [actor.id, actor])),
    actorOrder: [background.id, ...characters.map((actor) => actor.id)]
  };
}

function stageWithBokeh(power: number, revision: number, durationMs = 0): PixiStageSnapshot {
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

function stageWithInnerBackground(
  {
    includeMainBackground = true,
    includeCharacter = true
  }: { includeMainBackground?: boolean; includeCharacter?: boolean } = {}
): PixiStageSnapshot {
  const character = characterActor("Ema", "Pensive1");
  return {
    ...createInitialPixiStageSnapshot(),
    revision: 1,
    backgroundsById: includeMainBackground ? { MainBackground: backgroundActor({ durationMs: 0 }) } : {},
    innerBackgroundsById: { [INNER_BACKGROUND_ID]: innerBackgroundActor({ durationMs: 0 }) },
    charactersById: includeCharacter ? { [character.id]: character } : {},
    actorOrder: [
      ...(includeMainBackground ? ["MainBackground"] : []),
      ...(includeCharacter ? [character.id] : [])
    ]
  };
}

function backgroundActor({ durationMs, wait = false }: { durationMs: number; wait?: boolean }): PixiActorSnapshot {
  return {
    id: "MainBackground",
    kind: "background",
    appearance: "bg/test",
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

function innerBackgroundActor({ durationMs, wait = false }: { durationMs: number; wait?: boolean }): PixiActorSnapshot {
  return {
    id: INNER_BACKGROUND_ID,
    kind: "background",
    appearance: "bg/inner",
    appearanceExpression: "",
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

function weatherSnapshot({
  power,
  durationMs,
  wind = -1,
  hue = 215,
  tint = 0.55
}: {
  power: number;
  durationMs: number;
  wind?: number;
  hue?: number;
  tint?: number;
}): Extract<PixiWeatherSnapshot, { kind: "rain" }> {
  return {
    kind: "rain",
    commandParams: { power, wind, hue, tint },
    transition: { durationMs, easing: "linear", lazy: false, wait: durationMs > 0 }
  };
}

function snowWeatherSnapshot({
  power,
  durationMs,
  xSpeed = -0.35,
  ySpeed = 0.75,
  density = 1.4,
  flakeScale = 1.25,
  sway = 0.85,
  fog = 0.3,
  noise = 0.04,
  seed = 23
}: {
  power: number;
  durationMs: number;
  xSpeed?: number;
  ySpeed?: number;
  density?: number;
  flakeScale?: number;
  sway?: number;
  fog?: number;
  noise?: number;
  seed?: number;
}): Extract<PixiWeatherSnapshot, { kind: "snow" }> {
  return {
    kind: "snow",
    power,
    xSpeed,
    ySpeed,
    density,
    flakeScale,
    sway,
    fog,
    noise,
    seed,
    transition: { durationMs, easing: "linear", lazy: false, wait: durationMs > 0 }
  };
}

function sunWeatherSnapshot({
  power,
  durationMs,
  scale = 1
}: {
  power: number;
  durationMs: number;
  scale?: number;
}): Extract<PixiWeatherSnapshot, { kind: "sun" }> {
  return {
    kind: "sun",
    power,
    scale: [scale, scale, scale],
    transition: { durationMs, easing: "linear", lazy: false, wait: durationMs > 0 }
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

function rainUniforms(root: Container): Record<string, number | number[]> {
  const rain = findWeatherContainer(root, "rain");
  const shader = rain?.children.find((child): child is Container => child instanceof Container && child.label === "weather:rain:shader");
  const nearSurface = shader?.children[0] as Sprite | undefined;
  const filter = nearSurface?.filters?.[0] as { resources: { rainUniforms: { uniforms: Record<string, number | number[]> } } } | undefined;
  const uniforms = filter?.resources.rainUniforms.uniforms;
  if (!uniforms) throw new Error("expected rain uniforms");
  return uniforms;
}

function snowUniforms(root: Container): SnowTestUniforms {
  const snow = findWeatherContainer(root, "snow");
  const surface = snow?.children.find((child) => child.label === "weather:snow:shader-surface");
  const filter = surface?.filters?.[0] as { resources: { snowUniforms: { uniforms: SnowTestUniforms } } } | undefined;
  const uniforms = filter?.resources.snowUniforms.uniforms;
  if (!uniforms) throw new Error("expected snow uniforms");
  return uniforms;
}

function bokehFilter(root: Container): { strength: number } {
  const filter = (root.filters as unknown as Array<{ strength?: number }> | null)?.find((candidate) => typeof candidate.strength === "number");
  if (!filter || filter.strength === undefined) throw new Error("expected bokeh filter");
  return filter as { strength: number };
}

type SnowTestUniforms = {
  uTime: number;
  uResolution: Float32Array;
  uPower: number;
  uDensity: number;
  uFallSpeed: number;
  uWind: number;
  uFlakeScale: number;
  uSway: number;
  uFog: number;
  uNoise: number;
  uSeed: number;
};

type PixiInstanceCtor<T> = new (...args: any[]) => T;

function findDescendant<T>(
  root: Container | undefined,
  label: string,
  ctor?: PixiInstanceCtor<T>
): T | undefined;
function findDescendant(root: Container | undefined, label: string): Container | undefined;
function findDescendant<T>(
  root: Container | undefined,
  label: string,
  ctor?: PixiInstanceCtor<T>
): T | Container | undefined {
  if (!root) return undefined;
  for (const child of root.children) {
    if (child.label === label && (!ctor || child instanceof ctor)) return child as T;
    if (child instanceof Container) {
      const found = findDescendant(child, label, ctor);
      if (found) return found;
    }
  }
  return undefined;
}

function findFirstDescendant<T>(
  root: Container | undefined,
  ctor: PixiInstanceCtor<T>
): T | undefined {
  if (!root) return undefined;
  for (const child of root.children) {
    if (child instanceof ctor) return child as T;
    if (child instanceof Container) {
      const found = findFirstDescendant(child, ctor);
      if (found) return found;
    }
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

function createCharacterSystem(
  overrides: Partial<ConstructorParameters<typeof CharacterSystem>[0]> = {}
): CharacterSystem {
  return new CharacterSystem({
    width: () => 960,
    height: () => 540,
    characterOutlineEnabled: true,
    characterAssetIdByCharacterId: { Ema: "char/ema" },
    assetResolver: {
      resolve(input) {
        return input.capability === "json" && input.id === "char/ema" ? { uri: characterPackUri() } : {};
      }
    },
    ...overrides
  });
}

function outlineUniforms(composition: Container): { uStepX: Float32Array; uStepY: Float32Array; uOpacity: number } {
  const filter = composition.filters?.find((candidate) =>
    "characterOutlineUniforms" in candidate.resources
  ) as Filter & {
    resources: {
      characterOutlineUniforms: {
        uniforms: { uStepX: Float32Array; uStepY: Float32Array; uOpacity: number };
      };
    };
  };
  return filter.resources.characterOutlineUniforms.uniforms;
}

function outlineOpacity(composition: Container): number {
  return outlineUniforms(composition).uOpacity;
}

function finalOpacity(composition: Container): number {
  const filter = composition.filters?.find((candidate) =>
    "characterOpacityUniforms" in candidate.resources ||
    "characterOutlineUniforms" in candidate.resources
  ) as Filter & {
    resources: {
      characterOpacityUniforms?: { uniforms: { uOpacity: number } };
      characterOutlineUniforms?: { uniforms: { uOpacity: number } };
    };
  };
  return filter.resources.characterOpacityUniforms?.uniforms.uOpacity
    ?? filter.resources.characterOutlineUniforms?.uniforms.uOpacity
    ?? Number.NaN;
}

function characterToneUniforms(composition: Container): { uToneAmount: number } {
  const filter = composition.filters?.find((candidate) =>
    "characterToneUniforms" in candidate.resources
  ) as Filter & {
    resources: {
      characterToneUniforms: {
        uniforms: { uToneAmount: number };
      };
    };
  };
  if (!filter) throw new Error("expected character tone filter");
  return filter.resources.characterToneUniforms.uniforms;
}

function filterResourceNames(composition: Container): string[] {
  return (composition.filters ?? []).flatMap((filter) => {
    if ("characterToneUniforms" in filter.resources) return ["characterToneUniforms"];
    if ("characterOutlineUniforms" in filter.resources) return ["characterOutlineUniforms"];
    if ("characterOpacityUniforms" in filter.resources) return ["characterOpacityUniforms"];
    return [];
  });
}

function premultipliedCrossfadeAlpha(outgoingAlpha: number, incomingAlpha: number, progress: number): number {
  return outgoingAlpha * (1 - progress) + incomingAlpha * progress;
}

function sourceOverCrossfadeAlpha(outgoingAlpha: number, incomingAlpha: number, progress: number): number {
  const outgoing = outgoingAlpha * (1 - progress);
  const incoming = incomingAlpha * progress;
  return incoming + outgoing * (1 - incoming);
}

function matrixValues(matrix: { a: number; b: number; c: number; d: number; tx: number; ty: number }): number[] {
  return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty];
}

function installCharacterPackFetch(options: {
  includeInactiveMetadata?: boolean;
  mutatePack?: (pack: ReturnType<typeof characterPackFixture>) => void;
  mutateMetadata?: (metadata: ReturnType<typeof characterPackFixture>["metadata"]) => void;
} = {}) {
  const pack = characterPackFixture();
  options.mutatePack?.(pack);
  options.mutateMetadata?.(pack.metadata);
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

function insetFrame(frame: ReturnType<typeof resolveInnerBackgroundFrameRect>, inset: number): ReturnType<typeof resolveInnerBackgroundFrameRect> {
  return {
    x: frame.x + inset,
    y: frame.y + inset,
    width: Math.max(1, frame.width - inset * 2),
    height: Math.max(1, frame.height - inset * 2)
  };
}

function characterPackFixture() {
  return {
    character: {
      id: "Ema",
      defaultComposition: ["Default"],
      renderSpace: { stageScale: 10, characterAnchor: [0, 0] }
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
    sprite: {
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

function textureWithSize(width: number, height: number): Texture {
  return new Texture({ source: new TextureSource({ width, height }) });
}
