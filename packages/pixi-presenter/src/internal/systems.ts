import { Easing, Group, Tween } from "@tweenjs/tween.js";
import {
  Assets,
  BlurFilter,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
  TilingSprite,
  type Filter,
  type Ticker
} from "pixi.js";
import { GlitchFilter, GodrayFilter, KawaseBlurFilter, RGBSplitFilter } from "pixi-filters";
import type { PixiActorSnapshot, PixiStageSnapshot, PixiWeatherSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "../stageSnapshot";
import { getBuiltInPixiFxTexture } from "./fxAssets";
import type { PixiPresentationTaskHandle, PresentationTaskController } from "./presentationTasks";
import { calculatePortraitLayout, formatFallbackPortraitLabel, resolveHarnessPortraitUrl } from "./portraits";

export interface PixiPresenterSystemsOptions {
  root: Container;
  width: () => number;
  height: () => number;
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
}

type WeatherParticle = Sprite | TilingSprite;

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

export class FilterSystem {
  constructor(private readonly options?: { width: () => number; height: () => number }) {}

  applyActorFilters(container: Container, actor: PixiActorSnapshot): void {
    const filters: Filter[] = [];
    const blur = actor.filters.blur ?? 0;
    if (blur > 0) filters.push(new BlurFilter({ strength: Math.max(0.1, blur * 6), quality: 3 }));
    if (filters.length > 0 && this.options) {
      container.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
    }
    container.filters = filters.length > 0 ? filters : null;
  }

  applyScreenFilters(root: Container, snapshot: PixiStageSnapshot): void {
    const filters: Filter[] = [];
    const bokehPower = snapshot.screenFilters.bokeh?.power ?? 0;
    if (bokehPower > 0) filters.push(new KawaseBlurFilter({ strength: Math.max(1, bokehPower * 8), quality: 4 }));
    if (filters.length > 0 && this.options) {
      root.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
    }
    root.filters = filters.length > 0 ? filters : null;
  }

  createTransientFilters(hint: PixiStageRenderHint): Filter[] {
    if (hint.type === "glitch") {
      const glitch = new GlitchFilter({ offset: Math.max(2, hint.power * 18), slices: Math.max(4, Math.round(hint.power * 8)) });
      const split = new RGBSplitFilter({ red: [-hint.power * 4, 0], green: [0, 0], blue: [hint.power * 4, 0] });
      return [glitch, split];
    }
    return [];
  }

  createSunFilter(power: number): Filter {
    return new GodrayFilter({ gain: Math.max(0.35, power), lacunarity: 2.6, parallel: true });
  }
}

export class ActorSystem {
  private readonly backgroundLayer = new Container({ label: "backgrounds" });
  private readonly characterLayer = new Container({ label: "characters" });
  private readonly actors = new Map<string, ActorRecord>();

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly filters: FilterSystem,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {
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
    const contentKey = `${actor.kind}:${actor.appearance ?? "missing"}:${actor.pose ?? ""}`;
    const shouldAnimate = animate && actor.transition.durationMs > 0;
    const transition = shouldAnimate ? this.createActorTransitionScheduler(actor, revision) : undefined;
    const filtersChanged = !sameActorFilters(actor.filters, previous.filters);
    let contentAlphaAnimated = false;
    if (record.contentKey !== contentKey) {
      record.contentGeneration += 1;
      record.container.removeChildren();
      if (actor.kind === "background") this.drawBackground(record.container, actor);
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

  private drawBackground(container: Container, actor: PixiActorSnapshot): void {
    const width = this.options.width();
    const height = this.options.height();
    const color = colorFromId(actor.appearance ?? "background");
    const plate = new Graphics()
      .rect(0, 0, width, height)
      .fill({ color, alpha: 0.78 })
      .rect(32, 32, width - 64, height - 64)
      .stroke({ color: 0x83e4d3, width: 2, alpha: 0.28 });
    const title = new Text({
      text: actor.appearance ?? actor.id,
      style: { fill: 0xeef8ff, fontSize: 18, fontFamily: "Inter, ui-sans-serif, system-ui", letterSpacing: 0 }
    });
    title.x = 48;
    title.y = 42;
    container.addChild(plate, title);
  }

  private drawCharacter(record: ActorRecord, actor: PixiActorSnapshot): void {
    const container = record.container;
    const contentGeneration = record.contentGeneration;
    const width = this.options.width();
    const height = this.options.height();
    const layout = calculatePortraitLayout(width, height, nearestSlot(actor.pos?.[0] ?? 0.5));
    const group = new Container({ label: actor.appearance ?? actor.id });
    const portraitUrl = resolveHarnessPortraitUrl(actor.appearance);
    const fallback = this.createFallbackCharacter(actor, layout.maxWidth, layout.maxHeight, Boolean(portraitUrl));
    group.addChild(fallback);
    if (portraitUrl) {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.anchor.set(0.5, 1);
      sprite.visible = false;
      group.addChild(sprite);
      void Assets.load<Texture>(portraitUrl)
        .then((texture) => {
          if (!sprite.parent || record.contentGeneration !== contentGeneration) return;
          sprite.texture = texture;
          fitSprite(sprite, texture, layout.maxWidth, layout.maxHeight);
          sprite.visible = true;
          fallback.visible = false;
        })
        .catch(() => {
          fallback.visible = true;
        });
    } else {
      fallback.visible = true;
    }
    const name = new Text({ text: actor.id.replace(/^character:/, ""), style: { fill: 0xffffff, fontSize: 14, fontWeight: "700" } });
    name.anchor.set(0.5, 0);
    name.y = 10;
    group.addChild(name);
    container.addChild(group);
  }

  private createFallbackCharacter(actor: PixiActorSnapshot, maxWidth: number, maxHeight: number, loadingPortrait: boolean): Container {
    const bodyWidth = Math.min(170, maxWidth);
    const bodyHeight = Math.min(300, maxHeight);
    const fallback = new Container({ label: `fallback:${actor.id}` });
    const body = new Graphics()
      .roundRect(-bodyWidth / 2, -bodyHeight, bodyWidth, bodyHeight, 18)
      .fill({ color: colorFromId(actor.id), alpha: loadingPortrait ? 0.42 : 0.94 })
      .stroke({ color: 0xffd166, width: 3, alpha: loadingPortrait ? 0.34 : 0.76 });
    const missing = new Text({
      text: loadingPortrait ? actor.id.replace(/^character:/, "") : formatFallbackPortraitLabel(actor.id, actor.appearance),
      style: { align: "center", fill: 0xfff2c2, fontSize: 13, fontWeight: "700", lineHeight: 17, wordWrap: true, wordWrapWidth: bodyWidth - 20 }
    });
    missing.anchor.set(0.5);
    missing.y = -bodyHeight * 0.34;
    fallback.addChild(body, missing);
    return fallback;
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
    for (const [kind, weather] of Object.entries(snapshot.weather)) {
      if (weather.power <= 0) {
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
      const speedY = record.snapshot.ySpeed ?? (record.snapshot.kind === "snow" ? 0.45 : 6);
      const speedX = record.snapshot.xSpeed ?? (record.snapshot.kind === "rain" ? -1.6 : 0.25);
      for (const particle of record.particles) {
        if (particle instanceof TilingSprite) {
          particle.tilePosition.x += speedX * ticker.deltaMS * 0.05;
          particle.tilePosition.y += speedY * ticker.deltaMS * 0.05;
          continue;
        }
        particle.x += speedX * ticker.deltaMS * 0.06;
        particle.y += speedY * ticker.deltaMS * 0.06;
        particle.rotation += (record.snapshot.kind === "snow" ? 0.002 : 0) * ticker.deltaMS;
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
    const targetAlpha = clamp01(snapshot.power);
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
    record.container.filters = kind === "sun" ? [this.filters.createSunFilter(snapshot.power)] : null;
    this.applyParticleStyle(record);
  }

  private populate(record: WeatherRecord): void {
    const count = record.snapshot.kind === "rain" ? 3 : record.snapshot.kind === "snow" ? 2 : 1;
    const texture = createWeatherTexture(record.snapshot.kind);
    const width = this.options.width();
    const height = this.options.height();
    for (let i = 0; i < count; i += 1) {
      const particle = createWeatherParticle(record.snapshot.kind, texture, width, height, i);
      if (!(particle instanceof TilingSprite)) {
        particle.x = Math.random() * width;
        particle.y = Math.random() * height;
      }
      record.container.addChild(particle);
      record.particles.push(particle);
    }
    this.applyParticleStyle(record);
  }

  private applyParticleStyle(record: WeatherRecord): void {
    const power = clamp01(record.snapshot.power);
    const externalScale = record.snapshot.scale?.[0] ?? 1;
    const activeCount =
      record.snapshot.kind === "sun"
        ? record.particles.length
        : Math.max(1, Math.round(record.particles.length * power));
    record.particles.forEach((particle, index) => {
      particle.visible = index < activeCount;
      if (record.snapshot.kind === "rain") {
        particle.alpha = 0.24 + power * (index === 0 ? 0.24 : 0.18);
        particle.rotation = -0.04;
        if (particle instanceof TilingSprite) {
          particle.width = this.options.width() + 520;
          particle.height = this.options.height() + 520;
          particle.x = -260;
          particle.y = -260;
          particle.tileScale.set((0.42 + index * 0.13) * externalScale);
          particle.tileRotation = -0.08;
        } else {
          particle.scale.set((0.42 + (index % 5) * 0.045) * externalScale);
        }
      } else if (record.snapshot.kind === "snow") {
        particle.alpha = 0.1 + power * (index === 0 ? 0.16 : 0.12);
        if (particle instanceof TilingSprite) {
          particle.width = this.options.width() + 420;
          particle.height = this.options.height() + 420;
          particle.x = -210;
          particle.y = -210;
          particle.tileScale.set((0.55 + index * 0.24) * externalScale);
          particle.tileRotation = index % 2 === 0 ? 0.02 : -0.025;
        } else {
          particle.scale.set((0.19 + (index % 4) * 0.035) * externalScale);
        }
      } else {
        particle.alpha = 0.26 + power * 0.36;
        particle.scale.set(2.4 * externalScale);
      }
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
    record.container.removeFromParent();
    record.container.destroy({ children: true });
    this.records.delete(kind);
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
  private readonly rootEffects = new Set<Container>();

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly actors: ActorSystem,
    private readonly filters: FilterSystem,
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
    for (const group of this.rootEffects) {
      group.removeFromParent();
      group.destroy({ children: true });
    }
    this.rootEffects.clear();
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
    const group = new Container({ label: "glitch-overlay" });
    const width = this.options.width();
    const height = this.options.height();
    const power = clamp01(hint.power);
    const staticNoise = new Sprite(getBuiltInPixiFxTexture("noise"));
    staticNoise.width = width;
    staticNoise.height = height;
    staticNoise.alpha = Math.min(0.52, 0.24 + power * 0.24);
    staticNoise.tint = 0x9fd8ff;
    const scanline = new Sprite(getBuiltInPixiFxTexture("glitch-scanline"));
    scanline.width = width;
    scanline.height = height;
    scanline.alpha = Math.min(1, 0.58 + power * 0.32);
    const scanlineOffset = new Sprite(getBuiltInPixiFxTexture("glitch-scanline"));
    scanlineOffset.x = -Math.round(width * 0.08);
    scanlineOffset.y = Math.round(height * 0.06);
    scanlineOffset.width = Math.round(width * 1.14);
    scanlineOffset.height = height;
    scanlineOffset.alpha = Math.min(0.9, 0.44 + power * 0.36);
    scanlineOffset.tint = 0xff6aa8;
    const noise = new Sprite(getBuiltInPixiFxTexture("chromatic-noise"));
    noise.width = width;
    noise.height = height;
    noise.alpha = Math.min(0.9, 0.46 + power * 0.32);
    const blueNoise = new Sprite(getBuiltInPixiFxTexture("blue-noise"));
    blueNoise.width = width;
    blueNoise.height = height;
    blueNoise.alpha = Math.min(0.72, 0.3 + power * 0.34);
    group.addChild(staticNoise, scanline, scanlineOffset, noise, blueNoise);
    for (let index = 0; index < Math.max(3, Math.round(power * 5)); index += 1) {
      const band = new Sprite(getBuiltInPixiFxTexture("glitch-scanline"));
      band.x = index % 2 === 0 ? -Math.round(width * 0.08) : Math.round(width * 0.04);
      band.y = Math.round(((index * 137) % Math.max(1, height - 56)) + 12);
      band.width = Math.round(width * (1.04 + (index % 3) * 0.06));
      band.height = 18 + (index % 3) * 14;
      band.alpha = Math.min(0.95, 0.62 + power * 0.22);
      band.tint = index % 3 === 0 ? 0xff4f8f : index % 3 === 1 ? 0x63e6be : 0x8fd3ff;
      group.addChild(band);
    }
    scanline.filters = this.filters.createTransientFilters(hint);
    scanline.filterArea = new Rectangle(0, 0, width, height);
    group.zIndex = 32;
    this.rootEffects.add(group);
    this.options.root.addChild(group);
    const holdMs = Math.min(650, Math.max(120, hint.durationMs * 0.55));
    const cleanup = () => {
      this.rootEffects.delete(group);
      group.removeFromParent();
      group.destroy({ children: true });
    };
    let handle: TweenHandle | undefined;
    const task = this.tasks.start({
      kind: "glitch",
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
    handle = this.tweens.tween(
      group as unknown as Record<string, number>,
      { alpha: 0 },
      Math.max(80, hint.durationMs - holdMs),
      "linear",
      () => {
        if (!task.isCurrent()) return;
        cleanup();
        task.complete();
      },
      holdMs
    );
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

function nearestSlot(x: number): "left" | "center" | "right" {
  if (x < 0.38) return "left";
  if (x > 0.62) return "right";
  return "center";
}

function sameVector2(left: [number, number] | undefined, right: [number, number] | undefined): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return Math.abs(left[0] - right[0]) < 0.0001 && Math.abs(left[1] - right[1]) < 0.0001;
}

function sameActorFilters(left: PixiActorSnapshot["filters"], right: PixiActorSnapshot["filters"]): boolean {
  return Math.abs((left.blur ?? 0) - (right.blur ?? 0)) < 0.0001 && Math.abs((left.bokeh ?? 0) - (right.bokeh ?? 0)) < 0.0001;
}

function fitSprite(sprite: Sprite, texture: Texture, maxWidth: number, maxHeight: number): void {
  const textureWidth = Math.max(1, texture.width);
  const textureHeight = Math.max(1, texture.height);
  const scale = Math.min(maxWidth / textureWidth, maxHeight / textureHeight);
  sprite.width = textureWidth * scale;
  sprite.height = textureHeight * scale;
}

function createWeatherContainer(kind: string): Container {
  return new Container({ label: `weather:${kind}` });
}

function createWeatherTexture(kind: string): Texture {
  if (kind === "rain") return getBuiltInPixiFxTexture("rain-streak");
  if (kind === "snow") return getBuiltInPixiFxTexture("snowflake-atlas");
  return getBuiltInPixiFxTexture("godray-mask");
}

function createWeatherParticle(kind: string, texture: Texture, width: number, height: number, index: number): WeatherParticle {
  if (kind === "rain" || kind === "snow") {
    const margin = kind === "rain" ? 520 : 420;
    return new TilingSprite({
      texture,
      width: width + margin,
      height: height + margin,
      tilePosition: { x: index * 97, y: index * 131 },
      tileScale: { x: 1, y: 1 }
    });
  }
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  return sprite;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
