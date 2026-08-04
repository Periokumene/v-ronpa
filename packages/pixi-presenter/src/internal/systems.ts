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
import type {
  AssetId,
  PixiActorSnapshot,
  PixiCharacterToneSnapshot,
  PixiRainCommandParams,
  PixiStageSnapshot,
  PixiWeatherKind,
  PixiWeatherSnapshot
} from "@v-ronpa/contracts";
import { INNER_BACKGROUND_ID, type PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import type { LayeredCharacterPreloadPlan } from "@v-ronpa/layered-character";
import { getBuiltInPixiFxTexture } from "./fxAssets";
import type { PixiPresentationTaskHandle, PixiPresentationTaskKind, PresentationTaskController } from "./presentationTasks";
import { pixiAssetLoadFailed, resolvePixiAsset, type PixiAssetResolver, type PixiPresenterDiagnostic } from "./assetResolver";
import {
  CharacterSystem,
  type CharacterPreparationResult,
  type CharacterPresentation
} from "./characters";
import {
  characterToneTarget,
  copyCharacterToneState,
  type CharacterToneLiveState
} from "./characterTone";
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

interface PixiActorSystemOptions extends PixiPresenterSystemsOptions {
  characterOutlineEnabled: boolean;
  characterAssetIdByCharacterId: Readonly<Record<string, AssetId>>;
}

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

interface WeatherRecord {
  snapshot: PixiWeatherSnapshot;
  container: Container;
  particles: WeatherParticle[];
  live: NumericLiveState;
  transition: LiveParamTransition;
  rainShader?: RainShaderRenderer;
  snowShader?: SnowShaderRecord;
  sunFilter?: SunFilter;
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
  live: NumericLiveState;
  transition: LiveParamTransition;
}

interface PersistentBokehRecord {
  filter: BokehBlurFilter;
  live: NumericLiveState;
  transition: LiveParamTransition;
}

interface BokehBlurFilter {
  strength: number;
  destroy(destroyPrograms?: boolean): void;
}

interface ActorBlurFilter {
  strength: number;
  destroy(destroyPrograms?: boolean): void;
}

interface SunFilter {
  gain: number;
  destroy(destroyPrograms?: boolean): void;
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

interface ViewportGraphicRecord {
  graphic: Graphics;
  color: number;
  alpha: number;
}

interface TweenHandle {
  stop(): void;
}

type NumericLiveState = Record<string, number>;

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
    delayMs = 0,
    onUpdate?: () => void
  ): TweenHandle {
    if (durationMs <= 0) {
      Object.assign(target, to);
      onUpdate?.();
      onComplete?.();
      return { stop: () => undefined };
    }
    const generation = this.generation;
    const tween = new Tween(target, this.group)
      .to(to, durationMs)
      .easing(resolveEasing(easingName))
      .onUpdate(() => {
        if (generation === this.generation) onUpdate?.();
      })
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

interface LiveParamTransitionInput {
  state: NumericLiveState;
  to: NumericLiveState;
  animate: boolean;
  durationMs: number;
  easing?: string | undefined;
  forceTask?: boolean | undefined;
  task?: {
    kind: PixiPresentationTaskKind;
    target: string;
    revision: number;
  };
  onUpdate?: () => void;
  onComplete?: () => void;
  onSettle?: () => void;
  onCancel?: () => void;
}

interface LiveParamTransitionRecord {
  state: NumericLiveState;
  to: NumericLiveState;
  handle: TweenHandle;
  task?: PixiPresentationTaskHandle;
  onUpdate?: () => void;
  onComplete?: () => void;
  onSettle?: () => void;
  onCancel?: () => void;
}

class LiveParamTransition {
  private active: LiveParamTransitionRecord | undefined;

  constructor(
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  start(input: LiveParamTransitionInput): void {
    const targetState = { ...input.to };
    const hasDelta = hasNumericDelta(input.state, targetState);
    const shouldAnimate = input.animate && input.durationMs > 0 && (hasDelta || Boolean(input.forceTask));
    this.detachActive();

    if (!shouldAnimate) {
      assignLiveState(input.state, targetState);
      input.onUpdate?.();
      input.onComplete?.();
      return;
    }

    const tweenState = hasDelta ? input.state : { value: 0 };
    const tweenTarget = hasDelta ? targetState : { value: 1 };
    const record: LiveParamTransitionRecord = {
      state: input.state,
      to: targetState,
      handle: { stop: () => undefined },
      ...(input.onUpdate ? { onUpdate: input.onUpdate } : {}),
      ...(input.onComplete ? { onComplete: input.onComplete } : {}),
      ...(input.onSettle ? { onSettle: input.onSettle } : {}),
      ...(input.onCancel ? { onCancel: input.onCancel } : {})
    };
    this.active = record;

    if (input.task) {
      const task = this.tasks.start({
        kind: input.task.kind,
        target: input.task.target,
        revision: input.task.revision,
        durationMs: input.durationMs,
        onCancel: () => {
          if (this.active !== record) return;
          record.handle.stop();
          this.active = undefined;
          record.onCancel?.();
        },
        onSettle: () => {
          if (this.active !== record) return;
          record.handle.stop();
          this.finish(record, "settle");
        }
      });
      record.task = task;
    }

    input.onUpdate?.();
    record.handle = this.tweens.tween(
      tweenState,
      tweenTarget,
      input.durationMs,
      input.easing,
      () => {
        if (this.active !== record) return;
        this.finish(record, "complete");
      },
      0,
      hasDelta ? input.onUpdate : undefined
    );
  }

  cancel(applyTarget = false): void {
    const record = this.active;
    if (!record) return;
    record.handle.stop();
    this.active = undefined;
    if (applyTarget) {
      assignLiveState(record.state, record.to);
      record.onUpdate?.();
    }
  }

  private detachActive(): void {
    const record = this.active;
    if (!record) return;
    record.handle.stop();
    this.active = undefined;
    record.task?.settle();
  }

  private finish(record: LiveParamTransitionRecord, status: "complete" | "settle"): void {
    assignLiveState(record.state, record.to);
    record.onUpdate?.();
    this.active = undefined;
    if (status === "complete") {
      record.onComplete?.();
      if (record.task?.isCurrent()) record.task.complete();
      return;
    }
    record.onSettle?.();
  }
}

class CharacterToneController {
  private readonly presentations = new Set<CharacterPresentation>();
  private readonly transition: LiveParamTransition;
  private live: CharacterToneLiveState | undefined;
  private target: PixiCharacterToneSnapshot | undefined;
  private enabled = false;

  constructor(
    tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {
    this.transition = new LiveParamTransition(tweens, tasks);
  }

  register(presentation: CharacterPresentation): void {
    this.presentations.add(presentation);
    presentation.setTone(this.enabled ? this.live : undefined);
  }

  unregister(presentation: CharacterPresentation): void {
    this.presentations.delete(presentation);
  }

  reconcile(
    next: PixiCharacterToneSnapshot | undefined,
    animate: boolean,
    revision: number,
    hints: PixiStageRenderHint[]
  ): void {
    if (!next) {
      this.remove(animate, revision, hints);
      return;
    }
    if (animate && sameCharacterToneSnapshot(this.target, next)) return;

    const targetLive = characterToneTarget(next.preset, next.amount);
    const scopeChanged = this.target !== undefined && this.target.scopeScriptPath !== next.scopeScriptPath;
    if (!this.live || !this.enabled || (scopeChanged && animate && next.transition.durationMs > 0)) {
      this.live = copyCharacterToneState(targetLive);
      if (animate && next.transition.durationMs > 0) this.live.amount = 0;
    }
    this.target = next;
    const live = this.live;
    this.transition.start({
      state: live,
      to: targetLive,
      animate,
      durationMs: next.transition.durationMs,
      task: {
        kind: "character-tone-transition",
        target: "character-tone",
        revision
      },
      onUpdate: () => this.applyLive(true),
      onComplete: () => this.applyLive(true),
      onSettle: () => this.applyLive(true),
      onCancel: () => this.applyLive(this.enabled)
    });
  }

  destroy(): void {
    this.tasks.cancelTarget("character-tone");
    this.transition.cancel(false);
    this.disable();
    this.presentations.clear();
    this.live = undefined;
    this.target = undefined;
  }

  private remove(
    animate: boolean,
    revision: number,
    hints: PixiStageRenderHint[]
  ): void {
    const removal = hints.find(
      (hint): hint is Extract<PixiStageRenderHint, { type: "character-tone-remove" }> =>
        hint.type === "character-tone-remove"
    );
    this.target = undefined;
    if (!this.live || !this.enabled) {
      this.tasks.cancelTarget("character-tone");
      this.transition.cancel(false);
      this.disable();
      return;
    }
    if (!animate || !removal || removal.durationMs <= 0) {
      this.tasks.cancelTarget("character-tone");
      this.transition.cancel(false);
      this.disable();
      return;
    }
    const live = this.live;
    this.transition.start({
      state: live,
      to: { ...live, amount: 0 },
      animate: true,
      durationMs: removal.durationMs,
      task: {
        kind: "character-tone-transition",
        target: "character-tone",
        revision
      },
      onUpdate: () => this.applyLive(true),
      onComplete: () => this.disable(),
      onSettle: () => this.disable(),
      onCancel: () => this.disable()
    });
  }

  private applyLive(enabled: boolean): void {
    this.enabled = enabled && Boolean(this.live);
    for (const presentation of this.presentations) {
      presentation.setTone(this.enabled ? this.live : undefined);
    }
  }

  private disable(): void {
    this.enabled = false;
    for (const presentation of this.presentations) presentation.setTone(undefined);
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

  relayoutViewport(): void {
    if ([...this.screenFilters, ...this.transientFilters].length > 0) {
      this.options.root.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
    }
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
  private readonly actorBlurFilters = new WeakMap<Container, ActorBlurFilter>();
  private persistentBokeh: PersistentBokehRecord | undefined;
  private persistentGlitch: PersistentGlitchRecord | undefined;

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  applyActorFilters(container: Container, actor: PixiActorSnapshot, liveFilters: Partial<Record<string, number>> = actor.filters): void {
    const filters: Filter[] = [];
    const blur = Math.max(0, liveFilters.blur ?? actor.filters.blur ?? 0);
    const blurFilter = this.reconcileActorBlur(container, blur);
    if (blurFilter) filters.push(blurFilter as unknown as Filter);
    if (filters.length > 0 && this.options) {
      container.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
    } else {
      (container as unknown as { filterArea: Rectangle | undefined }).filterArea = undefined;
    }
    container.filters = filters.length > 0 ? filters : null;
  }

  releaseActorFilters(container: Container): void {
    this.destroyActorBlur(container);
    container.filters = null;
    (container as unknown as { filterArea: Rectangle | undefined }).filterArea = undefined;
  }

  relayoutViewport(): void {
    if (this.persistentGlitch) {
      setGlitchResolution(this.persistentGlitch.uniforms, this.options.width(), this.options.height());
    }
    this.rootFilters.relayoutViewport();
  }

  relayoutActorFilterArea(container: Container): void {
    if (!container.filters || container.filters.length === 0) return;
    container.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
  }

  applyScreenFilters(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[] = []): void {
    const filters: Filter[] = [];
    const bokeh = this.reconcilePersistentBokeh(snapshot, animate, hints);
    if (bokeh) filters.push(bokeh.filter as unknown as Filter);
    const glitch = this.reconcilePersistentGlitch(snapshot, animate, hints);
    if (glitch) filters.push(glitch.filter as unknown as Filter);
    this.rootFilters.setScreenFilters(filters);
  }

  tick(ticker: Ticker): void {
    if (!this.persistentGlitch) return;
    this.persistentGlitch.uniforms.uTime += Math.max(0, ticker.deltaMS) / 1000;
  }

  clear(): void {
    this.destroyPersistentBokeh();
    this.destroyPersistentGlitch();
    this.rootFilters.setScreenFilters([]);
  }

  createSunFilter(power: number): SunFilter {
    if (typeof document === "undefined") {
      return {
        gain: sunFilterGain(power),
        destroy: () => undefined
      };
    }
    return new GodrayFilter({ gain: sunFilterGain(power), lacunarity: 2.6, parallel: true });
  }

  private reconcileActorBlur(container: Container, power: number): ActorBlurFilter | undefined {
    if (power <= 0.001) {
      this.destroyActorBlur(container);
      return undefined;
    }
    let filter = this.actorBlurFilters.get(container);
    if (!filter) {
      filter = createActorBlurFilter(power);
      this.actorBlurFilters.set(container, filter);
      return filter;
    }
    filter.strength = actorBlurStrength(power);
    return filter;
  }

  private destroyActorBlur(container: Container): void {
    const filter = this.actorBlurFilters.get(container);
    if (!filter) return;
    filter.destroy();
    this.actorBlurFilters.delete(container);
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
      const live = glitchLiveParams(glitch);
      if (animate && glitch.transition.durationMs > 0) live.power = 0;
      this.persistentGlitch = {
        filter: shader.filter,
        uniforms: shader.uniforms,
        live,
        transition: new LiveParamTransition(this.tweens, this.tasks)
      };
    }

    const record = this.persistentGlitch;
    const transition = glitch.transition;
    const target = glitchLiveParams(glitch);
    record.uniforms.uSeed = glitch.seed ?? 0;
    record.uniforms.uProgress = 0;
    if (isNew) applyGlitchLiveUniforms(record.uniforms, record.live);
    record.transition.start({
      state: record.live,
      to: target,
      animate,
      durationMs: transition.durationMs,
      easing: transition.easing,
      forceTask: transition.wait,
      task: { kind: "screen-filter-transition", target: "glitch", revision: snapshot.revision },
      onUpdate: () => applyGlitchLiveUniforms(record.uniforms, record.live)
    });

    return record;
  }

  private removePersistentGlitch(
    revision: number,
    animate: boolean,
    removal: Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> | undefined
  ): GlitchShaderRecord | undefined {
    const record = this.persistentGlitch;
    if (!record) return undefined;
    if (animate && removal && removal.durationMs > 0) {
      record.transition.start({
        state: record.live,
        to: { ...record.live, power: 0 },
        animate,
        durationMs: removal.durationMs,
        easing: removal.easing,
        forceTask: removal.wait,
        task: {
          kind: "screen-filter-transition",
          target: "glitch",
          revision
        },
        onUpdate: () => applyGlitchLiveUniforms(record.uniforms, record.live),
        onComplete: () => this.destroyPersistentGlitch(false),
        onSettle: () => this.destroyPersistentGlitch(false),
        onCancel: () => this.destroyPersistentGlitch(false)
      });
      return record;
    }
    this.destroyPersistentGlitch();
    return undefined;
  }

  private reconcilePersistentBokeh(
    snapshot: PixiStageSnapshot,
    animate: boolean,
    hints: PixiStageRenderHint[]
  ): PersistentBokehRecord | undefined {
    const bokeh = snapshot.screenFilters.bokeh;
    const removal = hints.find(
      (hint): hint is Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> =>
        hint.type === "screen-filter-remove" && hint.kind === "bokeh"
    );
    if (!bokeh || bokeh.power <= 0) {
      return this.removePersistentBokeh(animate, removal);
    }

    const target = { power: clamp01(bokeh.power) };
    if (!this.persistentBokeh) {
      const live = { ...target };
      if (animate && bokeh.transition.durationMs > 0) live.power = 0;
      this.persistentBokeh = {
        filter: createBokehBlurFilter(live.power),
        live,
        transition: new LiveParamTransition(this.tweens, this.tasks)
      };
    }

    const record = this.persistentBokeh;
    record.transition.start({
      state: record.live,
      to: target,
      animate,
      durationMs: bokeh.transition.durationMs,
      easing: bokeh.transition.easing,
      onUpdate: () => applyBokehFilterPower(record)
    });
    return record;
  }

  private removePersistentBokeh(
    animate: boolean,
    removal: Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> | undefined
  ): PersistentBokehRecord | undefined {
    const record = this.persistentBokeh;
    if (!record) return undefined;
    if (animate && removal && removal.durationMs > 0) {
      record.transition.start({
        state: record.live,
        to: { power: 0 },
        animate,
        durationMs: removal.durationMs,
        easing: removal.easing,
        onUpdate: () => applyBokehFilterPower(record),
        onComplete: () => this.destroyPersistentBokeh(),
        onSettle: () => this.destroyPersistentBokeh(),
        onCancel: () => this.destroyPersistentBokeh()
      });
      return record;
    }
    this.destroyPersistentBokeh();
    return undefined;
  }

  private destroyPersistentBokeh(): void {
    const record = this.persistentBokeh;
    if (!record) return;
    record.transition.cancel(false);
    this.rootFilters.removeScreenFilter(record.filter as unknown as Filter);
    record.filter.destroy();
    this.persistentBokeh = undefined;
  }

  private destroyPersistentGlitch(cancelTasks = true): void {
    const record = this.persistentGlitch;
    if (!record) return;
    record.transition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget("glitch");
    this.rootFilters.removeScreenFilter(record.filter as unknown as Filter);
    record.filter.destroy();
    this.persistentGlitch = undefined;
  }
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
    private readonly filters: FilterSystem,
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
    const shouldAnimate = animate && actor.transition.durationMs > 0;
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
    this.applyTransform(record, actor, previous, animate, transition);
    if (shouldAnimate && filtersChanged) {
      transition?.tween(
        record.filterLive,
        { blur: actor.filters.blur ?? 0 },
        actor.transition.durationMs,
        actor.transition.easing,
        undefined,
        () => this.filters.applyActorFilters(record.container, actor, record.filterLive)
      );
    } else {
      record.filterLive.blur = actor.filters.blur ?? 0;
    }
    if (shouldAnimate && actor.transition.wait && transition && !transition.hasWork()) {
      transition.tween({ value: 0 }, { value: 1 }, actor.transition.durationMs, actor.transition.easing);
    }
    record.actor = actor;
    this.filters.applyActorFilters(record.container, actor, record.filterLive);
    if (record.layout?.kind === "character") record.layout.presentation.syncOutlineTransform();
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
      filterLive: { blur: actor.filters.blur ?? 0 }
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
    animate: boolean,
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
    const shouldAnimate = animate && actor.transition.durationMs > 0;
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
      const speedY = weatherLiveSpeedY(record);
      const speedX = weatherLiveSpeedX(record);
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

  relayoutViewport(): void {
    const width = this.options.width();
    const height = this.options.height();
    for (const record of this.records.values()) {
      if (record.rainShader) {
        record.rainShader.resize(width, height);
      }
      if (record.snowShader) {
        this.resizeSnowShader(record, width, height);
      }
      if (record.snapshot.kind === "sun") {
        record.container.filterArea = new Rectangle(0, 0, width, height);
      }
      for (const particle of record.particles) {
        particle.x = clamp(particle.x, 0, width);
        particle.y = clamp(particle.y, 0, height);
      }
    }
  }

  private upsert(kind: string, snapshot: PixiWeatherSnapshot, animate: boolean, revision: number): void {
    let record = this.records.get(kind);
    const targetLive = weatherLiveParams(snapshot);
    if (!record) {
      const container = createWeatherContainer(kind);
      container.alpha = 0;
      if (kind === "sun") this.backLayer.addChild(container);
      else this.frontLayer.addChild(container);
      const live = { ...targetLive };
      if (animate && snapshot.transition.durationMs > 0) live.power = 0;
      record = {
        snapshot,
        container,
        particles: [],
        live,
        transition: new LiveParamTransition(this.tweens, this.tasks)
      };
      this.records.set(kind, record);
      this.populate(record);
    }
    record.snapshot = snapshot;
    record.transition.start({
      state: record.live,
      to: targetLive,
      animate,
      durationMs: snapshot.transition.durationMs,
      easing: snapshot.transition.easing,
      forceTask: snapshot.transition.wait,
      task: { kind: "weather-transition", target: kind, revision },
      onUpdate: () => this.applyWeatherLiveState(record)
    });
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
    this.applyWeatherLiveState(record);
  }

  private applyWeatherLiveState(record: WeatherRecord): void {
    const power = clamp01(record.live.power ?? weatherPower(record.snapshot));
    record.container.alpha = power;
    if (record.snapshot.kind === "rain") {
      record.rainShader?.updateSettings(resolveRainSettingsFromCommandParams(liveRainCommandParams(record)));
      record.rainShader?.resize(this.options.width(), this.options.height());
      return;
    }
    if (record.snapshot.kind === "snow") {
      this.updateSnowShaderUniforms(record);
      return;
    }
    if (record.snapshot.kind === "sun") {
      record.container.filterArea = new Rectangle(0, 0, this.options.width(), this.options.height());
      const filter = this.ensureSunFilter(record, power);
      record.container.filters = [filter as unknown as Filter];
    }
    const externalScale = record.live.scale ?? record.snapshot.scale?.[0] ?? 1;
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
    const cleanup = () => {
      this.remove(kind, false);
    };
    record.transition.start({
      state: record.live,
      to: { ...record.live, power: 0 },
      animate: true,
      durationMs: hint.durationMs,
      easing: hint.easing,
      forceTask: hint.wait,
      task: { kind: "weather-transition", target: kind, revision },
      onUpdate: () => this.applyWeatherLiveState(record),
      onComplete: cleanup,
      onSettle: cleanup,
      onCancel: cleanup
    });
  }

  private remove(kind: string, cancelTasks = true): void {
    const record = this.records.get(kind);
    if (!record) return;
    record.transition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget(kind);
    record.rainShader?.destroy();
    record.snowShader?.filter.destroy();
    record.sunFilter?.destroy();
    record.container.removeFromParent();
    record.container.destroy({ children: true });
    this.records.delete(kind);
  }

  private ensureSunFilter(record: WeatherRecord, power: number): SunFilter {
    if (!record.sunFilter) {
      record.sunFilter = this.filters.createSunFilter(power);
      return record.sunFilter;
    }
    record.sunFilter.gain = sunFilterGain(power);
    return record.sunFilter;
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
    uniforms.uPower = clamp01(record.live.power ?? snapshot.power);
    uniforms.uDensity = record.live.density ?? snapshot.density ?? 1;
    uniforms.uFallSpeed = record.live.ySpeed ?? snapshot.ySpeed ?? 0.45;
    uniforms.uWind = record.live.xSpeed ?? snapshot.xSpeed ?? 0.25;
    uniforms.uFlakeScale = record.live.flakeScale ?? snapshot.flakeScale ?? snapshot.scale?.[0] ?? 1;
    uniforms.uSway = record.live.sway ?? snapshot.sway ?? 1;
    uniforms.uFog = record.live.fog ?? snapshot.fog ?? 0.25;
    uniforms.uNoise = record.live.noise ?? snapshot.noise ?? 0.01;
    uniforms.uSeed = snapshot.seed ?? 0;
  }
}

export class ScreenOverlaySystem {
  private readonly layer = new Container({ label: "screen-filter-overlays" });
  private readonly bokehTransition: LiveParamTransition;
  private bokehKey = "";
  private bokehPower = 0;
  private bokehLayoutPower = 0;

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {
    this.bokehTransition = new LiveParamTransition(tweens, tasks);
    this.layer.zIndex = 25;
    options.root.sortableChildren = true;
    options.root.addChild(this.layer);
  }

  reconcile(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[] = []): void {
    const power = clamp01(snapshot.screenFilters.bokeh?.power ?? 0);
    const transition = snapshot.screenFilters.bokeh?.transition;
    const removal = hints.find(
      (hint): hint is Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> =>
        hint.type === "screen-filter-remove" && hint.kind === "bokeh"
    );
    if (power <= 0) {
      if (animate && removal && removal.durationMs > 0 && this.layer.children.length > 0) {
        const live = { power: this.bokehPower };
        this.bokehTransition.start({
          state: live,
          to: { power: 0 },
          animate,
          durationMs: removal.durationMs,
          easing: removal.easing,
          forceTask: removal.wait,
          task: { kind: "screen-filter-transition", target: "bokeh", revision: snapshot.revision },
          onUpdate: () => {
            this.bokehPower = live.power;
            this.applyBokehOverlayPower();
          },
          onComplete: () => this.clear(false),
          onSettle: () => this.clear(false),
          onCancel: () => this.clear(false)
        });
        return;
      }
      this.clear();
      return;
    }

    const key = this.bokehLayoutKey(power);
    if (key !== this.bokehKey) {
      const hasExistingOverlay = this.bokehKey !== "" && this.layer.children.length > 0;
      const startingPower = hasExistingOverlay ? this.bokehPower : animate && transition && transition.durationMs > 0 ? 0 : power;
      this.clear();
      this.bokehPower = startingPower;
      this.bokehLayoutPower = power;
      this.populateBokeh(power);
      this.bokehKey = key;
    }
    if (!transition) {
      this.bokehPower = power;
      this.applyBokehOverlayPower();
      return;
    }
    const live = { power: this.bokehPower };
    this.bokehTransition.start({
      state: live,
      to: { power },
      animate,
      durationMs: transition.durationMs,
      easing: transition.easing,
      forceTask: transition.wait,
      task: { kind: "screen-filter-transition", target: "bokeh", revision: snapshot.revision },
      onUpdate: () => {
        this.bokehPower = live.power;
        this.applyBokehOverlayPower();
      }
    });
  }

  clear(cancelTasks = true): void {
    this.bokehTransition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget("bokeh");
    this.layer.removeChildren().forEach((child) => child.destroy());
    this.bokehKey = "";
    this.bokehPower = 0;
    this.bokehLayoutPower = 0;
  }

  relayoutViewport(): void {
    if (this.bokehPower <= 0 || this.layer.children.length === 0) return;
    const key = this.bokehLayoutKey(this.bokehLayoutPower);
    if (key === this.bokehKey) return;
    this.layer.removeChildren().forEach((child) => child.destroy());
    this.populateBokeh(this.bokehLayoutPower);
    this.bokehKey = key;
    this.applyBokehOverlayPower();
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
    this.applyBokehOverlayPower();
  }

  private applyBokehOverlayPower(): void {
    const power = clamp01(this.bokehPower);
    this.layer.alpha = bokehOverlayAlpha(power);
    this.layer.children.forEach((child) => {
      if (child instanceof Sprite) child.alpha = 0.32 + power * 0.34;
    });
  }

  private bokehLayoutKey(power: number): string {
    return `${this.options.width()}x${this.options.height()}:${Math.round(power * 100)}`;
  }
}

export class TransientEffectSystem {
  private readonly layer = new Container({ label: "transient-effects" });
  private readonly trialLayer = new Container({ label: "trial-overlay" });
  private readonly glitchShaders = new Set<GlitchShaderRecord>();
  private readonly viewportGraphics = new Set<ViewportGraphicRecord>();

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
    this.viewportGraphics.clear();
    this.layer.removeChildren().forEach((child) => child.destroy());
    this.clearTrialOverlays();
  }

  clearTrialOverlays(): void {
    this.trialLayer.removeChildren().forEach((child) => child.destroy());
  }

  relayoutViewport(): void {
    for (const record of this.viewportGraphics) {
      drawViewportGraphic(record, this.options.width(), this.options.height());
    }
    for (const record of this.glitchShaders) {
      setGlitchResolution(record.uniforms, this.options.width(), this.options.height());
    }
    this.relayoutTrialOverlays();
  }

  private flash(hint: Extract<PixiStageRenderHint, { type: "flash" }>, revision: number): void {
    const color = Number.parseInt(hint.color.replace("#", ""), 16);
    const flash = new Graphics();
    flash.label = "flash-overlay";
    const viewportRecord = { graphic: flash, color, alpha: 0.55 };
    this.viewportGraphics.add(viewportRecord);
    drawViewportGraphic(viewportRecord, this.options.width(), this.options.height());
    flash.alpha = 0.55;
    this.layer.addChild(flash);
    const cleanup = () => {
      this.viewportGraphics.delete(viewportRecord);
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

  private relayoutTrialOverlays(): void {
    this.trialLayer.children.forEach((child, index) => {
      child.x = Math.max(24, this.options.width() - 360);
      child.y = 100 + index * 42;
    });
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
  if (id === "bg/black" || id === "bg/solid-black") return { color: 0x000000, alpha: 1, strokeAlpha: 0.22 };
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

function sameCharacterToneSnapshot(
  left: PixiCharacterToneSnapshot | undefined,
  right: PixiCharacterToneSnapshot
): boolean {
  return Boolean(
    left &&
    left.preset === right.preset &&
    left.amount === right.amount &&
    left.scopeScriptPath === right.scopeScriptPath
  );
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

function drawViewportGraphic(record: ViewportGraphicRecord, width: number, height: number): void {
  record.graphic
    .clear()
    .rect(0, 0, width, height)
    .fill({ color: record.color, alpha: record.alpha });
}

function setGlitchResolution(uniforms: GlitchShaderUniformValues, width: number, height: number): void {
  uniforms.uResolution[0] = width;
  uniforms.uResolution[1] = height;
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

function weatherLiveParams(snapshot: PixiWeatherSnapshot): NumericLiveState {
  if (snapshot.kind === "rain") {
    return {
      power: clamp01(snapshot.commandParams.power),
      wind: snapshot.commandParams.wind,
      hue: snapshot.commandParams.hue,
      tint: snapshot.commandParams.tint
    };
  }
  if (snapshot.kind === "snow") {
    return {
      power: clamp01(snapshot.power),
      xSpeed: snapshot.xSpeed ?? 0.25,
      ySpeed: snapshot.ySpeed ?? 0.45,
      density: snapshot.density ?? 1,
      flakeScale: snapshot.flakeScale ?? snapshot.scale?.[0] ?? 1,
      sway: snapshot.sway ?? 1,
      fog: snapshot.fog ?? 0.25,
      noise: snapshot.noise ?? 0.01
    };
  }
  return {
    power: clamp01(snapshot.power),
    scale: snapshot.scale?.[0] ?? 1
  };
}

function liveRainCommandParams(record: WeatherRecord): PixiRainCommandParams {
  if (record.snapshot.kind !== "rain") {
    return { power: 0, wind: -1, hue: 215, tint: 0.55 };
  }
  return {
    power: clamp01(record.live.power ?? record.snapshot.commandParams.power),
    wind: clamp(record.live.wind ?? record.snapshot.commandParams.wind, -1, 1),
    hue: clamp(record.live.hue ?? record.snapshot.commandParams.hue, 0, 360),
    tint: clamp(record.live.tint ?? record.snapshot.commandParams.tint, 0, 2)
  };
}

function weatherLiveSpeedX(record: WeatherRecord): number {
  if (record.snapshot.kind === "snow") return record.live.xSpeed ?? record.snapshot.xSpeed ?? 0.25;
  return 0.25;
}

function weatherLiveSpeedY(record: WeatherRecord): number {
  if (record.snapshot.kind === "snow") return record.live.ySpeed ?? record.snapshot.ySpeed ?? 0.45;
  return 6;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function glitchLiveParams(controls: GlitchShaderControls): NumericLiveState {
  return {
    power: clamp01(controls.power ?? 1),
    blockJump: Math.max(0, controls.blockJump ?? 1),
    burstJump: Math.max(0, controls.burstJump ?? 1),
    pixelScatter: Math.max(0, controls.pixelScatter ?? 1),
    colorNoise: Math.max(0, controls.colorNoise ?? 1),
    speed: Math.max(0, controls.speed ?? 1)
  };
}

function applyGlitchLiveUniforms(uniforms: GlitchShaderUniformValues, live: NumericLiveState): void {
  uniforms.uPower = clamp01(live.power ?? 1);
  uniforms.uBlockJump = Math.max(0, live.blockJump ?? 1);
  uniforms.uBurstJump = Math.max(0, live.burstJump ?? 1);
  uniforms.uPixelScatter = Math.max(0, live.pixelScatter ?? 1);
  uniforms.uColorNoise = Math.max(0, live.colorNoise ?? 1);
  uniforms.uSpeed = Math.max(0, live.speed ?? 1);
}

function bokehBlurStrength(power: number): number {
  return Math.max(0, power) * 8;
}

function createBokehBlurFilter(power: number): BokehBlurFilter {
  if (typeof document === "undefined") {
    return {
      strength: bokehBlurStrength(power),
      destroy: () => undefined
    };
  }
  return new KawaseBlurFilter({ strength: bokehBlurStrength(power), quality: 4 });
}

function actorBlurStrength(power: number): number {
  return Math.max(0, power) * 6;
}

function sunFilterGain(power: number): number {
  return Math.max(0.35, power);
}

function createActorBlurFilter(power: number): ActorBlurFilter {
  if (typeof document === "undefined") {
    return {
      strength: actorBlurStrength(power),
      destroy: () => undefined
    };
  }
  return new BlurFilter({ strength: actorBlurStrength(power), quality: 3 });
}

function applyBokehFilterPower(record: PersistentBokehRecord): void {
  record.filter.strength = bokehBlurStrength(record.live.power ?? 0);
}

function bokehOverlayAlpha(power: number): number {
  const clamped = clamp01(power);
  return clamped <= 0.001 ? 0 : Math.min(0.96, 0.45 + clamped * 0.45);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hasNumericDelta(current: NumericLiveState, target: NumericLiveState): boolean {
  return Object.entries(target).some(([key, value]) => Math.abs((current[key] ?? 0) - value) > 0.001);
}

function assignLiveState(current: NumericLiveState, target: NumericLiveState): void {
  for (const [key, value] of Object.entries(target)) current[key] = value;
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
