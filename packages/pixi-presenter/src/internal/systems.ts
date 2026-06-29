import { Easing, Group, Tween } from "@tweenjs/tween.js";
import {
  Assets,
  BlurFilter,
  Container,
  Filter,
  Graphics,
  GlProgram,
  Rectangle,
  type Renderer,
  Sprite,
  Text,
  Texture,
  type Ticker
} from "pixi.js";
import { GodrayFilter, KawaseBlurFilter } from "pixi-filters";
import type { PixiActorSnapshot, PixiStageSnapshot, PixiWeatherKind, PixiWeatherSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "../stageSnapshot";
import { getBuiltInPixiFxTexture } from "./fxAssets";
import type { PixiPresentationTaskHandle, PresentationTaskController } from "./presentationTasks";
import { pixiAssetLoadFailed, resolvePixiAsset, type PixiAssetResolver, type PixiPresenterDiagnostic } from "./assetResolver";
import { CharacterSystem } from "./characters";
import { RainShaderRenderer } from "./rain/RainShaderRenderer";
import { resolveRainSettingsFromCommandParams } from "./rain/settings";

export interface PixiPresenterSystemsOptions {
  root: Container;
  width: () => number;
  height: () => number;
  renderer?: Renderer;
  assetResolver?: PixiAssetResolver;
  onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void;
}

interface ActorRecord {
  actor: PixiActorSnapshot;
  container: Container;
  contentKey: string;
  contentGeneration: number;
}

interface WeatherRecord {
  snapshot: PixiWeatherSnapshot;
  container: Container;
  particles: WeatherParticle[];
  rainShader?: RainShaderRenderer;
  snowShader?: SnowShaderRecord;
}

type WeatherParticle = Sprite;

interface SnowShaderRecord {
  surface: Graphics;
  filter: SnowShaderFilter;
  uniforms: SnowShaderUniformValues;
}

interface SnowShaderFilter {
  resources: { snowUniforms: { uniforms: SnowShaderUniformValues } };
  destroy(destroyPrograms?: boolean): void;
}

interface SnowShaderUniformValues {
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
}

interface GlitchShaderRecord {
  filter: GlitchShaderFilter;
  uniforms: GlitchShaderUniformValues;
}

interface PersistentGlitchRecord extends GlitchShaderRecord {
  handle: TweenHandle | undefined;
}

interface GlitchShaderFilter {
  resources: { glitchUniforms: { uniforms: GlitchShaderUniformValues } };
  destroy(destroyPrograms?: boolean): void;
}

interface GlitchShaderUniformValues {
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
}

interface GlitchShaderControls {
  power?: number | undefined;
  blockJump?: number | undefined;
  burstJump?: number | undefined;
  pixelScatter?: number | undefined;
  colorNoise?: number | undefined;
  speed?: number | undefined;
  seed?: number | undefined;
}

interface TweenHandle {
  stop(): void;
}

export class TweenSystem {
  private readonly group = new Group();
  private elapsedMs = 0;
  private generation = 0;

  tween(
    target: Record<string, number>,
    to: Record<string, number>,
    durationMs: number,
    easingName?: string,
    onComplete?: () => void,
    delayMs = 0
  ): TweenHandle {
    if (durationMs <= 0) {
      Object.assign(target, to);
      onComplete?.();
      return { stop: () => undefined };
    }
    const generation = this.generation;
    const tween = new Tween(target, this.group)
      .to(to, durationMs)
      .easing(resolveEasing(easingName))
      .onComplete(() => {
        if (generation === this.generation) onComplete?.();
      });
    if (delayMs > 0) tween.delay(delayMs);
    tween.start(this.elapsedMs);
    return {
      stop: () => {
        tween.stop();
        this.group.remove(tween);
      }
    };
  }

  tick(ticker: Ticker): void {
    this.elapsedMs += Math.max(0, ticker.deltaMS);
    this.group.update(this.elapsedMs);
  }

  clear(): void {
    this.generation += 1;
    this.group.removeAll();
  }
}

export class RootFilterStack {
  private screenFilters: Filter[] = [];
  private transientFilters: Filter[] = [];

  constructor(private readonly options: PixiPresenterSystemsOptions) {}

  setScreenFilters(filters: Filter[]): void {
    this.screenFilters = [...filters];
    this.apply();
  }

  removeScreenFilter(filter: Filter): void {
    this.screenFilters = this.screenFilters.filter((candidate) => candidate !== filter);
    this.apply();
  }

  addTransientFilter(filter: Filter): void {
    this.transientFilters.push(filter);
    this.apply();
  }

  removeTransientFilter(filter: Filter): void {
    this.transientFilters = this.transientFilters.filter((candidate) => candidate !== filter);
    this.apply();
  }

  clear(): void {
    this.screenFilters = [];
    this.transientFilters = [];
    this.apply();
  }

  private apply(): void {
    const filters = [...this.screenFilters, ...this.transientFilters];
    this.options.root.filters = filters.length > 0 ? filters : null;
    if (filters.length > 0) {
      this.options.root.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
    } else {
      (this.options.root as unknown as { filterArea: Rectangle | undefined }).filterArea = undefined;
    }
  }
}

export class FilterSystem {
  private persistentGlitch: PersistentGlitchRecord | undefined;

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  applyActorFilters(container: Container, actor: PixiActorSnapshot): void {
    const filters: Filter[] = [];
    const blur = actor.filters.blur ?? 0;
    if (blur > 0) filters.push(new BlurFilter({ strength: Math.max(0.1, blur * 6), quality: 3 }));
    if (filters.length > 0 && this.options) {
      container.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
    }
    container.filters = filters.length > 0 ? filters : null;
  }

  applyScreenFilters(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[] = []): void {
    const filters: Filter[] = [];
    const bokehPower = snapshot.screenFilters.bokeh?.power ?? 0;
    if (bokehPower > 0) filters.push(new KawaseBlurFilter({ strength: Math.max(1, bokehPower * 8), quality: 4 }));
    const glitch = this.reconcilePersistentGlitch(snapshot, animate, hints);
    if (glitch) filters.push(glitch.filter as unknown as Filter);
    this.rootFilters.setScreenFilters(filters);
  }

  tick(ticker: Ticker): void {
    if (!this.persistentGlitch) return;
    this.persistentGlitch.uniforms.uTime += Math.max(0, ticker.deltaMS) / 1000;
  }

  clear(): void {
    this.destroyPersistentGlitch();
    this.rootFilters.setScreenFilters([]);
  }

  createSunFilter(power: number): Filter {
    return new GodrayFilter({ gain: Math.max(0.35, power), lacunarity: 2.6, parallel: true });
  }

  private reconcilePersistentGlitch(
    snapshot: PixiStageSnapshot,
    animate: boolean,
    hints: PixiStageRenderHint[]
  ): GlitchShaderRecord | undefined {
    const glitch = snapshot.screenFilters.glitch;
    const removal = hints.find(
      (hint): hint is Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> =>
        hint.type === "screen-filter-remove" && hint.kind === "glitch"
    );
    if (!glitch || glitch.power <= 0) {
      return this.removePersistentGlitch(snapshot.revision, animate, removal);
    }

    const width = this.options.width();
    const height = this.options.height();
    const isNew = !this.persistentGlitch;
    if (!this.persistentGlitch) {
      const shader = createGlitchShaderFilter(width, height);
      this.persistentGlitch = { filter: shader.filter, uniforms: shader.uniforms, handle: undefined };
    }

    const record = this.persistentGlitch;
    const transition = glitch.transition;
    const targetPower = clamp01(glitch.power);
    const shouldAnimate = animate && transition.durationMs > 0 && Math.abs(record.uniforms.uPower - targetPower) > 0.001;
    record.handle?.stop();
    applyGlitchUniforms(record.uniforms, glitch, {
      power: shouldAnimate ? (isNew ? 0 : record.uniforms.uPower) : targetPower,
      progress: 0
    });

    if (shouldAnimate) {
      const task = this.tasks.start({
        kind: "screen-filter-transition",
        target: "glitch",
        revision: snapshot.revision,
        durationMs: transition.durationMs,
        onCancel: () => {
          record.handle?.stop();
          record.uniforms.uPower = targetPower;
        },
        onSettle: () => {
          record.handle?.stop();
          record.uniforms.uPower = targetPower;
        }
      });
      record.handle = this.tweens.tween(
        record.uniforms as unknown as Record<string, number>,
        { uPower: targetPower },
        transition.durationMs,
        transition.easing,
        () => {
          if (task.isCurrent()) task.complete();
        }
      );
    } else {
      record.handle = undefined;
    }

    return record;
  }

  private removePersistentGlitch(
    revision: number,
    animate: boolean,
    removal: Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> | undefined
  ): GlitchShaderRecord | undefined {
    const record = this.persistentGlitch;
    if (!record) return undefined;
    record.handle?.stop();
    if (animate && removal && removal.durationMs > 0) {
      const task = this.tasks.start({
        kind: "screen-filter-transition",
        target: "glitch",
        revision,
        durationMs: removal.durationMs,
        onCancel: () => this.destroyPersistentGlitch(),
        onSettle: () => this.destroyPersistentGlitch()
      });
      record.handle = this.tweens.tween(
        record.uniforms as unknown as Record<string, number>,
        { uPower: 0 },
        removal.durationMs,
        removal.easing,
        () => {
          if (!task.isCurrent()) return;
          this.destroyPersistentGlitch();
          task.complete();
        }
      );
      return record;
    }
    this.destroyPersistentGlitch();
    return undefined;
  }

  private destroyPersistentGlitch(): void {
    const record = this.persistentGlitch;
    if (!record) return;
    record.handle?.stop();
    this.rootFilters.removeScreenFilter(record.filter as unknown as Filter);
    record.filter.destroy();
    this.persistentGlitch = undefined;
  }
}

export class ActorSystem {
  private readonly backgroundLayer = new Container({ label: "backgrounds" });
  private readonly characterLayer = new Container({ label: "characters" });
  private readonly actors = new Map<string, ActorRecord>();
  private readonly characters: CharacterSystem;

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly filters: FilterSystem,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {
    this.characters = new CharacterSystem(options);
    this.backgroundLayer.zIndex = 0;
    this.characterLayer.zIndex = 10;
    options.root.sortableChildren = true;
    options.root.addChild(this.backgroundLayer, this.characterLayer);
  }

  reconcile(snapshot: PixiStageSnapshot, animate: boolean): void {
    const activeIds = new Set([...Object.keys(snapshot.backgroundsById), ...Object.keys(snapshot.charactersById)]);
    for (const id of [...this.actors.keys()]) {
      if (!activeIds.has(id)) this.remove(id);
    }

    for (const actor of Object.values(snapshot.backgroundsById)) this.upsert(actor, animate, snapshot.revision);
    const orderedCharacters = snapshot.actorOrder
      .map((id) => snapshot.charactersById[id])
      .filter((actor): actor is PixiActorSnapshot => Boolean(actor));
    orderedCharacters.forEach((actor, index) => this.upsert({ ...actor, z: actor.z ?? index }, animate, snapshot.revision));
    this.characterLayer.sortableChildren = true;
  }

  clear(): void {
    for (const id of [...this.actors.keys()]) this.remove(id);
  }

  getLayerForEffects(target: string): Container | undefined {
    if (target === "stage" || target === "camera") return this.options.root;
    return this.actors.get(target)?.container;
  }

  private upsert(actor: PixiActorSnapshot, animate: boolean, revision: number): void {
    const record = this.ensure(actor);
    const previous = record.actor;
    const contentKey = actor.kind === "character"
      ? `${actor.kind}:${actor.id}:${actor.appearanceExpression}:${actor.pose ?? ""}`
      : `${actor.kind}:${actor.appearance ?? "missing"}:${actor.pose ?? ""}`;
    const shouldAnimate = animate && actor.transition.durationMs > 0;
    const transition = shouldAnimate ? this.createActorTransitionScheduler(actor, revision) : undefined;
    const filtersChanged = !sameActorFilters(actor.filters, previous.filters);
    let contentAlphaAnimated = false;
    if (record.contentKey !== contentKey) {
      record.contentGeneration += 1;
      if (actor.kind === "background") {
        for (const child of record.container.removeChildren()) child.destroy({ children: true });
        this.drawBackground(record, actor);
      }
      else this.drawCharacter(record, actor);
      record.contentKey = contentKey;
      const targetAlpha = actor.visible ? actor.alpha : 0;
      if (shouldAnimate && targetAlpha > 0) {
        record.container.alpha = 0;
        transition?.tween(
          record.container as unknown as Record<string, number>,
          { alpha: targetAlpha },
          actor.transition.durationMs,
          actor.transition.easing
        );
        contentAlphaAnimated = true;
      }
    }
    this.applyTransform(record.container, actor, previous, animate, transition, contentAlphaAnimated);
    if (shouldAnimate && filtersChanged) {
      transition?.tween({ value: 0 }, { value: 1 }, actor.transition.durationMs, actor.transition.easing);
    }
    if (shouldAnimate && actor.transition.wait && transition && !transition.hasWork()) {
      transition.tween({ value: 0 }, { value: 1 }, actor.transition.durationMs, actor.transition.easing);
    }
    record.actor = actor;
    this.filters.applyActorFilters(record.container, actor);
  }

  private ensure(actor: PixiActorSnapshot): ActorRecord {
    const existing = this.actors.get(actor.id);
    if (existing) return existing;
    const container = new Container({ label: `actor:${actor.id}` });
    const layer = actor.kind === "background" ? this.backgroundLayer : this.characterLayer;
    layer.addChild(container);
    const record: ActorRecord = { actor, container, contentKey: "", contentGeneration: 0 };
    this.actors.set(actor.id, record);
    return record;
  }

  private remove(id: string): void {
    const record = this.actors.get(id);
    if (!record) return;
    this.tasks.cancelTarget(id);
    record.container.removeFromParent();
    record.container.destroy({ children: true });
    this.actors.delete(id);
  }

  private createActorTransitionScheduler(actor: PixiActorSnapshot, revision: number): {
    tween: (
      target: Record<string, number>,
      to: Record<string, number>,
      durationMs: number,
      easingName?: string,
      onComplete?: () => void
    ) => void;
    hasWork: () => boolean;
  } {
    let task: PixiPresentationTaskHandle | undefined;
    let pending = 0;
    const handles: TweenHandle[] = [];
    const completeOne = () => {
      pending -= 1;
      if (pending <= 0 && task?.isCurrent()) task.complete();
    };
    const ensureTask = () => {
      task ??= this.tasks.start({
        kind: "actor-transition",
        target: actor.id,
        revision,
        durationMs: actor.transition.durationMs,
        onCancel: () => handles.forEach((handle) => handle.stop()),
        onSettle: () => handles.forEach((handle) => handle.stop())
      });
      return task;
    };
    return {
      hasWork: () => pending > 0 || Boolean(task),
      tween: (target, to, durationMs, easingName, onComplete) => {
        ensureTask();
        pending += 1;
        const handle = this.tweens.tween(target, to, durationMs, easingName, () => {
          if (task?.isCurrent()) onComplete?.();
          completeOne();
        });
        handles.push(handle);
      }
    };
  }

  private drawBackground(record: ActorRecord, actor: PixiActorSnapshot): void {
    const container = record.container;
    const contentGeneration = record.contentGeneration;
    const width = this.options.width();
    const height = this.options.height();
    const fallback = this.createFallbackBackground(actor, width, height);
    container.addChild(fallback);
    const backgroundId = actor.appearance;
    const backgroundUrl = backgroundId ? resolvePixiAsset(this.options.assetResolver, { id: backgroundId, kind: "background" }, this.options.onDiagnostic) : undefined;
    if (backgroundId && backgroundUrl) {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.visible = false;
      container.addChildAt(sprite, 0);
      void Assets.load<Texture>(backgroundUrl)
        .then((texture) => {
          if (!sprite.parent || record.contentGeneration !== contentGeneration) return;
          sprite.texture = texture;
          fitBackgroundSprite(sprite, texture, width, height);
          sprite.visible = true;
          fallback.visible = false;
        })
        .catch((error) => {
          this.options.onDiagnostic?.(pixiAssetLoadFailed({ id: backgroundId, kind: "background" }, error));
          fallback.visible = true;
        });
    }
  }

  private createFallbackBackground(actor: PixiActorSnapshot, width: number, height: number): Container {
    const fallback = new Container({ label: `fallback:${actor.id}` });
    const style = backgroundStyleFromId(actor.appearance ?? "background");
    const plate = new Graphics()
      .rect(0, 0, width, height)
      .fill({ color: style.color, alpha: style.alpha })
      .rect(32, 32, width - 64, height - 64)
      .stroke({ color: 0x83e4d3, width: 2, alpha: style.strokeAlpha });
    const title = new Text({
      text: actor.appearance ?? actor.id,
      style: { fill: 0xeef8ff, fontSize: 18, fontFamily: "Inter, ui-sans-serif, system-ui", letterSpacing: 0 }
    });
    title.x = 48;
    title.y = 42;
    fallback.addChild(plate, title);
    return fallback;
  }

  private drawCharacter(record: ActorRecord, actor: PixiActorSnapshot): void {
    const contentGeneration = record.contentGeneration;
    this.characters.render(record.container, actor, contentGeneration, () => record.contentGeneration === contentGeneration);
  }

  private applyTransform(
    container: Container,
    actor: PixiActorSnapshot,
    previous: PixiActorSnapshot,
    animate: boolean,
    transition?: ReturnType<ActorSystem["createActorTransitionScheduler"]>,
    contentAlphaAnimated = false
  ): void {
    const target = this.toScreenPosition(actor, actor.pos);
    const shouldAnimate = animate && actor.transition.durationMs > 0;
    const targetAlpha = actor.visible ? actor.alpha : 0;
    if (shouldAnimate && !actor.transition.lazy) {
      const previousTarget = this.toScreenPosition(previous, previous.pos);
      container.x = previousTarget.x;
      container.y = previousTarget.y;
      container.alpha = previous.visible ? previous.alpha : 0;
      container.visible = previous.visible || actor.visible;
    }
    container.visible = actor.visible || (shouldAnimate && previous.visible);
    container.zIndex = actor.z;
    if (shouldAnimate && (actor.transition.name === "slide" || !sameVector2(actor.pos, previous.pos))) {
      const from = actor.transition.from ? this.toScreenPosition(actor, actor.transition.from) : undefined;
      if (from) {
        container.x = from.x;
        container.y = from.y;
      }
      transition?.tween(
        container as unknown as Record<string, number>,
        { x: target.x, y: target.y },
        actor.transition.durationMs,
        actor.transition.easing
      );
    } else {
      container.x = target.x;
      container.y = target.y;
    }
    if (shouldAnimate && !contentAlphaAnimated && container.alpha !== targetAlpha) {
      transition?.tween(
        container as unknown as Record<string, number>,
        { alpha: targetAlpha },
        actor.transition.durationMs,
        actor.transition.easing,
        () => {
          if (targetAlpha <= 0) container.visible = false;
        }
      );
    } else {
      container.alpha = targetAlpha;
      if (targetAlpha <= 0) container.visible = false;
    }
    const scale = actor.scale?.[0] ?? 1;
    container.scale.set(scale);
    container.rotation = ((actor.rotation?.[2] ?? 0) * Math.PI) / 180;
  }

  private toScreenPosition(actor: PixiActorSnapshot, pos: [number, number] | undefined): { x: number; y: number } {
    if (actor.kind === "background" && !pos) return { x: 0, y: 0 };
    const width = this.options.width();
    const height = this.options.height();
    const normalized = pos ?? [0.5, 0];
    if (actor.kind === "background") {
      return {
        x: Math.round(normalized[0] * width),
        y: Math.round((1 - normalized[1]) * height)
      };
    }
    const bottomMargin = Math.max(54, height * 0.1);
    const topMargin = Math.max(32, height * 0.08);
    return {
      x: Math.round(normalized[0] * width),
      y: Math.round(height - bottomMargin - normalized[1] * (height - bottomMargin - topMargin))
    };
  }
}

export class WeatherSystem {
  private readonly backLayer = new Container({ label: "weather-back" });
  private readonly frontLayer = new Container({ label: "weather-front" });
  private readonly records = new Map<string, WeatherRecord>();

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly filters: FilterSystem,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {
    this.backLayer.zIndex = 5;
    this.frontLayer.zIndex = 20;
    options.root.sortableChildren = true;
    options.root.addChild(this.backLayer, this.frontLayer);
  }

  reconcile(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[] = []): void {
    const removalHints = new Map(
      hints
        .filter((hint): hint is Extract<PixiStageRenderHint, { type: "weather-remove" }> => hint.type === "weather-remove")
        .map((hint) => [hint.kind, hint])
    );
    for (const [kind, weather] of Object.entries(snapshot.weather) as Array<[PixiWeatherKind, PixiWeatherSnapshot | undefined]>) {
      if (!weather) continue;
      if (weatherPower(weather) <= 0) {
        this.remove(kind);
        continue;
      }
      this.upsert(kind, weather, animate, snapshot.revision);
    }
    for (const kind of [...this.records.keys()]) {
      if (snapshot.weather[kind as keyof typeof snapshot.weather]) continue;
      const removal = removalHints.get(kind as PixiWeatherSnapshot["kind"]);
      if (animate && removal && removal.durationMs > 0) this.fadeOutAndRemove(kind, removal, snapshot.revision);
      else this.remove(kind);
    }
  }

  tick(ticker: Ticker): void {
    for (const record of this.records.values()) {
      const width = this.options.width();
      const height = this.options.height();
      if (record.snowShader) {
        this.updateSnowShaderUniforms(record);
        this.resizeSnowShader(record, width, height);
        record.snowShader.uniforms.uTime += Math.max(0, ticker.deltaMS) / 1000;
        continue;
      }
      if (record.rainShader) {
        record.rainShader.resize(width, height);
        record.rainShader.tick(this.options.renderer);
        continue;
      }
      const speedY = weatherSpeedY(record.snapshot);
      const speedX = weatherSpeedX(record.snapshot);
      for (const particle of record.particles) {
        particle.x += speedX * ticker.deltaMS * 0.06;
        particle.y += speedY * ticker.deltaMS * 0.06;
        particle.rotation += record.snapshot.kind === "snow" ? 0.002 * ticker.deltaMS : 0;
        if (particle.y > height + 80 || particle.x < -80 || particle.x > width + 80) {
          particle.x = Math.random() * width;
          particle.y = -Math.random() * 80;
        }
      }
    }
  }

  clear(): void {
    for (const kind of [...this.records.keys()]) this.remove(kind);
  }

  private upsert(kind: string, snapshot: PixiWeatherSnapshot, animate: boolean, revision: number): void {
    let record = this.records.get(kind);
    const isNew = !record;
    if (!record) {
      const container = createWeatherContainer(kind);
      container.alpha = 0;
      if (kind === "sun") this.backLayer.addChild(container);
      else this.frontLayer.addChild(container);
      record = { snapshot, container, particles: [] };
      this.records.set(kind, record);
      this.populate(record);
    }
    record.snapshot = snapshot;
    const targetAlpha = clamp01(weatherPower(snapshot));
    const shouldAnimate = animate && snapshot.transition.durationMs > 0 && (isNew || Math.abs(record.container.alpha - targetAlpha) > 0.001);
    if (shouldAnimate) {
      let handle: TweenHandle | undefined;
      const task = this.tasks.start({
        kind: "weather-transition",
        target: kind,
        revision,
        durationMs: snapshot.transition.durationMs,
        onCancel: () => {
          handle?.stop();
          record.container.alpha = targetAlpha;
        },
        onSettle: () => {
          handle?.stop();
          record.container.alpha = targetAlpha;
        }
      });
      handle = this.tweens.tween(
        record.container as unknown as Record<string, number>,
        { alpha: targetAlpha },
        snapshot.transition.durationMs,
        snapshot.transition.easing,
        () => {
          if (task.isCurrent()) task.complete();
        }
      );
    } else {
      record.container.alpha = targetAlpha;
    }
    if (kind === "sun") {
      record.container.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
    }
    record.container.filters = kind === "sun" ? [this.filters.createSunFilter(weatherPower(snapshot))] : null;
    this.applyParticleStyle(record);
  }

  private populate(record: WeatherRecord): void {
    if (record.snapshot.kind === "rain") {
      this.populateRainShader(record);
      return;
    }
    if (record.snapshot.kind === "snow") {
      this.populateSnowShader(record);
      return;
    }
    const count = 1;
    const texture = createWeatherTexture(record.snapshot.kind);
    const width = this.options.width();
    const height = this.options.height();
    for (let i = 0; i < count; i += 1) {
      const particle = createWeatherParticle(record.snapshot.kind, texture, width, height, i);
      particle.x = Math.random() * width;
      particle.y = Math.random() * height;
      record.container.addChild(particle);
      record.particles.push(particle);
    }
    this.applyParticleStyle(record);
  }

  private applyParticleStyle(record: WeatherRecord): void {
    if (record.snapshot.kind === "rain") {
      record.rainShader?.updateSettings(resolveRainSettingsFromCommandParams(record.snapshot.commandParams));
      record.rainShader?.resize(this.options.width(), this.options.height());
      return;
    }
    if (record.snapshot.kind === "snow") {
      this.updateSnowShaderUniforms(record);
      return;
    }
    const power = clamp01(weatherPower(record.snapshot));
    const externalScale = record.snapshot.scale?.[0] ?? 1;
    const activeCount = record.particles.length;
    record.particles.forEach((particle, index) => {
      particle.visible = index < activeCount;
      particle.alpha = 0.26 + power * 0.36;
      particle.scale.set(2.4 * externalScale);
    });
  }

  private fadeOutAndRemove(
    kind: string,
    hint: Extract<PixiStageRenderHint, { type: "weather-remove" }>,
    revision: number
  ): void {
    const record = this.records.get(kind);
    if (!record) return;
    let handle: TweenHandle | undefined;
    const cleanup = () => {
      handle?.stop();
      this.remove(kind, false);
    };
    const task = this.tasks.start({
      kind: "weather-transition",
      target: kind,
      revision,
      durationMs: hint.durationMs,
      onCancel: cleanup,
      onSettle: cleanup
    });
    handle = this.tweens.tween(
      record.container as unknown as Record<string, number>,
      { alpha: 0 },
      hint.durationMs,
      hint.easing,
      () => {
        if (!task.isCurrent()) return;
        this.remove(kind, false);
        task.complete();
      }
    );
  }

  private remove(kind: string, cancelTasks = true): void {
    const record = this.records.get(kind);
    if (!record) return;
    if (cancelTasks) this.tasks.cancelTarget(kind);
    record.rainShader?.destroy();
    record.snowShader?.filter.destroy();
    record.container.removeFromParent();
    record.container.destroy({ children: true });
    this.records.delete(kind);
  }

  private populateRainShader(record: WeatherRecord): void {
    if (record.snapshot.kind !== "rain") return;
    const rainShader = new RainShaderRenderer(
      resolveRainSettingsFromCommandParams(record.snapshot.commandParams),
      this.options.width(),
      this.options.height()
    );
    record.rainShader = rainShader;
    record.container.addChild(rainShader.container);
  }

  private populateSnowShader(record: WeatherRecord): void {
    const width = this.options.width();
    const height = this.options.height();
    const surface = new Graphics()
      .rect(0, 0, width, height)
      .fill({ color: 0xffffff, alpha: 1 });
    surface.label = "weather:snow:shader-surface";
    const shader = createSnowShaderFilter(width, height);
    surface.filters = [shader.filter as unknown as Filter];
    surface.filterArea = new Rectangle(0, 0, width, height);
    record.snowShader = { surface, filter: shader.filter, uniforms: shader.uniforms };
    record.container.addChild(surface);
    this.updateSnowShaderUniforms(record);
  }

  private resizeSnowShader(record: WeatherRecord, width: number, height: number): void {
    const shader = record.snowShader;
    if (!shader) return;
    const resolution = shader.uniforms.uResolution;
    if (resolution[0] === width && resolution[1] === height) return;
    resolution[0] = width;
    resolution[1] = height;
    shader.surface
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: 0xffffff, alpha: 1 });
    shader.surface.filterArea = new Rectangle(0, 0, width, height);
  }

  private updateSnowShaderUniforms(record: WeatherRecord): void {
    const shader = record.snowShader;
    if (!shader) return;
    if (record.snapshot.kind !== "snow") return;
    const snapshot = record.snapshot;
    const uniforms = shader.uniforms;
    uniforms.uPower = clamp01(snapshot.power);
    uniforms.uDensity = snapshot.density ?? 1;
    uniforms.uFallSpeed = snapshot.ySpeed ?? 0.45;
    uniforms.uWind = snapshot.xSpeed ?? 0.25;
    uniforms.uFlakeScale = snapshot.flakeScale ?? snapshot.scale?.[0] ?? 1;
    uniforms.uSway = snapshot.sway ?? 1;
    uniforms.uFog = snapshot.fog ?? 0.25;
    uniforms.uNoise = snapshot.noise ?? 0.01;
    uniforms.uSeed = snapshot.seed ?? 0;
  }
}

export class ScreenOverlaySystem {
  private readonly layer = new Container({ label: "screen-filter-overlays" });
  private bokehKey = "";

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {
    this.layer.zIndex = 25;
    options.root.sortableChildren = true;
    options.root.addChild(this.layer);
  }

  reconcile(snapshot: PixiStageSnapshot, animate: boolean): void {
    const power = clamp01(snapshot.screenFilters.bokeh?.power ?? 0);
    const transition = snapshot.screenFilters.bokeh?.transition;
    if (power <= 0) {
      if (animate && transition && transition.durationMs > 0 && this.layer.children.length > 0) {
        let handle: TweenHandle | undefined;
        const task = this.tasks.start({
          kind: "screen-filter-transition",
          target: "bokeh",
          revision: snapshot.revision,
          durationMs: transition.durationMs,
          onCancel: () => {
            handle?.stop();
            this.clear(false);
          },
          onSettle: () => {
            handle?.stop();
            this.clear(false);
          }
        });
        handle = this.tweens.tween(
          this.layer as unknown as Record<string, number>,
          { alpha: 0 },
          transition.durationMs,
          transition.easing,
          () => {
            if (!task.isCurrent()) return;
            this.clear(false);
            task.complete();
          }
        );
        return;
      }
      this.clear();
      return;
    }

    const key = `${this.options.width()}x${this.options.height()}:${Math.round(power * 100)}`;
    if (key !== this.bokehKey) {
      this.clear();
      this.populateBokeh(power);
      this.bokehKey = key;
      if (animate && transition && transition.durationMs > 0) this.layer.alpha = 0;
    }
    const targetAlpha = Math.min(0.96, 0.45 + power * 0.45);
    const shouldAnimate = animate && transition && transition.durationMs > 0 && Math.abs(this.layer.alpha - targetAlpha) > 0.001;
    if (shouldAnimate) {
      let handle: TweenHandle | undefined;
      const task = this.tasks.start({
        kind: "screen-filter-transition",
        target: "bokeh",
        revision: snapshot.revision,
        durationMs: transition.durationMs,
        onCancel: () => {
          handle?.stop();
          this.layer.alpha = targetAlpha;
        },
        onSettle: () => {
          handle?.stop();
          this.layer.alpha = targetAlpha;
        }
      });
      handle = this.tweens.tween(
        this.layer as unknown as Record<string, number>,
        { alpha: targetAlpha },
        transition.durationMs,
        transition.easing,
        () => {
          if (task.isCurrent()) task.complete();
        }
      );
    } else {
      this.layer.alpha = targetAlpha;
    }
  }

  clear(cancelTasks = true): void {
    if (cancelTasks) this.tasks.cancelTarget("bokeh");
    this.layer.removeChildren().forEach((child) => child.destroy());
    this.bokehKey = "";
  }

  private populateBokeh(power: number): void {
    const width = this.options.width();
    const height = this.options.height();
    let seed = 37;
    const texture = getBuiltInPixiFxTexture("bokeh-disc");
    const count = Math.max(3, Math.round(7 * power));
    for (let index = 0; index < count; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = (seed / 0xffffffff) * width;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const y = (seed / 0xffffffff) * height;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const scale = 0.65 + (seed / 0xffffffff) * 1.35;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.x = x;
      sprite.y = y;
      sprite.scale.set(scale);
      sprite.alpha = 0.32 + power * 0.34;
      sprite.tint = index % 3 === 0 ? 0xfff4cf : index % 3 === 1 ? 0xbfe8ff : 0xffffff;
      this.layer.addChild(sprite);
    }
  }
}

export class TransientEffectSystem {
  private readonly layer = new Container({ label: "transient-effects" });
  private readonly trialLayer = new Container({ label: "trial-overlay" });
  private readonly glitchShaders = new Set<GlitchShaderRecord>();

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly actors: ActorSystem,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {
    this.layer.zIndex = 30;
    this.trialLayer.zIndex = 31;
    options.root.sortableChildren = true;
    options.root.addChild(this.layer, this.trialLayer);
  }

  run(hints: PixiStageRenderHint[], revision: number): void {
    for (const hint of hints) {
      if (hint.type === "flash") this.flash(hint, revision);
      else if (hint.type === "shake") this.shake(hint, revision);
      else if (hint.type === "glitch") this.glitch(hint, revision);
      else if (hint.type === "trial-keyword") this.trialKeyword(hint.text);
      else if (hint.type === "trial-subtitle") this.trialKeyword(hint.text);
    }
  }

  clear(): void {
    for (const record of [...this.glitchShaders]) this.cleanupGlitchShader(record);
    this.layer.removeChildren().forEach((child) => child.destroy());
    this.clearTrialOverlays();
  }

  clearTrialOverlays(): void {
    this.trialLayer.removeChildren().forEach((child) => child.destroy());
  }

  private flash(hint: Extract<PixiStageRenderHint, { type: "flash" }>, revision: number): void {
    const color = Number.parseInt(hint.color.replace("#", ""), 16);
    const flash = new Graphics().rect(0, 0, this.options.width(), this.options.height()).fill({ color, alpha: 0.55 });
    flash.alpha = 0.55;
    this.layer.addChild(flash);
    const cleanup = () => {
      flash.removeFromParent();
      flash.destroy();
    };
    let handle: TweenHandle | undefined;
    const task = this.tasks.start({
      kind: "flash",
      target: "screen",
      revision,
      durationMs: hint.durationMs,
      onCancel: () => {
        handle?.stop();
        cleanup();
      },
      onSettle: () => {
        handle?.stop();
        cleanup();
      }
    });
    handle = this.tweens.tween(flash as unknown as Record<string, number>, { alpha: 0 }, hint.durationMs, "linear", () => {
      if (!task.isCurrent()) return;
      cleanup();
      task.complete();
    });
  }

  private shake(hint: Extract<PixiStageRenderHint, { type: "shake" }>, revision: number): void {
    const target = this.actors.getLayerForEffects(hint.target) ?? this.options.root;
    const origin = { x: target.x, y: target.y };
    const iterations = Math.max(1, Math.round(hint.loop ? Math.max(hint.count ?? 3, 6) : hint.count ?? 3));
    const handles: TweenHandle[] = [];
    const cleanup = () => {
      handles.forEach((handle) => handle.stop());
      target.x = origin.x;
      target.y = origin.y;
    };
    const task = this.tasks.start({
      kind: "shake",
      target: hint.target,
      revision,
      durationMs: Math.max(0, hint.durationMs * iterations),
      onCancel: cleanup,
      onSettle: cleanup
    });
    const tween = (to: Record<string, number>, durationMs: number, onComplete?: () => void) => {
      const handle = this.tweens.tween(target as unknown as Record<string, number>, to, durationMs, "easeOut", () => {
        if (!task.isCurrent()) return;
        onComplete?.();
      });
      handles.push(handle);
    };
    const shakeOnce = (index: number) => {
      if (index >= iterations) {
        tween(origin, Math.min(80, hint.durationMs), () => {
          if (task.isCurrent()) task.complete();
        });
        return;
      }
      const deltaPower = hint.deltaPower ?? 0;
      const deltaTime = hint.deltaTimeMs ?? 0;
      const amplitude = Math.max(0, hint.intensity + (index % 2 === 0 ? deltaPower : -deltaPower)) * 28;
      const durationMs = Math.max(16, hint.durationMs + (index % 2 === 0 ? deltaTime : -deltaTime));
      const polarity = index % 2 === 0 ? 1 : -1;
      const displaced = {
        x: hint.hor ? origin.x + amplitude * polarity : origin.x,
        y: hint.ver === false ? origin.y : origin.y + amplitude * polarity
      };
      tween(displaced, durationMs / 2, () => {
        tween(origin, durationMs / 2, () => shakeOnce(index + 1));
      });
    };
    shakeOnce(0);
  }

  private glitch(hint: Extract<PixiStageRenderHint, { type: "glitch" }>, revision: number): void {
    const width = this.options.width();
    const height = this.options.height();
    let handle: TweenHandle | undefined;
    let record: GlitchShaderRecord | undefined;
    const cleanup = () => {
      handle?.stop();
      if (record) this.cleanupGlitchShader(record);
    };
    const task = this.tasks.start({
      kind: "glitch",
      target: "screen",
      revision,
      durationMs: hint.durationMs,
      onCancel: cleanup,
      onSettle: cleanup
    });
    const shader = createGlitchShaderFilter(width, height);
    const uniforms = shader.uniforms;
    applyGlitchUniforms(uniforms, hint, { progress: 0 });
    record = {
      filter: shader.filter,
      uniforms
    };
    this.glitchShaders.add(record);
    this.rootFilters.addTransientFilter(shader.filter as unknown as Filter);
    handle = this.tweens.tween(
      uniforms as unknown as Record<string, number>,
      { uTime: Math.max(0.001, hint.durationMs / 1000), uProgress: 1 },
      Math.max(1, hint.durationMs),
      "linear",
      () => {
        if (!task.isCurrent()) return;
        cleanup();
        task.complete();
      }
    );
  }

  private cleanupGlitchShader(record: GlitchShaderRecord): void {
    if (!this.glitchShaders.delete(record)) return;
    this.rootFilters.removeTransientFilter(record.filter as unknown as Filter);
    record.filter.destroy();
  }

  private trialKeyword(text: string): void {
    const group = new Container();
    const pill = new Graphics()
      .roundRect(0, 0, Math.max(180, text.length * 14), 34, 17)
      .fill({ color: 0x1f2937, alpha: 0.82 })
      .stroke({ color: 0xff4f8f, width: 2, alpha: 0.9 });
    const label = new Text({ text, style: { fill: 0xffffff, fontSize: 18, fontWeight: "700" } });
    label.x = 18;
    label.y = 6;
    group.x = Math.max(24, this.options.width() - 360);
    group.y = 100 + this.trialLayer.children.length * 42;
    group.addChild(pill, label);
    this.trialLayer.addChild(group);
  }
}

function resolveEasing(name: string | undefined): (amount: number) => number {
  if (name === "linear") return Easing.Linear.None;
  if (name === "easeIn") return Easing.Cubic.In;
  if (name === "easeInOut") return Easing.Cubic.InOut;
  return Easing.Cubic.Out;
}

function colorFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return 0x243040 + (hash % 0x2f3f50);
}

function backgroundStyleFromId(id: string): { color: number; alpha: number; strokeAlpha: number } {
  if (id === "bg:black" || id === "bg:solid-black") return { color: 0x000000, alpha: 1, strokeAlpha: 0.22 };
  return { color: colorFromId(id), alpha: 0.78, strokeAlpha: 0.28 };
}

function sameVector2(left: [number, number] | undefined, right: [number, number] | undefined): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return Math.abs(left[0] - right[0]) < 0.0001 && Math.abs(left[1] - right[1]) < 0.0001;
}

function sameActorFilters(left: PixiActorSnapshot["filters"], right: PixiActorSnapshot["filters"]): boolean {
  return Math.abs((left.blur ?? 0) - (right.blur ?? 0)) < 0.0001 && Math.abs((left.bokeh ?? 0) - (right.bokeh ?? 0)) < 0.0001;
}

function fitBackgroundSprite(sprite: Sprite, texture: Texture, width: number, height: number): void {
  const textureWidth = Math.max(1, texture.width);
  const textureHeight = Math.max(1, texture.height);
  const scale = Math.max(width / textureWidth, height / textureHeight);
  sprite.width = textureWidth * scale;
  sprite.height = textureHeight * scale;
  sprite.x = (width - sprite.width) / 2;
  sprite.y = (height - sprite.height) / 2;
}

function createWeatherContainer(kind: string): Container {
  return new Container({ label: `weather:${kind}` });
}

function createWeatherTexture(kind: string): Texture {
  void kind;
  return getBuiltInPixiFxTexture("godray-mask");
}

function createWeatherParticle(kind: string, texture: Texture, width: number, height: number, index: number): WeatherParticle {
  void kind;
  void width;
  void height;
  void index;
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  return sprite;
}

function weatherPower(snapshot: PixiWeatherSnapshot): number {
  return snapshot.kind === "rain" ? snapshot.commandParams.power : snapshot.power;
}

function weatherSpeedX(snapshot: PixiWeatherSnapshot): number {
  if (snapshot.kind === "snow") return snapshot.xSpeed ?? 0.25;
  return 0.25;
}

function weatherSpeedY(snapshot: PixiWeatherSnapshot): number {
  if (snapshot.kind === "snow") return snapshot.ySpeed ?? 0.45;
  return 6;
}

function createSnowShaderFilter(width: number, height: number): { filter: SnowShaderFilter; uniforms: SnowShaderUniformValues } {
  const initialUniforms: SnowShaderUniformValues = {
    uTime: 0,
    uResolution: new Float32Array([width, height]),
    uPower: 1,
    uDensity: 1,
    uFallSpeed: 0.45,
    uWind: 0.25,
    uFlakeScale: 1,
    uSway: 1,
    uFog: 0.25,
    uNoise: 0.01,
    uSeed: 0
  };
  if (typeof document === "undefined") {
    return {
      filter: {
        resources: { snowUniforms: { uniforms: initialUniforms } },
        destroy: () => undefined
      },
      uniforms: initialUniforms
    };
  }

  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: SNOW_SHADER_VERTEX,
      fragment: SNOW_SHADER_FRAGMENT,
      name: "v-ronpa-snow-shader"
    }),
    resources: {
      snowUniforms: {
        uTime: { value: initialUniforms.uTime, type: "f32" },
        uResolution: { value: initialUniforms.uResolution, type: "vec2<f32>" },
        uPower: { value: initialUniforms.uPower, type: "f32" },
        uDensity: { value: initialUniforms.uDensity, type: "f32" },
        uFallSpeed: { value: initialUniforms.uFallSpeed, type: "f32" },
        uWind: { value: initialUniforms.uWind, type: "f32" },
        uFlakeScale: { value: initialUniforms.uFlakeScale, type: "f32" },
        uSway: { value: initialUniforms.uSway, type: "f32" },
        uFog: { value: initialUniforms.uFog, type: "f32" },
        uNoise: { value: initialUniforms.uNoise, type: "f32" },
        uSeed: { value: initialUniforms.uSeed, type: "f32" }
      }
    }
  });
  return {
    filter: filter as unknown as SnowShaderFilter,
    uniforms: filter.resources.snowUniforms.uniforms as SnowShaderUniformValues
  };
}

function createGlitchShaderFilter(width: number, height: number): { filter: GlitchShaderFilter; uniforms: GlitchShaderUniformValues } {
  const initialUniforms: GlitchShaderUniformValues = {
    uTime: 0,
    uProgress: 0,
    uResolution: new Float32Array([width, height]),
    uPower: 1,
    uBlockJump: 1,
    uBurstJump: 1,
    uPixelScatter: 1,
    uColorNoise: 1,
    uSpeed: 1,
    uSeed: 0
  };
  if (typeof document === "undefined") {
    return {
      filter: {
        resources: { glitchUniforms: { uniforms: initialUniforms } },
        destroy: () => undefined
      },
      uniforms: initialUniforms
    };
  }

  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: SNOW_SHADER_VERTEX,
      fragment: GLITCH_SHADER_FRAGMENT,
      name: "v-ronpa-morton-glitch-shader"
    }),
    resources: {
      glitchUniforms: {
        uTime: { value: initialUniforms.uTime, type: "f32" },
        uProgress: { value: initialUniforms.uProgress, type: "f32" },
        uResolution: { value: initialUniforms.uResolution, type: "vec2<f32>" },
        uPower: { value: initialUniforms.uPower, type: "f32" },
        uBlockJump: { value: initialUniforms.uBlockJump, type: "f32" },
        uBurstJump: { value: initialUniforms.uBurstJump, type: "f32" },
        uPixelScatter: { value: initialUniforms.uPixelScatter, type: "f32" },
        uColorNoise: { value: initialUniforms.uColorNoise, type: "f32" },
        uSpeed: { value: initialUniforms.uSpeed, type: "f32" },
        uSeed: { value: initialUniforms.uSeed, type: "f32" }
      }
    }
  });
  return {
    filter: filter as unknown as GlitchShaderFilter,
    uniforms: filter.resources.glitchUniforms.uniforms as GlitchShaderUniformValues
  };
}

function applyGlitchUniforms(
  uniforms: GlitchShaderUniformValues,
  controls: GlitchShaderControls,
  options: { power?: number; progress?: number } = {}
): void {
  uniforms.uPower = clamp01(options.power ?? controls.power ?? 1);
  uniforms.uBlockJump = Math.max(0, controls.blockJump ?? 1);
  uniforms.uBurstJump = Math.max(0, controls.burstJump ?? 1);
  uniforms.uPixelScatter = Math.max(0, controls.pixelScatter ?? 1);
  uniforms.uColorNoise = Math.max(0, controls.colorNoise ?? 1);
  uniforms.uSpeed = Math.max(0, controls.speed ?? 1);
  uniforms.uSeed = controls.seed ?? 0;
  if (options.progress !== undefined) uniforms.uProgress = options.progress;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const SNOW_SHADER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const SNOW_SHADER_FRAGMENT = `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
uniform float uPower;
uniform float uDensity;
uniform float uFallSpeed;
uniform float uWind;
uniform float uFlakeScale;
uniform float uSway;
uniform float uFog;
uniform float uNoise;
uniform float uSeed;

float snowHash(vec2 value, vec2 basis, float offset)
{
  return fract(sin(dot(value, basis) + offset + uSeed * 19.19) * 43758.5453);
}

void main(void)
{
  vec2 fragCoord = vTextureCoord * uResolution;
  float axis = max(1.0, uResolution.x);
  float power = clamp(uPower, 0.0, 1.0);
  float density = max(0.0, uDensity);
  float flakeScale = max(0.05, uFlakeScale);
  float fallSpeed = max(0.0, uFallSpeed);
  float sway = max(0.0, uSway);
  float snow = 0.0;
  float random = snowHash(fragCoord, vec2(12.9898, 78.233), 0.0);

  for (int k = 0; k < 6; k++) {
    for (int i = 1; i <= 12; i++) {
      float fk = float(k);
      float fi = float(i);
      float cellSize = (2.0 + fi * 3.0) / flakeScale;
      float layerSpeed = fallSpeed * (0.54 + fi * 0.072) + (sin(uTime * 0.4 + fk + fi * 20.0) + 1.0) * 0.00012;
      vec2 uv = fragCoord / axis + vec2(
        0.01 * sin((uTime + fk * 6185.0) * 0.6 + fi) * (5.0 / fi) * sway + uWind * uTime * 0.015 / fi,
        -layerSpeed * (uTime + fk * 1352.0) * (1.0 / fi)
      );
      vec2 uvStep = ceil(uv * cellSize - vec2(0.5)) / cellSize;
      float x = snowHash(uvStep, vec2(12.9898 + fk * 12.0, 78.233 + fk * 315.156), fk * 12.0) - 0.5;
      float y = snowHash(uvStep, vec2(62.2364 + fk * 23.0, 94.674 + fk * 95.0), fk * 12.0) - 0.5;
      float randomMagnitude1 = sin(uTime * 2.5) * 0.7 / cellSize;
      float randomMagnitude2 = cos(uTime * 2.5) * 0.7 / cellSize;
      vec2 flakeCenter = uvStep + vec2(x * sin(y), y) * randomMagnitude1 + vec2(y, x) * randomMagnitude2;
      float d = 5.0 * distance(flakeCenter, uv);
      float omit = snowHash(uvStep, vec2(32.4691, 94.615), fk * 5.0);
      float threshold = clamp(0.06 * density * mix(0.5, 1.05, power), 0.0, 0.28);
      if (omit < threshold) {
        float sharpness = 15.0 + x * 6.3;
        float shaped = clamp(1.9 - d * sharpness * (cellSize / 1.4), 0.0, 1.0);
        snow += (x + 1.0) * 0.4 * shaped;
      }
    }
  }

  float flurry = clamp(snow * (0.42 + density * 0.16) * (0.32 + power * 0.68), 0.0, 1.0);
  float fogGradient = smoothstep(0.0, 1.0, 1.0 - vTextureCoord.y);
  float fogAlpha = clamp(uFog, 0.0, 1.0) * power * (0.045 + fogGradient * 0.13);
  float noiseAlpha = random * max(0.0, uNoise) * power * 0.25;
  float alpha = clamp(flurry * 0.58 * power + fogAlpha + noiseAlpha, 0.0, 0.68);
  vec3 fogColor = vec3(0.62, 0.82, 1.0);
  vec3 snowColor = vec3(0.94, 0.98, 1.0);
  vec3 color = mix(fogColor, snowColor, flurry);
  finalColor = vec4(color * alpha, alpha);
}
`;

const GLITCH_SHADER_FRAGMENT = `
#version 300 es
precision highp float;
precision highp int;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uProgress;
uniform vec2 uResolution;
uniform float uPower;
uniform float uBlockJump;
uniform float uBurstJump;
uniform float uPixelScatter;
uniform float uColorNoise;
uniform float uSpeed;
uniform float uSeed;

/*
  Technical selection note:
  This shader intentionally keeps the Shadertoy Morton-code address-shuffle
  algorithm instead of approximating it with simple horizontal bands. The uint
  and uvec2 bit operations below require the WebGL2 / GLSL ES 3 path used by
  Pixi's GlProgram filter pipeline. If a future platform lacks uint shader
  support, debug failures here before replacing the algorithm with a fallback.
*/
uint SpreadBits(uint x)
{
  x &= 0x0000ffffu;
  x = (x ^ (x << 8u)) & 0x00ff00ffu;
  x = (x ^ (x << 4u)) & 0x0f0f0f0fu;
  x = (x ^ (x << 2u)) & 0x33333333u;
  x = (x ^ (x << 1u)) & 0x55555555u;
  return x;
}

uint GatherBits(uint x)
{
  x &= 0x55555555u;
  x = (x ^ (x >> 1u)) & 0x33333333u;
  x = (x ^ (x >> 2u)) & 0x0f0f0f0fu;
  x = (x ^ (x >> 4u)) & 0x00ff00ffu;
  x = (x ^ (x >> 8u)) & 0x0000ffffu;
  return x;
}

uvec2 MortonToVec2(uint morton)
{
  uvec2 res;
  res.x = GatherBits(morton >> 0u);
  res.y = GatherBits(morton >> 1u);
  return res;
}

uint Vec2ToMorton(uvec2 vec)
{
  return SpreadBits(vec.x) | (SpreadBits(vec.y) << 1u);
}

float hash11(float u, float seed)
{
  return fract(sin(u + uSeed * 131.17) * 999999.9999 + seed * 1.61803398875 + uSeed * 0.03125);
}

vec3 hash31(float p)
{
  vec3 p3 = fract(vec3(p + uSeed * 4096.0) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

float noise(float u, float size, float seed)
{
  float zoom = u * size;
  float index = floor(zoom);
  float progress = fract(zoom);
  progress = smoothstep(0.0, 1.0, progress);
  return mix(hash11(index, seed), hash11(index + 1.0, seed), progress);
}

float posterize(float u, float steps)
{
  return floor(u * steps + 0.5) / steps;
}

float threshold(float u, float edge)
{
  return u * step(edge, u);
}

void main(void)
{
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 fragCoord = vTextureCoord * resolution;
  float life = 1.0 - smoothstep(0.72, 1.0, clamp(uProgress, 0.0, 1.0));
  float power = clamp(uPower, 0.0, 1.0) * life;
  float time = max(0.0, uTime * max(0.0, uSpeed));
  /*
    Shadertoy's original iTime gates are intentionally slow; in a VN scene a
    persistent low-power filter can look frozen for several seconds. These
    shared beat offsets keep the Morton/hash structure but adapt its cadence for
    both @glitch pulses and @glitchFilter, avoiding a filter-specific branch.
  */
  float rapidBeat = floor(time * 5.0);
  float blockBeat = floor(time * 1.25);
  float colorBeat = floor(time * 1.7);
  float temporalPulse = mix(0.72, 1.18, hash11(rapidBeat, uSeed + 23.0));
  vec2 pixel = clamp(floor(fragCoord), vec2(0.0), vec2(65535.0));
  float i = float(Vec2ToMorton(uvec2(pixel)));

  float n1 = noise(i + blockBeat * 17.0, 1e-3, floor(time * 0.1619) + blockBeat + uSeed);
  n1 = posterize(n1, 4.0);
  n1 = threshold(n1, mix(0.96, 0.68, clamp(power * uBlockJump * temporalPulse, 0.0, 1.0)));

  float n2 = noise(i + rapidBeat * 31.0, 1e-5, floor(time * 3.12349) + rapidBeat + uSeed * 1.7);
  n2 = posterize(n2, 20.0);
  n2 = threshold(n2, mix(0.985, 0.88, clamp(power * uBurstJump * temporalPulse, 0.0, 1.0)));

  float n3 = noise(i + rapidBeat * 7.0, 1e3, floor(time * 0.12349) + rapidBeat + uSeed * 2.3);
  n3 = threshold(n3, mix(0.965, 0.88, clamp(power * uPixelScatter * temporalPulse, 0.0, 1.0)));

  float n4 = noise(i + colorBeat * 11.0, 0.01, colorBeat + uSeed * 3.1);

  i += n1 * 40.0 * max(0.0, uBlockJump) * power;
  i += n2 * 1000.0 * max(0.0, uBurstJump) * power;
  i += n3 * 100.0 * max(0.0, uPixelScatter) * power;

  vec2 uv = clamp(vec2(MortonToVec2(uint(max(0.0, i)))) / resolution, vec2(0.0), vec2(1.0));
  vec4 source = texture(uTexture, uv);
  float colorEdge = hash11(floor(time * 2.0), 1.0) * 0.1 + mix(0.97, 0.84, clamp(power * uColorNoise * temporalPulse, 0.0, 1.0));
  float colorMix = step(colorEdge, n4) * clamp(power * uColorNoise, 0.0, 1.0);
  vec3 randomColor = hash31(i) * source.a;
  finalColor = vec4(mix(source.rgb, randomColor, colorMix), source.a);
}
`;
