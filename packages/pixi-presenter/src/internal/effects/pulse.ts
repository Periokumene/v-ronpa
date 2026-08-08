import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import {
  Filter,
  GlProgram,
  Texture,
  TexturePool,
  type FilterSystem,
  type RenderSurface,
  type Ticker,
} from "pixi.js";
import type { PresentationTaskController } from "../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../systemTypes";
import {
  LiveParamTransition,
  type NumericLiveState,
  type TweenSystem,
} from "./animation";
import type { RootFilterStack } from "./rootFilterStack";

type Snapshot = NonNullable<PixiStageSnapshot["screenFilters"]["pulse"]>;
interface Uniforms {
  uTime: number;
  uPhase: number;
  uResolution: Float32Array;
  uHistoryClamp: Float32Array;
  uPower: number;
  uRate: number;
  uOrigin: Float32Array;
  uEchoes: number;
  uExpansion: number;
  uEdge: number;
  uDistortion: number;
  uChroma: number;
  uDecay: number;
  uColor: Float32Array;
}
interface PulseFilter {
  resources: { pulseUniforms: { uniforms: Uniforms } };
  requestHistoryCapture(): void;
  destroy(destroyPrograms?: boolean): void;
}
interface RecordState {
  filter: PulseFilter;
  uniforms: Uniforms;
  live: NumericLiveState;
  snapshot: Snapshot;
  transition: LiveParamTransition;
  removing: boolean;
  lastBeat: number;
}

export class PulseEffectController {
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
    const next = snapshot.screenFilters.pulse;
    const removal = hints.find(
      (
        h,
      ): h is Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> =>
        h.type === "screen-filter-remove" && h.kind === "pulse",
    );
    if (!next || next.power <= 0) {
      this.remove(snapshot.revision, animate, removal);
      return;
    }
    const target = liveParams(next);
    const isNew = !this.record;
    if (!this.record) {
      const shader = createPulseFilter(
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
        lastBeat: -1,
      };
    }
    const r = this.record;
    if (!isNew && !r.removing && samePulse(r.snapshot, next)) return;
    if (r.removing) r.transition.cancel(false);
    r.snapshot = next;
    r.removing = false;
    applyLive(r);
    r.filter.requestHistoryCapture();
    r.transition.start({
      state: r.live,
      to: target,
      animate,
      durationMs: next.transition.durationMs,
      easing: next.transition.easing,
      forceTask: next.transition.wait,
      task: {
        kind: "screen-filter-transition",
        target: "pulse",
        revision: snapshot.revision,
      },
      onUpdate: () => applyLive(r),
    });
  }
  getFilter(): Filter | undefined {
    return this.record?.filter as unknown as Filter | undefined;
  }
  tick(ticker: Ticker): void {
    const r = this.record;
    if (!r) return;
    const seconds = Math.max(0, ticker.deltaMS) / 1000;
    r.uniforms.uTime += seconds;
    r.uniforms.uPhase += (seconds * Math.max(1, r.uniforms.uRate)) / 60;
    const beat = Math.floor(r.uniforms.uPhase);
    if (beat !== r.lastBeat) {
      r.lastBeat = beat;
      r.filter.requestHistoryCapture();
    }
  }
  relayoutViewport(): void {
    const r = this.record;
    if (!r) return;
    r.uniforms.uResolution.set([
      Math.max(1, this.options.width()),
      Math.max(1, this.options.height()),
    ]);
    r.filter.requestHistoryCapture();
  }
  clear(cancelTasks = true): void {
    const r = this.record;
    if (!r) return;
    r.transition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget("pulse");
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
        task: { kind: "screen-filter-transition", target: "pulse", revision },
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
  const c = parseColor(v.color);
  return {
    power: v.power,
    rate: v.rate,
    originX: v.origin[0],
    originY: v.origin[1],
    echoes: v.echoes,
    expansion: v.expansion,
    edge: v.edge,
    distortion: v.distortion,
    chroma: v.chroma,
    decay: v.decay,
    colorR: c[0],
    colorG: c[1],
    colorB: c[2],
  };
}
function applyLive(r: RecordState): void {
  const l = r.live,
    u = r.uniforms;
  u.uPower = l.power ?? 0;
  u.uRate = l.rate ?? 1;
  u.uOrigin.set([l.originX ?? 0.5, l.originY ?? 0.5]);
  u.uEchoes = l.echoes ?? 1;
  u.uExpansion = l.expansion ?? 0;
  u.uEdge = l.edge ?? 0;
  u.uDistortion = l.distortion ?? 0;
  u.uChroma = l.chroma ?? 0;
  u.uDecay = l.decay ?? 0;
  u.uColor.set([l.colorR ?? 1, l.colorG ?? 1, l.colorB ?? 1]);
}
function samePulse(a: Snapshot, b: Snapshot): boolean {
  return (
    a.power === b.power &&
    a.rate === b.rate &&
    a.origin[0] === b.origin[0] &&
    a.origin[1] === b.origin[1] &&
    a.echoes === b.echoes &&
    a.expansion === b.expansion &&
    a.edge === b.edge &&
    a.distortion === b.distortion &&
    a.chroma === b.chroma &&
    a.decay === b.decay &&
    a.color === b.color
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
function createPulseFilter(
  width: number,
  height: number,
): Pick<RecordState, "filter" | "uniforms"> {
  const uniforms: Uniforms = {
    uTime: 0,
    uPhase: 0,
    uResolution: new Float32Array([width, height]),
    uHistoryClamp: new Float32Array([0, 0, 1, 1]),
    uPower: 0,
    uRate: 92,
    uOrigin: new Float32Array([0.5, 0.52]),
    uEchoes: 3,
    uExpansion: 0.035,
    uEdge: 0.65,
    uDistortion: 0.35,
    uChroma: 0.18,
    uDecay: 0.72,
    uColor: new Float32Array([1, 1, 1]),
  };
  if (typeof document === "undefined")
    return {
      filter: {
        resources: { pulseUniforms: { uniforms } },
        requestHistoryCapture: () => undefined,
        destroy: () => undefined,
      },
      uniforms,
    };
  const resources = {
    pulseUniforms: {
      uTime: { value: uniforms.uTime, type: "f32" },
      uPhase: { value: uniforms.uPhase, type: "f32" },
      uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
      uHistoryClamp: { value: uniforms.uHistoryClamp, type: "vec4<f32>" },
      uPower: { value: uniforms.uPower, type: "f32" },
      uRate: { value: uniforms.uRate, type: "f32" },
      uOrigin: { value: uniforms.uOrigin, type: "vec2<f32>" },
      uEchoes: { value: uniforms.uEchoes, type: "f32" },
      uExpansion: { value: uniforms.uExpansion, type: "f32" },
      uEdge: { value: uniforms.uEdge, type: "f32" },
      uDistortion: { value: uniforms.uDistortion, type: "f32" },
      uChroma: { value: uniforms.uChroma, type: "f32" },
      uDecay: { value: uniforms.uDecay, type: "f32" },
      uColor: { value: uniforms.uColor, type: "vec3<f32>" },
    },
    uHistoryTexture: Texture.EMPTY.source,
    uHistorySampler: Texture.EMPTY.source.style,
  };
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
      name: "v-ronpa-pulse",
    }),
    resources,
  });
  filter.padding = 32;
  installHistory(filter, resources);
  return {
    filter: filter as unknown as PulseFilter,
    uniforms: filter.resources.pulseUniforms.uniforms as Uniforms,
  };
}
function installHistory(
  filter: Filter,
  resources: {
    uHistoryTexture: Texture["source"];
    uHistorySampler: Texture["source"]["style"];
  },
): void {
  const copy = new Filter({
    glProgram: GlProgram.from({
      vertex: VERTEX,
      fragment: COPY_FRAGMENT,
      name: "v-ronpa-pulse-history-copy",
    }),
    resources: {},
  });
  let history: Texture | undefined;
  let requested = true;
  let width = 0,
    height = 0,
    resolution = 0;
  const apply = filter.apply.bind(filter),
    destroy = filter.destroy.bind(filter);
  filter.apply = (
    manager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clear: boolean,
  ) => {
    const nextResolution = Math.max(0.5, input.source.resolution * 0.5);
    if (
      requested ||
      !history ||
      width !== input.width ||
      height !== input.height ||
      resolution !== nextResolution
    ) {
      if (history) TexturePool.returnTexture(history);
      history = TexturePool.getOptimalTexture(
        input.width,
        input.height,
        nextResolution,
        false,
      );
      manager.applyFilter(copy, input, history, true);
      resources.uHistoryTexture = history.source;
      resources.uHistorySampler = history.source.style;
      (filter.resources as typeof resources).uHistoryTexture = history.source;
      (filter.resources as typeof resources).uHistorySampler =
        history.source.style;
      const clamp = filter.resources.pulseUniforms.uniforms.uHistoryClamp;
      const hx = 0.5 / Math.max(1, history.source.pixelWidth),
        hy = 0.5 / Math.max(1, history.source.pixelHeight);
      clamp.set([
        hx,
        hy,
        history.frame.width / history.source.width - hx,
        history.frame.height / history.source.height - hy,
      ]);
      width = input.width;
      height = input.height;
      resolution = nextResolution;
      requested = false;
    }
    apply(manager, input, output, clear);
  };
  (filter as Filter & { requestHistoryCapture(): void }).requestHistoryCapture =
    () => {
      requested = true;
    };
  filter.destroy = (destroyPrograms?: boolean) => {
    if (history) {
      TexturePool.returnTexture(history);
      history = undefined;
    }
    copy.destroy(destroyPrograms);
    destroy(destroyPrograms);
  };
}
const VERTEX = `in vec2 aPosition;out vec2 vTextureCoord;out vec2 vLocalCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(void){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0,1);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);vLocalCoord=aPosition;}`;
const FRAGMENT = `precision highp float;in vec2 vTextureCoord;in vec2 vLocalCoord;out vec4 finalColor;uniform sampler2D uTexture;uniform sampler2D uHistoryTexture;uniform vec4 uHistoryClamp;uniform float uPhase;uniform vec2 uResolution;uniform float uPower;uniform float uRate;uniform vec2 uOrigin;uniform float uEchoes;uniform float uExpansion;uniform float uEdge;uniform float uDistortion;uniform float uChroma;uniform float uDecay;uniform vec3 uColor;vec3 hist(vec2 uv){vec2 s=uHistoryClamp.xy+uHistoryClamp.zw;return texture(uHistoryTexture,clamp(uv*s,uHistoryClamp.xy,uHistoryClamp.zw)).rgb;}float beat(float p){float t=fract(p);float a=exp(-max(0.,t-.054)*9.13)*smoothstep(0.,.054,t);float b=.35*exp(-max(0.,t-.391)*11.74)*smoothstep(.330,.391,t);return clamp(a+b,0.,1.);}void main(void){vec4 source=texture(uTexture,vTextureCoord);float b=beat(uPhase)*uPower;vec3 c=source.rgb;for(int i=1;i<=4;i++){float f=float(i);if(f>uEchoes)break;vec2 radial=vLocalCoord-uOrigin;vec2 echo=uOrigin+radial*(1.-pow(b,.72)*uExpansion*f);vec3 h=hist(echo);float e=max(0.,dot(h,vec3(.2126,.7152,.0722))-.55)*pow(max(.01,uDecay),f-1.)*b;c+=mix(uColor,h,.34)*e*uEdge;}finalColor=vec4(clamp(c,0.,1.4),source.a);}`;
const COPY_FRAGMENT = `precision highp float;in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;void main(void){finalColor=texture(uTexture,vTextureCoord);}`;
