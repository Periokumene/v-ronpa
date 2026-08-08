import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Filter, GlProgram, type Ticker } from "pixi.js";
import type { PresentationTaskController } from "../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../systemTypes";
import {
  LiveParamTransition,
  type NumericLiveState,
  type TweenSystem,
} from "./animation";
import type { RootFilterStack } from "./rootFilterStack";

type Snapshot = NonNullable<PixiStageSnapshot["screenFilters"]["waterVeil"]>;
interface Uniforms {
  uTime: number;
  uResolution: Float32Array;
  uPower: number;
  uLevel: number;
  uRipple: number;
  uDrift: number;
  uBlur: number;
  uTint: Float32Array;
  uDroplets: number;
  uSeed: number;
}
interface WaterVeilFilter {
  resources: { waterVeilUniforms: { uniforms: Uniforms } };
  destroy(destroyPrograms?: boolean): void;
}
interface RecordState {
  filter: WaterVeilFilter;
  uniforms: Uniforms;
  live: NumericLiveState;
  snapshot: Snapshot;
  transition: LiveParamTransition;
  removing: boolean;
}

export class WaterVeilEffectController {
  private record: RecordState | undefined;
  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController,
  ) {}
  reconcile(
    snapshot: PixiStageSnapshot,
    animate: boolean,
    hints: PixiStageRenderHint[],
  ): void {
    const next = snapshot.screenFilters.waterVeil;
    const removal = hints.find(
      (
        h,
      ): h is Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> =>
        h.type === "screen-filter-remove" && h.kind === "waterVeil",
    );
    if (!next || next.power <= 0) {
      this.remove(snapshot.revision, animate, removal);
      return;
    }
    const target = liveParams(next);
    const isNew = !this.record;
    if (!this.record) {
      const shader = createWaterVeilFilter(
        this.options.width(),
        this.options.height(),
      );
      const live = { ...target };
      if (animate && next.transition.durationMs > 0) live.power = 0;
      this.record = {
        ...shader,
        live,
        snapshot: next,
        transition: new LiveParamTransition(this.tweens, this.tasks),
        removing: false,
      };
    }
    const record = this.record;
    if (!isNew && !record.removing && sameWaterVeil(record.snapshot, next))
      return;
    if (record.removing) record.transition.cancel(false);
    record.snapshot = next;
    record.removing = false;
    record.uniforms.uSeed = next.seed;
    applyLive(record);
    record.transition.start({
      state: record.live,
      to: target,
      animate,
      durationMs: next.transition.durationMs,
      easing: next.transition.easing,
      forceTask: next.transition.wait,
      task: {
        kind: "screen-filter-transition",
        target: "waterVeil",
        revision: snapshot.revision,
      },
      onUpdate: () => applyLive(record),
    });
  }
  getFilter(): Filter | undefined {
    return this.record?.filter as unknown as Filter | undefined;
  }
  tick(ticker: Ticker): void {
    if (this.record)
      this.record.uniforms.uTime += Math.max(0, ticker.deltaMS) / 1000;
  }
  relayoutViewport(): void {
    if (this.record)
      this.record.uniforms.uResolution.set([
        Math.max(1, this.options.width()),
        Math.max(1, this.options.height()),
      ]);
  }
  clear(cancelTasks = true): void {
    const r = this.record;
    if (!r) return;
    r.transition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget("waterVeil");
    this.rootFilters.removeScreenFilter(r.filter as unknown as Filter);
    r.filter.destroy();
    this.record = undefined;
  }
  destroy(): void {
    this.clear();
  }
  private remove(
    revision: number,
    animate: boolean,
    hint:
      | Extract<PixiStageRenderHint, { type: "screen-filter-remove" }>
      | undefined,
  ): void {
    const r = this.record;
    if (!r || r.removing) return;
    if (animate && hint && hint.durationMs > 0) {
      r.removing = true;
      r.transition.start({
        state: r.live,
        to: { ...r.live, power: 0 },
        animate: true,
        durationMs: hint.durationMs,
        easing: hint.easing,
        forceTask: hint.wait,
        task: {
          kind: "screen-filter-transition",
          target: "waterVeil",
          revision,
        },
        onUpdate: () => applyLive(r),
        onComplete: () => this.clear(false),
        onSettle: () => this.clear(false),
      });
      return;
    }
    this.clear();
  }
}
function liveParams(v: Snapshot): NumericLiveState {
  const c = parseColor(v.tint);
  return {
    power: v.power,
    level: v.level,
    ripple: v.ripple,
    drift: v.drift,
    blur: v.blur,
    droplets: v.droplets,
    tintR: c[0],
    tintG: c[1],
    tintB: c[2],
  };
}
function applyLive(r: RecordState): void {
  const l = r.live,
    u = r.uniforms;
  u.uPower = l.power ?? 0;
  u.uLevel = l.level ?? 0;
  u.uRipple = l.ripple ?? 0;
  u.uDrift = l.drift ?? 0;
  u.uBlur = l.blur ?? 0;
  u.uDroplets = l.droplets ?? 0;
  u.uTint.set([l.tintR ?? 0, l.tintG ?? 0, l.tintB ?? 0]);
}
function sameWaterVeil(a: Snapshot, b: Snapshot): boolean {
  return (
    a.power === b.power &&
    a.level === b.level &&
    a.ripple === b.ripple &&
    a.drift === b.drift &&
    a.blur === b.blur &&
    a.tint === b.tint &&
    a.droplets === b.droplets &&
    a.seed === b.seed
  );
}
function parseColor(value: string): [number, number, number] {
  const h = value.replace(/^#/, "");
  const f =
    h.length === 3
      ? h
          .split("")
          .map((p) => p + p)
          .join("")
      : h;
  const n = Number.parseInt(f, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function createWaterVeilFilter(
  width: number,
  height: number,
): Pick<RecordState, "filter" | "uniforms"> {
  const uniforms: Uniforms = {
    uTime: 0,
    uResolution: new Float32Array([width, height]),
    uPower: 0,
    uLevel: 0,
    uRipple: 0,
    uDrift: 0,
    uBlur: 0,
    uTint: new Float32Array([1, 1, 1]),
    uDroplets: 0,
    uSeed: 1,
  };
  if (typeof document === "undefined")
    return {
      filter: {
        resources: { waterVeilUniforms: { uniforms } },
        destroy: () => undefined,
      },
      uniforms,
    };
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
      name: "v-ronpa-water-veil",
    }),
    resources: {
      waterVeilUniforms: {
        uTime: { value: uniforms.uTime, type: "f32" },
        uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
        uPower: { value: uniforms.uPower, type: "f32" },
        uLevel: { value: uniforms.uLevel, type: "f32" },
        uRipple: { value: uniforms.uRipple, type: "f32" },
        uDrift: { value: uniforms.uDrift, type: "f32" },
        uBlur: { value: uniforms.uBlur, type: "f32" },
        uTint: { value: uniforms.uTint, type: "vec3<f32>" },
        uDroplets: { value: uniforms.uDroplets, type: "f32" },
        uSeed: { value: uniforms.uSeed, type: "f32" },
      },
    },
  });
  return {
    filter: filter as unknown as WaterVeilFilter,
    uniforms: filter.resources.waterVeilUniforms.uniforms as Uniforms,
  };
}
const VERTEX = `in vec2 aPosition;out vec2 vTextureCoord;out vec2 vLocalCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(void){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0,1);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);vLocalCoord=aPosition;}`;
export const WATER_VEIL_FRAGMENT_SOURCE = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vLocalCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform float uTime;
uniform vec2 uResolution;
uniform float uPower;
uniform float uLevel;
uniform float uRipple;
uniform float uDrift;
uniform float uBlur;
uniform vec3 uTint;
uniform float uDroplets;
uniform float uSeed;
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 73.13) * 43758.5453123);
}
float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
    f.y
  );
}
vec2 inputUv(vec2 localUv) {
  vec2 frameScale = uInputClamp.xy + uInputClamp.zw;
  return clamp(localUv * frameScale, uInputClamp.xy, uInputClamp.zw);
}
vec3 currentAt(vec2 localUv) { return texture(uTexture, inputUv(localUv)).rgb; }
void main(void) {
  vec2 uv = vLocalCoord;
  vec4 source = texture(uTexture, vTextureCoord);
  float driftPhase = uTime * uDrift;
  float flow = noise21(vec2(uv.x * 5.0 + driftPhase, uv.y * 3.0 - uTime * 0.08))
    + 0.5 * noise21(vec2(uv.x * 17.0 - uTime * 0.03, uv.y * 11.0 + driftPhase));
  vec2 dropCells = vec2(uv.x * 14.0, uv.y * 4.0);
  vec2 dropId = floor(dropCells);
  vec2 dropUv = fract(dropCells);
  float dropRnd = hash21(dropId + vec2(17.0, 31.0));
  float dropY = fract(uTime * mix(0.08, 0.19, dropRnd) + dropRnd);
  float dropX = dropUv.x - 0.5 + sin(uTime * 0.31 + dropRnd * 9.0) * 0.06;
  float dropDelta = dropUv.y - dropY;
  float head = 1.0 - smoothstep(0.035, 0.095, length(vec2(dropX * 0.72, dropDelta)));
  float trail = (1.0 - smoothstep(0.012, 0.038, abs(dropX)))
    * smoothstep(0.0, 0.06, dropDelta)
    * (1.0 - smoothstep(0.08, 0.72, dropDelta));
  float track = (head + trail * 0.72) * step(1.0 - uDroplets, dropRnd);
  vec2 displacement = vec2(
    (flow - 0.75) * uRipple + track * 0.28,
    (noise21(uv * 13.0 + uTime) - 0.5) * uRipple * 0.28 + head * 0.12
  ) * 0.018 * uPower;
  vec2 wetUv = clamp(uv + displacement, 0.0, 1.0);
  vec3 wet = currentAt(wetUv);
  vec2 blurStep = vec2(
    displacement.x * 0.45,
    (0.8 + track * 2.0) / max(1.0, uResolution.y)
  ) * uBlur * uPower;
  vec3 directional = (currentAt(wetUv + blurStep) + currentAt(wetUv - blurStep * 0.65)) * 0.5;
  wet = mix(wet, directional, clamp(uBlur * uPower, 0.0, 0.72));
  wet = mix(wet, wet * uTint + vec3(track * 0.26), uPower * (0.16 + uLevel * 0.22));
  finalColor = vec4(wet, source.a);
}`;
const FRAGMENT = WATER_VEIL_FRAGMENT_SOURCE;
