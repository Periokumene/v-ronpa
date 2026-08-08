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

type Snapshot = NonNullable<PixiStageSnapshot["screenFilters"]["staticFilter"]>;
interface Uniforms {
  uTime: number;
  uResolution: Float32Array;
  uPower: number;
  uDensity: number;
  uScanline: number;
  uJitter: number;
  uWarp: number;
  uGrainSize: number;
  uSpeed: number;
  uVignette: number;
  uPalette: number;
  uSeed: number;
}
interface StaticFilter {
  resources: { staticFilterUniforms: { uniforms: Uniforms } };
  destroy(destroyPrograms?: boolean): void;
}
interface RecordState {
  filter: StaticFilter;
  uniforms: Uniforms;
  live: NumericLiveState;
  snapshot: Snapshot;
  transition: LiveParamTransition;
  removing: boolean;
}

export class StaticFilterEffectController {
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
    const next = snapshot.screenFilters.staticFilter;
    const removal = hints.find(
      (
        hint,
      ): hint is Extract<
        PixiStageRenderHint,
        { type: "screen-filter-remove" }
      > => hint.type === "screen-filter-remove" && hint.kind === "staticFilter",
    );
    if (!next || next.power <= 0) {
      this.remove(snapshot.revision, animate, removal);
      return;
    }
    const target = liveParams(next);
    const isNew = !this.record;
    if (!this.record) {
      const shader = createStaticFilter(
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
    if (!isNew && !record.removing && sameStatic(record.snapshot, next)) return;
    if (record.removing) record.transition.cancel(false);
    record.snapshot = next;
    record.removing = false;
    record.uniforms.uPalette = ["cold", "sepia", "green", "mono"].indexOf(
      next.palette,
    );
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
        target: "staticFilter",
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
      this.record.uniforms.uTime +=
        (Math.max(0, ticker.deltaMS) / 1000) * this.record.uniforms.uSpeed;
  }
  relayoutViewport(): void {
    if (this.record)
      this.record.uniforms.uResolution.set([
        Math.max(1, this.options.width()),
        Math.max(1, this.options.height()),
      ]);
  }
  clear(cancelTasks = true): void {
    const record = this.record;
    if (!record) return;
    record.transition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget("staticFilter");
    this.rootFilters.removeScreenFilter(record.filter as unknown as Filter);
    record.filter.destroy();
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
    const record = this.record;
    if (!record || record.removing) return;
    if (animate && hint && hint.durationMs > 0) {
      record.removing = true;
      record.transition.start({
        state: record.live,
        to: { ...record.live, power: 0 },
        animate: true,
        durationMs: hint.durationMs,
        easing: hint.easing,
        forceTask: hint.wait,
        task: {
          kind: "screen-filter-transition",
          target: "staticFilter",
          revision,
        },
        onUpdate: () => applyLive(record),
        onComplete: () => this.clear(false),
        onSettle: () => this.clear(false),
      });
      return;
    }
    this.clear();
  }
}

function liveParams(value: Snapshot): NumericLiveState {
  return {
    power: value.power,
    density: value.density,
    scanline: value.scanline,
    jitter: value.jitter,
    warp: value.warp,
    grainSize: value.grainSize,
    speed: value.speed,
    vignette: value.vignette,
  };
}
function applyLive(record: RecordState): void {
  const { live, uniforms: u } = record;
  u.uPower = live.power ?? 0;
  u.uDensity = live.density ?? 0;
  u.uScanline = live.scanline ?? 0;
  u.uJitter = live.jitter ?? 0;
  u.uWarp = live.warp ?? 0;
  u.uGrainSize = live.grainSize ?? 1;
  u.uSpeed = live.speed ?? 0;
  u.uVignette = live.vignette ?? 0;
}
function sameStatic(a: Snapshot, b: Snapshot): boolean {
  return (
    a.power === b.power &&
    a.density === b.density &&
    a.scanline === b.scanline &&
    a.jitter === b.jitter &&
    a.warp === b.warp &&
    a.grainSize === b.grainSize &&
    a.speed === b.speed &&
    a.vignette === b.vignette &&
    a.palette === b.palette &&
    a.seed === b.seed
  );
}
function createStaticFilter(
  width: number,
  height: number,
): Pick<RecordState, "filter" | "uniforms"> {
  const uniforms: Uniforms = {
    uTime: 0,
    uResolution: new Float32Array([width, height]),
    uPower: 0,
    uDensity: 0,
    uScanline: 0,
    uJitter: 0,
    uWarp: 0,
    uGrainSize: 1,
    uSpeed: 0,
    uVignette: 0,
    uPalette: 0,
    uSeed: 1,
  };
  if (typeof document === "undefined")
    return {
      filter: {
        resources: { staticFilterUniforms: { uniforms } },
        destroy: () => undefined,
      },
      uniforms,
    };
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
      name: "v-ronpa-static-filter",
    }),
    resources: {
      staticFilterUniforms: {
        uTime: { value: uniforms.uTime, type: "f32" },
        uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
        uPower: { value: uniforms.uPower, type: "f32" },
        uDensity: { value: uniforms.uDensity, type: "f32" },
        uScanline: { value: uniforms.uScanline, type: "f32" },
        uJitter: { value: uniforms.uJitter, type: "f32" },
        uWarp: { value: uniforms.uWarp, type: "f32" },
        uGrainSize: { value: uniforms.uGrainSize, type: "f32" },
        uSpeed: { value: uniforms.uSpeed, type: "f32" },
        uVignette: { value: uniforms.uVignette, type: "f32" },
        uPalette: { value: uniforms.uPalette, type: "f32" },
        uSeed: { value: uniforms.uSeed, type: "f32" },
      },
    },
  });
  return {
    filter: filter as unknown as StaticFilter,
    uniforms: filter.resources.staticFilterUniforms.uniforms as Uniforms,
  };
}
const VERTEX = `in vec2 aPosition;out vec2 vTextureCoord;out vec2 vLocalCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(void){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0,1);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);vLocalCoord=aPosition;}`;
export const STATIC_FILTER_FRAGMENT_SOURCE = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vLocalCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform float uTime;
uniform vec2 uResolution;
uniform float uPower;
uniform float uDensity;
uniform float uScanline;
uniform float uJitter;
uniform float uWarp;
uniform float uGrainSize;
uniform float uSpeed;
uniform float uVignette;
uniform float uPalette;
uniform float uSeed;
float hash11(float value) {
  return fract(sin(value * 127.1 + uSeed * 311.7) * 43758.5453123);
}
float hash21(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7)) + uSeed * 73.13) * 43758.5453123);
}
float luminance(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
vec2 inputUv(vec2 localUv) {
  vec2 frameScale = uInputClamp.xy + uInputClamp.zw;
  return clamp(localUv * frameScale, uInputClamp.xy, uInputClamp.zw);
}
vec3 currentAt(vec2 localUv) { return texture(uTexture, inputUv(localUv)).rgb; }
vec3 palette(vec3 color) {
  float lightness = luminance(color);
  if (uPalette < 0.5) return mix(vec3(lightness) * vec3(0.72, 0.9, 1.08), color * vec3(0.84, 0.94, 1.08), 0.55);
  if (uPalette < 1.5) return vec3(lightness) * vec3(1.08, 0.87, 0.62) + color * 0.18;
  if (uPalette < 2.5) return vec3(lightness * 0.48, lightness * 1.02, lightness * 0.58) + color * 0.12;
  return vec3(lightness);
}
void main(void) {
  vec2 uv = vLocalCoord;
  vec4 source = texture(uTexture, vTextureCoord);
  float line = floor(uv.y * uResolution.y / max(0.5, uGrainSize));
  float lineRandom = hash11(line + floor(uTime * mix(8.0, 28.0, uJitter)));
  float phase = sin(uv.y * uResolution.y * 3.14159 + lineRandom * 6.28);
  float active = smoothstep(0.15, 0.92, abs(phase)) * uScanline;
  float snow = hash21(floor(uv * uResolution / max(0.5, uGrainSize)) + floor(uTime * 47.0));
  float tear = (lineRandom - 0.5) * uWarp * 0.035 * uPower * (0.18 + active * (0.35 + uJitter));
  vec2 warped = clamp(uv + vec2(tear, 0.0), 0.0, 1.0);
  vec3 color = currentAt(warped);
  color.r = currentAt(warped + vec2(tear * 0.16, 0.0)).r;
  color.b = currentAt(warped - vec2(tear * 0.22, 0.0)).b;
  color = palette(color);
  color += vec3((snow - 0.5) * uDensity * 0.52 - active * 0.12) * uPower;
  float vignette = smoothstep(0.35, 0.92, length((uv - 0.5) * vec2(1.0, 0.74))) * uVignette;
  finalColor = vec4(mix(source.rgb, color * (1.0 - vignette * 0.42), uPower), source.a);
}`;
const FRAGMENT = STATIC_FILTER_FRAGMENT_SOURCE;
