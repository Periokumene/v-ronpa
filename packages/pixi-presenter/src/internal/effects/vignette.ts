import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Filter, GlProgram, type Ticker } from "pixi.js";
import type { PresentationTaskController } from "../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../systemTypes";
import { LiveParamTransition, type NumericLiveState, type TweenSystem } from "./animation";
import type { RootFilterStack } from "./rootFilterStack";

type Snapshot = NonNullable<PixiStageSnapshot["screenFilters"]["vignette"]>;

interface VignetteUniforms {
  uTime: number;
  uResolution: Float32Array;
  uPower: number;
  uRadius: number;
  uSoftness: number;
  uColor: Float32Array;
  uBreathe: number;
  uGrain: number;
}

interface VignetteFilter {
  resources: { vignetteUniforms: { uniforms: VignetteUniforms } };
  destroy(destroyPrograms?: boolean): void;
}

interface RecordState {
  filter: VignetteFilter;
  uniforms: VignetteUniforms;
  live: NumericLiveState;
  snapshot: Snapshot;
  transition: LiveParamTransition;
  removing: boolean;
}

export class VignetteEffectController {
  private record: RecordState | undefined;

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  reconcile(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[]): void {
    const next = snapshot.screenFilters.vignette;
    const removal = hints.find((hint): hint is Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> =>
      hint.type === "screen-filter-remove" && hint.kind === "vignette");
    if (!next || next.power <= 0) { this.remove(snapshot.revision, animate, removal); return; }
    const target = liveParams(next);
    const isNew = !this.record;
    if (!this.record) {
      const shader = createVignetteFilter(this.options.width(), this.options.height());
      const live = { ...target };
      if (animate && next.transition.durationMs > 0) live.power = 0;
      this.record = { ...shader, live, snapshot: next, transition: new LiveParamTransition(this.tweens, this.tasks), removing: false };
    }
    const record = this.record;
    if (!isNew && !record.removing && sameVignette(record.snapshot, next)) return;
    if (record.removing) record.transition.cancel(false);
    record.snapshot = next;
    record.removing = false;
    applyLive(record);
    record.transition.start({
      state: record.live, to: target, animate, durationMs: next.transition.durationMs,
      easing: next.transition.easing, forceTask: next.transition.wait,
      task: { kind: "screen-filter-transition", target: "vignette", revision: snapshot.revision },
      onUpdate: () => applyLive(record)
    });
  }

  getFilter(): Filter | undefined { return this.record?.filter as unknown as Filter | undefined; }
  tick(ticker: Ticker): void { if (this.record) this.record.uniforms.uTime += Math.max(0, ticker.deltaMS) / 1000; }
  relayoutViewport(): void {
    if (!this.record) return;
    this.record.uniforms.uResolution[0] = Math.max(1, this.options.width());
    this.record.uniforms.uResolution[1] = Math.max(1, this.options.height());
  }
  clear(cancelTasks = true): void {
    const record = this.record;
    if (!record) return;
    record.transition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget("vignette");
    this.rootFilters.removeScreenFilter(record.filter as unknown as Filter);
    record.filter.destroy();
    this.record = undefined;
  }
  destroy(): void { this.clear(); }

  private remove(revision: number, animate: boolean, hint: Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> | undefined): void {
    const record = this.record;
    if (!record || record.removing) return;
    if (animate && hint && hint.durationMs > 0) {
      record.removing = true;
      record.transition.start({
        state: record.live, to: { ...record.live, power: 0 }, animate: true, durationMs: hint.durationMs,
        easing: hint.easing, forceTask: hint.wait,
        task: { kind: "screen-filter-transition", target: "vignette", revision },
        onUpdate: () => applyLive(record), onComplete: () => this.clear(false), onSettle: () => this.clear(false)
      });
      return;
    }
    this.clear();
  }
}

function liveParams(value: Snapshot): NumericLiveState {
  const color = parseColor(value.color);
  return { power: value.power, radius: value.radius, softness: value.softness, breathe: value.breathe, grain: value.grain,
    colorR: color[0], colorG: color[1], colorB: color[2] };
}

function applyLive(record: RecordState): void {
  const { live, uniforms } = record;
  uniforms.uPower = live.power ?? 0;
  uniforms.uRadius = live.radius ?? 0;
  uniforms.uSoftness = live.softness ?? 0;
  uniforms.uBreathe = live.breathe ?? 0;
  uniforms.uGrain = live.grain ?? 0;
  uniforms.uColor[0] = live.colorR ?? 0;
  uniforms.uColor[1] = live.colorG ?? 0;
  uniforms.uColor[2] = live.colorB ?? 0;
}

function sameVignette(left: Snapshot, right: Snapshot): boolean {
  return left.power === right.power && left.radius === right.radius && left.softness === right.softness &&
    left.color === right.color && left.breathe === right.breathe && left.grain === right.grain;
}

function createVignetteFilter(width: number, height: number): Pick<RecordState, "filter" | "uniforms"> {
  const uniforms: VignetteUniforms = { uTime: 0, uResolution: new Float32Array([width, height]), uPower: 0,
    uRadius: 0.62, uSoftness: 0.3, uColor: new Float32Array([0, 0, 0]), uBreathe: 0, uGrain: 0 };
  if (typeof document === "undefined") return { filter: { resources: { vignetteUniforms: { uniforms } }, destroy: () => undefined }, uniforms };
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: "v-ronpa-vignette" }),
    resources: { vignetteUniforms: {
      uTime: { value: uniforms.uTime, type: "f32" }, uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
      uPower: { value: uniforms.uPower, type: "f32" }, uRadius: { value: uniforms.uRadius, type: "f32" },
      uSoftness: { value: uniforms.uSoftness, type: "f32" }, uColor: { value: uniforms.uColor, type: "vec3<f32>" },
      uBreathe: { value: uniforms.uBreathe, type: "f32" }, uGrain: { value: uniforms.uGrain, type: "f32" }
    } }
  });
  return { filter: filter as unknown as VignetteFilter, uniforms: filter.resources.vignetteUniforms.uniforms as VignetteUniforms };
}

function parseColor(value: string): [number, number, number] {
  const hex = value.replace(/^#/, ""); const full = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  const parsed = Number.parseInt(full, 16); return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
}

const VERTEX = `in vec2 aPosition; out vec2 vTextureCoord; out vec2 vLocalCoord; uniform vec4 uInputSize; uniform vec4 uOutputFrame; uniform vec4 uOutputTexture; void main(void){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0,1);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);vLocalCoord=aPosition;}`;
const FRAGMENT = `precision highp float; in vec2 vTextureCoord; in vec2 vLocalCoord; out vec4 finalColor; uniform sampler2D uTexture; uniform float uTime; uniform vec2 uResolution; uniform float uPower; uniform float uRadius; uniform float uSoftness; uniform vec3 uColor; uniform float uBreathe; uniform float uGrain; float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} void main(void){vec4 s=texture(uTexture,vTextureCoord);vec2 p=(vLocalCoord-.5)*vec2(uResolution.x/max(1.,uResolution.y),1.);float r=uRadius+sin(uTime*.43)*uBreathe*.28;float v=smoothstep(r,max(r+.001,r+uSoftness),length(p));float g=(hash(vLocalCoord*uResolution+floor(uTime*12.))-.5)*2.*uGrain;vec3 c=mix(s.rgb,s.rgb*uColor,v*uPower);c*=1.+g*uPower*(.22+v*.78);finalColor=vec4(c,s.a);}`;
