import type { PixiScreenFiltersSnapshot, PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Filter, type Ticker } from "pixi.js";
import type { PresentationTaskController } from "../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../systemTypes";
import { LiveParamTransition, type NumericLiveState, type TweenSystem } from "./animation";
import {
  createEffectLabFilter, setEffectLabColor, setEffectLabResolution,
  type EffectLabShaderMode, type EffectLabShaderRecord
} from "./effectLabShader";
import type { RootFilterStack } from "./rootFilterStack";

export type EffectLabPersistentScreenKey = "waterVeil" | "pulse" | "staticFilter" | "vignette";
type ScreenEffectSnapshot = NonNullable<PixiScreenFiltersSnapshot[EffectLabPersistentScreenKey]>;

interface RecordState extends EffectLabShaderRecord {
  live: NumericLiveState;
  snapshot: ScreenEffectSnapshot;
  transition: LiveParamTransition;
  removing: boolean;
}

export class EffectLabPersistentScreenController {
  private record: RecordState | undefined;
  private lastPulseBeat = -1;

  constructor(
    private readonly key: EffectLabPersistentScreenKey,
    private readonly options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  reconcile(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[]): void {
    const next = snapshot.screenFilters[this.key] as ScreenEffectSnapshot | undefined;
    const removal = hints.find(
      (hint): hint is Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> =>
        hint.type === "screen-filter-remove" && hint.kind === this.key
    );
    if (!next || next.power <= 0) {
      this.remove(snapshot.revision, animate, removal);
      return;
    }
    const previousTransition = this.record?.snapshot.transition;
    const isUpdate = !this.record || previousTransition !== next.transition ||
      !sameTerminalEffect(this.record.snapshot, next);
    const target = liveParams(this.key, next);
    if (!this.record) {
      const shader = createEffectLabFilter(this.key as EffectLabShaderMode, this.options.width(), this.options.height());
      const live = { ...target };
      if (animate && next.transition.durationMs > 0) live.power = 0;
      this.record = {
        ...shader,
        live,
        snapshot: next,
        transition: new LiveParamTransition(this.tweens, this.tasks),
        removing: false
      };
    }
    const record = this.record;
    if (!isUpdate) return;
    record.snapshot = next;
    record.removing = false;
    applyDiscrete(this.key, next, record);
    applyLive(record);
    record.transition.start({
      state: record.live, to: target, animate, durationMs: next.transition.durationMs,
      easing: next.transition.easing, forceTask: next.transition.wait,
      task: { kind: "screen-filter-transition", target: this.key, revision: snapshot.revision },
      onUpdate: () => applyLive(record)
    });
  }

  getFilter(): Filter | undefined { return this.record?.filter as unknown as Filter | undefined; }

  tick(ticker: Ticker): void {
    if (!this.record) return;
    const deltaSeconds = Math.max(0, ticker.deltaMS) / 1000;
    this.record.uniforms.uTime += deltaSeconds;
    if (this.key === "waterVeil") this.record.uniforms.uPhase += deltaSeconds * (this.record.live.d ?? 0);
    else if (this.key === "staticFilter") this.record.uniforms.uPhase += deltaSeconds * Math.max(0, this.record.live.e ?? 0);
    else if (this.key === "pulse") this.record.uniforms.uPhase += deltaSeconds * Math.max(1, this.record.live.a ?? 1) / 60;
    if (this.key === "pulse") {
      const beat = Math.floor(this.record.uniforms.uPhase);
      if (beat !== this.lastPulseBeat) {
        this.lastPulseBeat = beat;
        this.record.filter.requestHistoryCapture?.();
      }
    }
  }

  relayoutViewport(): void {
    if (this.record) {
      setEffectLabResolution(this.record, this.options.width(), this.options.height());
      if (this.key === "pulse") this.record.filter.requestHistoryCapture?.();
    }
  }

  clear(cancelTasks = true): void {
    const record = this.record;
    if (!record) return;
    record.transition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget(this.key);
    this.rootFilters.removeScreenFilter(record.filter as unknown as Filter);
    record.filter.destroy();
    this.record = undefined;
    this.lastPulseBeat = -1;
  }

  destroy(): void { this.clear(); }

  private remove(
    revision: number,
    animate: boolean,
    removal: Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> | undefined
  ): void {
    const record = this.record;
    if (!record) return;
    if (record.removing) return;
    if (animate && removal && removal.durationMs > 0) {
      record.removing = true;
      record.transition.start({
        state: record.live, to: { ...record.live, power: 0 }, animate: true,
        durationMs: removal.durationMs, easing: removal.easing, forceTask: removal.wait,
        task: { kind: "screen-filter-transition", target: this.key, revision },
        onUpdate: () => applyLive(record), onComplete: () => this.clear(false),
        onSettle: () => this.clear(false), onCancel: () => this.clear(false)
      });
      return;
    }
    this.clear();
  }
}

function liveParams(key: EffectLabPersistentScreenKey, snapshot: ScreenEffectSnapshot): NumericLiveState {
  if (key === "waterVeil") {
    const value = snapshot as NonNullable<PixiScreenFiltersSnapshot["waterVeil"]>;
    return {
      power: value.power, a: value.level, b: value.ripple, c: value.blur, d: value.drift, f: value.droplets,
      ...liveColor(value.tint)
    };
  }
  if (key === "pulse") {
    const value = snapshot as NonNullable<PixiScreenFiltersSnapshot["pulse"]>;
    return {
      power: value.power, a: value.rate, b: value.echoes, c: value.expansion, d: value.distortion,
      e: value.chroma, f: value.decay, g: value.edge, originX: value.origin[0], originY: value.origin[1],
      ...liveColor(value.color)
    };
  }
  if (key === "staticFilter") {
    const value = snapshot as NonNullable<PixiScreenFiltersSnapshot["staticFilter"]>;
    return { power: value.power, a: value.density, b: value.scanline, c: value.jitter, d: value.warp, e: value.speed, f: value.grainSize, h: value.vignette };
  }
  const value = snapshot as NonNullable<PixiScreenFiltersSnapshot["vignette"]>;
  return {
    power: value.power, a: value.radius, b: value.softness, c: value.breathe, d: value.grain,
    ...liveColor(value.color)
  };
}

function applyDiscrete(key: EffectLabPersistentScreenKey, snapshot: ScreenEffectSnapshot, record: RecordState): void {
  if (key === "waterVeil") {
    const value = snapshot as NonNullable<PixiScreenFiltersSnapshot["waterVeil"]>;
    record.uniforms.uSeed = value.seed;
  } else if (key === "pulse") {
    // Pulse color and origin are continuous live params so a replacement does
    // not visibly snap at the beginning of its transition.
  } else if (key === "staticFilter") {
    const value = snapshot as NonNullable<PixiScreenFiltersSnapshot["staticFilter"]>;
    record.uniforms.uSeed = value.seed; record.uniforms.uG = ["cold", "sepia", "green", "mono"].indexOf(value.palette);
  }
}

function applyLive(record: RecordState): void {
  const u = record.uniforms; const live = record.live;
  u.uPower = clamp01(live.power ?? 0); u.uA = live.a ?? 0; u.uB = live.b ?? 0;
  u.uC = live.c ?? 0; u.uD = live.d ?? 0; u.uE = live.e ?? 0; u.uF = live.f ?? 0;
  if (live.g !== undefined) u.uG = live.g;
  u.uH = live.h ?? 0;
  if (live.colorR !== undefined) {
    u.uColor[0] = live.colorR;
    u.uColor[1] = live.colorG ?? live.colorR;
    u.uColor[2] = live.colorB ?? live.colorR;
  }
  if (live.originX !== undefined) {
    u.uOrigin[0] = live.originX;
    u.uOrigin[1] = live.originY ?? 0.5;
  }
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

function sameTerminalEffect(left: ScreenEffectSnapshot, right: ScreenEffectSnapshot): boolean {
  const { transition: _leftTransition, ...leftVisual } = left;
  const { transition: _rightTransition, ...rightVisual } = right;
  return JSON.stringify(leftVisual) === JSON.stringify(rightVisual);
}

function liveColor(value: string): Pick<NumericLiveState, "colorR" | "colorG" | "colorB"> {
  const color = new Float32Array(3);
  setEffectLabColor(color, value);
  return { colorR: color[0] ?? 0, colorG: color[1] ?? 0, colorB: color[2] ?? 0 };
}
