import {
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
  type Ticker
} from "pixi.js";
import type {
  PixiActorSnapshot,
  PixiStageSnapshot,
} from "@v-ronpa/contracts";
import { INNER_BACKGROUND_ID, type PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import type { LayeredCharacterPreloadPlan } from "@v-ronpa/layered-character";
import type { PixiPresentationTaskHandle, PresentationTaskController } from "./presentationTasks";
import { pixiAssetLoadFailed, resolvePixiAsset } from "./assetResolver";
import {
  CharacterSystem,
  type CharacterPreparationResult,
  type CharacterPresentation,
  type CharacterSignalMaskState
} from "./characters";
import { CharacterToneController } from "./effects/characterToneController";
import { ActorBlurController } from "./effects/blur";
import type { PixiActorSystemOptions, PixiPresenterSystemsOptions } from "./systemTypes";
import {
  TweenSystem,
  type NumericLiveState,
  type TweenHandle
} from "./effects/animation";

interface ActorRecord {
  actor: PixiActorSnapshot;
  container: Container;
  contentKey: string;
  backgroundGeneration: number;
  layout?: ActorLayoutRecord;
  positionTransition?: ActorPositionTransition;
  filterLive: NumericLiveState;
}

type ActorLayoutRecord = BackgroundLayoutRecord | InnerBackgroundLayoutRecord | CharacterLayoutRecord;

interface BackgroundFallbackLayout {
  container: Container;
  plate: Graphics;
  title: Text;
  style: ReturnType<typeof backgroundStyleFromId>;
}

interface BackgroundLayoutRecord {
  kind: "background";
  fallback: BackgroundFallbackLayout;
  sprite?: Sprite;
  texture?: Texture;
}

interface InnerBackgroundLayoutRecord {
  kind: "inner-background";
  fallback: BackgroundFallbackLayout;
  matte: Graphics;
  mask: Graphics;
  stroke: Graphics;
  sprite?: Sprite;
  texture?: Texture;
}

interface CharacterLayoutRecord {
  kind: "character";
  presentation: CharacterPresentation;
}

interface ActorPositionTransition {
  from: [number, number] | undefined;
  to: [number, number] | undefined;
  progress: { value: number };
}

/** Actor-only filter boundary. Persistent screen filters live in their family. */
export class ActorFilterSystem {
  private readonly actorBlur: ActorBlurController;

  constructor(options: PixiPresenterSystemsOptions) {
    this.actorBlur = new ActorBlurController(options);
  }

  applyActorFilters(container: Container, actor: PixiActorSnapshot, liveFilters: Partial<Record<string, number>> = { blur: actor.filters.blur, bokeh: actor.filters.bokeh }): void {
    this.actorBlur.apply(container, actor, liveFilters);
  }

  releaseActorFilters(container: Container): void {
    this.actorBlur.release(container);
  }

  relayoutActorFilterArea(container: Container): void {
    this.actorBlur.relayout(container);
  }

  clear(): void {}
  destroy(): void { this.clear(); }
}

export interface InnerBackgroundFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const INNER_BACKGROUND_FRAME_WIDTH_SCALE = 0.766;
const INNER_BACKGROUND_FRAME_HEIGHT_SCALE = 0.558974358974359;
const INNER_BACKGROUND_FRAME_TOP_SCALE = 0.13846153846153847;
const INNER_BACKGROUND_IMAGE_INSET_PX = 8;

export class ActorSystem {
  private readonly backgroundLayer = new Container({ label: "backgrounds" });
  private readonly innerBackLayer = new Container({ label: "inner-backgrounds" });
  private readonly characterLayer = new Container({ label: "characters" });
  private readonly actors = new Map<string, ActorRecord>();
  private readonly characters: CharacterSystem;
  private readonly characterTone: CharacterToneController;

  constructor(
    private readonly options: PixiActorSystemOptions,
    private readonly filters: ActorFilterSystem,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {
    this.characters = new CharacterSystem(options);
    this.characterTone = new CharacterToneController(tweens, tasks);
    this.backgroundLayer.zIndex = 0;
    this.innerBackLayer.zIndex = 2;
    this.characterLayer.zIndex = 10;
    options.root.sortableChildren = true;
    options.root.addChild(this.backgroundLayer, this.innerBackLayer, this.characterLayer);
  }

  reconcile(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[] = []): void {
    this.characterTone.reconcile(snapshot.characterTone, animate, snapshot.revision, hints);
    const activeIds = new Set([
      ...Object.keys(snapshot.backgroundsById),
      ...Object.keys(snapshot.innerBackgroundsById),
      ...Object.keys(snapshot.charactersById)
    ]);
    for (const id of [...this.actors.keys()]) {
      if (!activeIds.has(id)) this.remove(id);
    }

    for (const actor of Object.values(snapshot.backgroundsById)) this.upsert(actor, animate, snapshot.revision);
    for (const actor of Object.values(snapshot.innerBackgroundsById)) this.upsert(actor, animate, snapshot.revision);
    const orderedCharacters = snapshot.actorOrder
      .map((id) => snapshot.charactersById[id])
      .filter((actor): actor is PixiActorSnapshot => Boolean(actor));
    orderedCharacters.forEach((actor, index) => this.upsert({ ...actor, z: actor.z ?? index }, animate, snapshot.revision));
    this.characterLayer.sortableChildren = true;
  }

  preloadCharacters(plan: LayeredCharacterPreloadPlan): Promise<CharacterPreparationResult> {
    return this.characters.preload(plan);
  }

  tick(ticker: Ticker): void {
    for (const record of this.actors.values()) {
      if (record.layout?.kind === "character") record.layout.presentation.tick(Math.max(0, ticker.deltaMS));
    }
  }

  clear(): void {
    for (const id of [...this.actors.keys()]) this.remove(id);
  }

  destroy(): void {
    this.clear();
    this.characterTone.destroy();
    this.characters.destroy();
  }

  relayoutViewport(): void {
    for (const record of this.actors.values()) {
      this.relayoutActorContent(record);
      this.applyCurrentActorPosition(record);
      this.filters.relayoutActorFilterArea(record.container);
    }
  }

  getLayerForEffects(target: string): Container | undefined {
    if (target === "stage" || target === "camera") return this.options.root;
    return this.actors.get(target)?.container;
  }

  private upsert(actor: PixiActorSnapshot, animate: boolean, revision: number): void {
    const record = this.ensure(actor);
    const isNewActor = record.contentKey === "";
    const previous = isNewActor ? { ...record.actor, visible: false, alpha: 0 } : record.actor;
    const contentKey = actor.kind === "character"
      ? `${actor.kind}:${actor.id}:${actor.appearanceExpression}:${actor.pose ?? ""}`
      : `${actor.kind}:${actor.appearance ?? "missing"}:${actor.pose ?? ""}`;
    // Terminal actor transitions remain in the snapshot after their command.
    // Reference identity tells us whether this actor family was actually
    // updated, preventing unrelated screen/weather revisions from replaying it.
    const transitionIssued = isNewActor || previous.transition !== actor.transition || !sameActorVisual(previous, actor);
    const shouldAnimate = animate && actor.transition.durationMs > 0 && transitionIssued;
    const transition = shouldAnimate ? this.createActorTransitionScheduler(actor, revision) : undefined;
    const filtersChanged = !sameActorFilters(actor.filters, previous.filters);
    if (record.contentKey !== contentKey) {
      if (actor.kind === "background") {
        record.backgroundGeneration += 1;
        for (const child of record.container.removeChildren()) child.destroy({ children: true });
        if (actor.id === INNER_BACKGROUND_ID) this.drawInnerBackground(record, actor);
        else this.drawBackground(record, actor);
      }
      else {
        const presentation = record.layout?.kind === "character"
          ? record.layout.presentation
          : this.createCharacterPresentation(record, actor.id);
        const crossfade = shouldAnimate && !isNewActor && previous.visible && actor.visible && previous.alpha > 0 && actor.alpha > 0;
        const contentTransition = presentation.replace(this.characters.instantiate(actor), crossfade);
        if (contentTransition && transition) {
          transition.onStop(contentTransition.settle);
          transition.tween(
            contentTransition.outgoing as unknown as Record<string, number>,
            { value: 0 },
            actor.transition.durationMs,
            actor.transition.easing,
            undefined,
            contentTransition.syncOutgoing
          );
          transition.tween(
            contentTransition.incoming as unknown as Record<string, number>,
            { value: 1 },
            actor.transition.durationMs,
            actor.transition.easing,
            contentTransition.settle,
            contentTransition.syncIncoming
          );
        }
      }
      record.contentKey = contentKey;
    }
    this.applyTransform(record, actor, previous, shouldAnimate, transition);
    if (shouldAnimate && filtersChanged) {
      transition?.tween(
        record.filterLive,
        { blur: actor.filters.blur ?? 0, ...signalMaskLive(actor) },
        actor.transition.durationMs,
        actor.transition.easing,
        undefined,
        () => this.applyActorVisualFilters(record, actor, previous)
      );
    } else {
      record.filterLive.blur = actor.filters.blur ?? 0;
      Object.assign(record.filterLive, signalMaskLive(actor));
    }
    if (shouldAnimate && actor.transition.wait && transition && !transition.hasWork()) {
      transition.tween({ value: 0 }, { value: 1 }, actor.transition.durationMs, actor.transition.easing);
    }
    record.actor = actor;
    this.applyActorVisualFilters(record, actor, previous);
    if (record.layout?.kind === "character") record.layout.presentation.syncOutlineTransform();
  }

  private applyActorVisualFilters(record: ActorRecord, actor: PixiActorSnapshot, previous: PixiActorSnapshot): void {
    this.filters.applyActorFilters(record.container, actor, record.filterLive);
    if (record.layout?.kind !== "character") return;
    const config = actor.filters.signalMask ?? previous.filters.signalMask;
    const power = record.filterLive.signalPower ?? 0;
    const state: CharacterSignalMaskState | undefined = config && power > 0.001 ? {
      region: config.region,
      power,
      bands: record.filterLive.signalBands ?? config.bands,
      noise: record.filterLive.signalNoise ?? config.noise,
      chroma: record.filterLive.signalChroma ?? config.chroma,
      speed: record.filterLive.signalSpeed ?? config.speed,
      threshold: record.filterLive.signalThreshold ?? config.threshold,
      seed: config.seed
    } : undefined;
    record.layout.presentation.setSignalMask(state);
  }

  private ensure(actor: PixiActorSnapshot): ActorRecord {
    const existing = this.actors.get(actor.id);
    if (existing) return existing;
    const container = new Container({ label: `actor:${actor.id}` });
    const layer = actor.kind === "background"
      ? actor.id === INNER_BACKGROUND_ID
        ? this.innerBackLayer
        : this.backgroundLayer
      : this.characterLayer;
    layer.addChild(container);
    const record: ActorRecord = {
      actor,
      container,
      contentKey: "",
      backgroundGeneration: 0,
      filterLive: { blur: actor.filters.blur ?? 0, ...signalMaskLive(actor) }
    };
    this.actors.set(actor.id, record);
    return record;
  }

  private remove(id: string): void {
    const record = this.actors.get(id);
    if (!record) return;
    this.tasks.cancelTarget(id);
    this.filters.releaseActorFilters(record.container);
    if (record.layout?.kind === "character") {
      this.characterTone.unregister(record.layout.presentation);
      record.layout.presentation.destroy();
    }
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
      onComplete?: () => void,
      onUpdate?: () => void
    ) => void;
    hasWork: () => boolean;
    onStop: (callback: () => void) => void;
  } {
    let task: PixiPresentationTaskHandle | undefined;
    let pending = 0;
    const handles: TweenHandle[] = [];
    const stopCallbacks: Array<() => void> = [];
    const settleCallbacks: Array<() => void> = [];
    const stop = (settle: boolean) => {
      handles.forEach((handle) => handle.stop());
      if (settle) settleCallbacks.splice(0).forEach((callback) => callback());
      stopCallbacks.splice(0).forEach((callback) => callback());
    };
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
        onCancel: () => stop(false),
        onSettle: () => stop(true)
      });
      return task;
    };
    return {
      hasWork: () => pending > 0 || Boolean(task),
      onStop: (callback) => stopCallbacks.push(callback),
      tween: (target, to, durationMs, easingName, onComplete, onUpdate) => {
        ensureTask();
        pending += 1;
        settleCallbacks.push(() => {
          Object.assign(target, to);
          onUpdate?.();
          onComplete?.();
        });
        const handle = this.tweens.tween(target, to, durationMs, easingName, () => {
          if (task?.isCurrent()) onComplete?.();
          completeOne();
        }, 0, onUpdate);
        handles.push(handle);
      }
    };
  }

  private createCharacterPresentation(record: ActorRecord, actorId: string): CharacterPresentation {
    for (const child of record.container.removeChildren()) child.destroy({ children: true });
    const presentation = this.characters.createPresentation(actorId);
    this.characterTone.register(presentation);
    record.layout = { kind: "character", presentation };
    record.container.addChild(presentation.root);
    return presentation;
  }

  private drawBackground(record: ActorRecord, actor: PixiActorSnapshot): void {
    const container = record.container;
    const backgroundGeneration = record.backgroundGeneration;
    const fallback = this.createFallbackBackground(actor);
    const layout: BackgroundLayoutRecord = { kind: "background", fallback };
    record.layout = layout;
    container.addChild(fallback.container);
    this.relayoutBackground(layout);
    const backgroundId = actor.appearance;
    const backgroundUrl = backgroundId ? resolvePixiAsset(this.options.assetResolver, { id: backgroundId, capability: "image" }, this.options.onDiagnostic) : undefined;
    if (backgroundId && backgroundUrl) {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.visible = false;
      container.addChildAt(sprite, 0);
      layout.sprite = sprite;
      void Assets.load<Texture>(backgroundUrl)
        .then((texture) => {
          if (!sprite.parent || record.backgroundGeneration !== backgroundGeneration || record.layout !== layout) return;
          sprite.texture = texture;
          layout.texture = texture;
          this.relayoutBackground(layout);
          sprite.visible = true;
          fallback.container.visible = false;
        })
        .catch((error) => {
          this.options.onDiagnostic?.(pixiAssetLoadFailed({ id: backgroundId, capability: "image" }, error));
          fallback.container.visible = true;
        });
    }
  }

  private createFallbackBackground(actor: PixiActorSnapshot): BackgroundFallbackLayout {
    const fallback = new Container({ label: `fallback:${actor.id}` });
    const style = backgroundStyleFromId(actor.appearance ?? "background");
    const plate = new Graphics();
    const title = new Text({
      text: actor.appearance ?? actor.id,
      style: { fill: 0xeef8ff, fontSize: 18, fontFamily: "Inter, ui-sans-serif, system-ui", letterSpacing: 0 }
    });
    fallback.addChild(plate, title);
    return { container: fallback, plate, title, style };
  }

  private drawInnerBackground(record: ActorRecord, actor: PixiActorSnapshot): void {
    const container = record.container;
    const backgroundGeneration = record.backgroundGeneration;
    const frameRoot = new Container({ label: `inner-background-frame:${actor.id}` });
    const masked = new Container({ label: `inner-background-content:${actor.id}` });
    const matte = new Graphics();
    matte.label = "inner-background-matte";
    const mask = new Graphics();
    mask.label = `inner-background-mask:${actor.id}`;
    masked.mask = mask;
    const fallback = this.createInnerBackgroundFallback(actor);
    const stroke = new Graphics();
    stroke.label = "inner-background-stroke";
    const layout: InnerBackgroundLayoutRecord = { kind: "inner-background", fallback, matte, mask, stroke };
    record.layout = layout;
    masked.addChild(fallback.container);
    frameRoot.addChild(matte, masked, mask, stroke);
    container.addChild(frameRoot);
    this.relayoutInnerBackground(layout);

    const backgroundId = actor.appearance;
    const backgroundUrl = backgroundId ? resolvePixiAsset(this.options.assetResolver, { id: backgroundId, capability: "image" }, this.options.onDiagnostic) : undefined;
    if (backgroundId && backgroundUrl) {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.visible = false;
      masked.addChildAt(sprite, 0);
      layout.sprite = sprite;
      void Assets.load<Texture>(backgroundUrl)
        .then((texture) => {
          if (!sprite.parent || record.backgroundGeneration !== backgroundGeneration || record.layout !== layout) return;
          sprite.texture = texture;
          layout.texture = texture;
          this.relayoutInnerBackground(layout);
          sprite.visible = true;
          fallback.container.visible = false;
        })
        .catch((error) => {
          this.options.onDiagnostic?.(pixiAssetLoadFailed({ id: backgroundId, capability: "image" }, error));
          fallback.container.visible = true;
        });
    }
  }

  private createInnerBackgroundFallback(actor: PixiActorSnapshot): BackgroundFallbackLayout {
    const fallback = new Container({ label: `fallback:${actor.id}` });
    const style = backgroundStyleFromId(actor.appearance ?? "inner-background");
    const plate = new Graphics();
    const title = new Text({
      text: actor.appearance ?? actor.id,
      style: { fill: 0xeef8ff, fontSize: 16, fontFamily: "Inter, ui-sans-serif, system-ui", letterSpacing: 0 }
    });
    fallback.addChild(plate, title);
    return { container: fallback, plate, title, style };
  }

  private relayoutActorContent(record: ActorRecord): void {
    const layout = record.layout;
    if (!layout) return;
    if (layout.kind === "background") {
      this.relayoutBackground(layout);
      return;
    }
    if (layout.kind === "inner-background") {
      this.relayoutInnerBackground(layout);
      return;
    }
    layout.presentation.relayout();
  }

  private relayoutBackground(layout: BackgroundLayoutRecord): void {
    const width = this.options.width();
    const height = this.options.height();
    this.drawBackgroundFallback(layout.fallback, width, height);
    if (layout.sprite && layout.texture) {
      fitBackgroundSprite(layout.sprite, layout.texture, width, height);
    }
  }

  private relayoutInnerBackground(layout: InnerBackgroundLayoutRecord): void {
    const frame = resolveInnerBackgroundFrameRect(this.options.width(), this.options.height());
    const imageRect = insetRect(frame, INNER_BACKGROUND_IMAGE_INSET_PX);
    drawInnerBackgroundMatte(layout.matte, frame);
    drawInnerBackgroundMask(layout.mask, imageRect);
    drawInnerBackgroundStroke(layout.stroke, frame);
    this.drawInnerBackgroundFallback(layout.fallback, imageRect);
    if (layout.sprite && layout.texture) {
      fitSpriteToRect(layout.sprite, layout.texture, imageRect);
    }
  }

  private drawBackgroundFallback(layout: BackgroundFallbackLayout, width: number, height: number): void {
    layout.plate
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: layout.style.color, alpha: layout.style.alpha })
      .rect(32, 32, Math.max(1, width - 64), Math.max(1, height - 64))
      .stroke({ color: 0x83e4d3, width: 2, alpha: layout.style.strokeAlpha });
    layout.title.x = 48;
    layout.title.y = 42;
  }

  private drawInnerBackgroundFallback(layout: BackgroundFallbackLayout, frame: InnerBackgroundFrameRect): void {
    layout.plate
      .clear()
      .rect(frame.x, frame.y, frame.width, frame.height)
      .fill({ color: layout.style.color, alpha: layout.style.alpha })
      .rect(frame.x + 18, frame.y + 18, Math.max(1, frame.width - 36), Math.max(1, frame.height - 36))
      .stroke({ color: 0x83e4d3, width: 2, alpha: layout.style.strokeAlpha });
    layout.title.x = frame.x + 28;
    layout.title.y = frame.y + 26;
  }

  private applyTransform(
    record: ActorRecord,
    actor: PixiActorSnapshot,
    previous: PixiActorSnapshot,
    shouldAnimate: boolean,
    transition?: ReturnType<ActorSystem["createActorTransitionScheduler"]>
  ): void {
    const container = record.container;
    const presentation = record.layout?.kind === "character" ? record.layout.presentation : undefined;
    const opacityTarget = (presentation?.opacity ?? container) as unknown as Record<string, number>;
    const opacityValue = () => presentation ? presentation.opacity.value : container.alpha;
    const applyOpacity = (value: number) => {
      if (presentation) {
        presentation.opacity.value = value;
        container.alpha = 1;
        presentation.syncOpacity();
      } else {
        container.alpha = value;
      }
    };
    const target = this.toScreenPosition(actor, actor.pos);
    const targetAlpha = actor.visible ? actor.alpha : 0;
    if (shouldAnimate && !actor.transition.lazy) {
      const previousTarget = this.toScreenPosition(previous, previous.pos);
      container.x = previousTarget.x;
      container.y = previousTarget.y;
      applyOpacity(previous.visible ? previous.alpha : 0);
      container.visible = previous.visible || actor.visible;
    }
    container.visible = actor.visible || (shouldAnimate && previous.visible);
    container.zIndex = actor.z;
    if (shouldAnimate && (actor.transition.name === "slide" || !sameVector2(actor.pos, previous.pos))) {
      const from = actor.transition.from ?? previous.pos;
      const positionTransition: ActorPositionTransition = { from, to: actor.pos, progress: { value: 0 } };
      if (record) record.positionTransition = positionTransition;
      this.applyPositionTransition(container, actor, positionTransition);
      transition?.tween(
        positionTransition.progress,
        { value: 1 },
        actor.transition.durationMs,
        actor.transition.easing,
        () => {
          if (record?.positionTransition === positionTransition) delete record.positionTransition;
        },
        () => this.applyPositionTransition(container, actor, positionTransition)
      );
    } else {
      if (record) delete record.positionTransition;
      container.x = target.x;
      container.y = target.y;
    }
    if (shouldAnimate && opacityValue() !== targetAlpha) {
      transition?.tween(
        opacityTarget,
        presentation ? { value: targetAlpha } : { alpha: targetAlpha },
        actor.transition.durationMs,
        actor.transition.easing,
        () => {
          if (targetAlpha <= 0) container.visible = false;
        },
        presentation ? () => presentation.syncOpacity() : undefined
      );
    } else {
      applyOpacity(targetAlpha);
      if (targetAlpha <= 0) container.visible = false;
    }
    const scale = actor.scale?.[0] ?? 1;
    container.scale.set(scale);
    container.rotation = ((actor.rotation?.[2] ?? 0) * Math.PI) / 180;
  }

  private applyCurrentActorPosition(record: ActorRecord): void {
    if (record.positionTransition) {
      this.applyPositionTransition(record.container, record.actor, record.positionTransition);
      return;
    }
    const target = this.toScreenPosition(record.actor, record.actor.pos);
    record.container.x = target.x;
    record.container.y = target.y;
  }

  private applyPositionTransition(
    container: Container,
    actor: PixiActorSnapshot,
    transition: ActorPositionTransition
  ): void {
    const from = this.toScreenPosition(actor, transition.from);
    const to = this.toScreenPosition(actor, transition.to);
    const progress = clamp01(transition.progress.value);
    container.x = from.x + (to.x - from.x) * progress;
    container.y = from.y + (to.y - from.y) * progress;
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

function colorFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return 0x243040 + (hash % 0x2f3f50);
}

function backgroundStyleFromId(id: string): { color: number; alpha: number; strokeAlpha: number } {
  if (id === "bg/black" || id === "bg/solid-black") return { color: 0x000000, alpha: 1, strokeAlpha: 0.22 };
  return { color: colorFromId(id), alpha: 0.78, strokeAlpha: 0.28 };
}

function sameVector2(left: [number, number] | undefined, right: [number, number] | undefined): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return Math.abs(left[0] - right[0]) < 0.0001 && Math.abs(left[1] - right[1]) < 0.0001;
}

function sameActorFilters(left: PixiActorSnapshot["filters"], right: PixiActorSnapshot["filters"]): boolean {
  return Math.abs((left.blur ?? 0) - (right.blur ?? 0)) < 0.0001 &&
    Math.abs((left.bokeh ?? 0) - (right.bokeh ?? 0)) < 0.0001 &&
    JSON.stringify(left.signalMask ?? null) === JSON.stringify(right.signalMask ?? null);
}

function sameActorVisual(left: PixiActorSnapshot, right: PixiActorSnapshot): boolean {
  const { transition: _leftTransition, ...leftVisual } = left;
  const { transition: _rightTransition, ...rightVisual } = right;
  return JSON.stringify(leftVisual) === JSON.stringify(rightVisual);
}

function signalMaskLive(actor: PixiActorSnapshot): NumericLiveState {
  const value = actor.filters.signalMask;
  return {
    signalPower: value?.power ?? 0,
    signalBands: value?.bands ?? 0,
    signalNoise: value?.noise ?? 0,
    signalChroma: value?.chroma ?? 0,
    signalSpeed: value?.speed ?? 0,
    signalThreshold: value?.threshold ?? 0
  };
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

export function resolveInnerBackgroundFrameRect(width: number, height: number): InnerBackgroundFrameRect {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const frameWidth = safeWidth * INNER_BACKGROUND_FRAME_WIDTH_SCALE;
  const frameHeight = safeHeight * INNER_BACKGROUND_FRAME_HEIGHT_SCALE;
  return {
    x: Math.round((safeWidth - frameWidth) / 2),
    y: Math.round(safeHeight * INNER_BACKGROUND_FRAME_TOP_SCALE),
    width: Math.round(frameWidth),
    height: Math.round(frameHeight)
  };
}

function insetRect(frame: InnerBackgroundFrameRect, inset: number): InnerBackgroundFrameRect {
  const safeInset = Math.max(0, inset);
  return {
    x: frame.x + safeInset,
    y: frame.y + safeInset,
    width: Math.max(1, frame.width - safeInset * 2),
    height: Math.max(1, frame.height - safeInset * 2)
  };
}

function fitSpriteToRect(sprite: Sprite, texture: Texture, frame: InnerBackgroundFrameRect): void {
  const textureWidth = Math.max(1, texture.width);
  const textureHeight = Math.max(1, texture.height);
  const scale = Math.max(frame.width / textureWidth, frame.height / textureHeight);
  sprite.width = textureWidth * scale;
  sprite.height = textureHeight * scale;
  sprite.x = frame.x + (frame.width - sprite.width) / 2;
  sprite.y = frame.y + (frame.height - sprite.height) / 2;
}

function drawInnerBackgroundMatte(matte: Graphics, frame: InnerBackgroundFrameRect): void {
  matte
    .clear()
    .rect(frame.x, frame.y, frame.width, frame.height)
    .fill({ color: 0x000000, alpha: 1 });
}

function drawInnerBackgroundMask(mask: Graphics, frame: InnerBackgroundFrameRect): void {
  mask
    .clear()
    .rect(frame.x, frame.y, frame.width, frame.height)
    .fill({ color: 0xffffff, alpha: 1 });
}

function drawInnerBackgroundStroke(stroke: Graphics, frame: InnerBackgroundFrameRect): void {
  stroke
    .clear()
    .rect(frame.x, frame.y, frame.width, frame.height)
    .stroke({ color: 0xe7f6f1, width: 2, alpha: 0.72 });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
