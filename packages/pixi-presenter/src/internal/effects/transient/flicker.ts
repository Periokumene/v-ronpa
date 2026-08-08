import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Filter, GlProgram } from "pixi.js";
import type {
  PixiPresentationTaskHandle,
  PresentationTaskController,
} from "../../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../../systemTypes";
import type { TweenHandle, TweenSystem } from "../animation";
import type { RootFilterStack } from "../rootFilterStack";
import type { TransientEffectController } from "./types";
type Hint = Extract<PixiStageRenderHint, { type: "flicker" }>;
interface Uniforms {
  uProgress: number;
  uPower: number;
  uBursts: number;
  uIrregularity: number;
  uInvert: number;
  uWhite: number;
  uTear: number;
  uChroma: number;
  uSeed: number;
}
interface FlickerFilter {
  resources: { flickerUniforms: { uniforms: Uniforms } };
  destroy(destroyPrograms?: boolean): void;
}
interface RecordState {
  filter: FlickerFilter;
  uniforms: Uniforms;
  tween?: TweenHandle;
  task?: PixiPresentationTaskHandle;
}
export class FlickerEffectController implements TransientEffectController {
  private record: RecordState | undefined;
  constructor(
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController,
  ) {}
  run(h: Hint, revision: number): void {
    this.clear();
    const r = createFilter();
    Object.assign(r.uniforms, {
      uPower: h.power,
      uBursts: h.bursts,
      uIrregularity: h.irregularity,
      uInvert: h.invert,
      uWhite: h.white,
      uTear: h.tear,
      uChroma: h.chroma,
      uSeed: h.seed,
    });
    this.record = r;
    this.rootFilters.addTransientFilter(r.filter as unknown as Filter);
    const cleanup = () => this.cleanup(r);
    let task!: PixiPresentationTaskHandle;
    task = this.tasks.start({
      kind: "flicker",
      target: "screen",
      revision,
      durationMs: h.durationMs,
      onCancel: cleanup,
      onSettle: cleanup,
    });
    r.task = task;
    r.tween = this.tweens.tween(
      r.uniforms as unknown as Record<string, number>,
      { uProgress: 1 },
      Math.max(1, h.durationMs),
      h.easing ?? "linear",
      () => {
        if (!task.isCurrent()) return;
        this.cleanup(r, false);
        task.complete();
      },
    );
  }
  relayoutViewport(): void {}
  clear(): void {
    const r = this.record;
    if (!r) return;
    r.task?.cancel();
    this.cleanup(r);
  }
  destroy(): void {
    this.clear();
  }
  private cleanup(r: RecordState, cancelTask = true): void {
    if (this.record !== r) return;
    this.record = undefined;
    r.tween?.stop();
    if (cancelTask && r.task?.isCurrent()) r.task.cancel();
    this.rootFilters.removeTransientFilter(r.filter as unknown as Filter);
    r.filter.destroy();
  }
}
function createFilter(): RecordState {
  const uniforms: Uniforms = {
    uProgress: 0,
    uPower: 1,
    uBursts: 4,
    uIrregularity: 0.65,
    uInvert: 0.75,
    uWhite: 0.7,
    uTear: 0.65,
    uChroma: 0.35,
    uSeed: 1,
  };
  if (typeof document === "undefined")
    return {
      filter: {
        resources: { flickerUniforms: { uniforms } },
        destroy: () => undefined,
      },
      uniforms,
    };
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
      name: "v-ronpa-flicker",
    }),
    resources: {
      flickerUniforms: {
        uProgress: { value: uniforms.uProgress, type: "f32" },
        uPower: { value: uniforms.uPower, type: "f32" },
        uBursts: { value: uniforms.uBursts, type: "f32" },
        uIrregularity: { value: uniforms.uIrregularity, type: "f32" },
        uInvert: { value: uniforms.uInvert, type: "f32" },
        uWhite: { value: uniforms.uWhite, type: "f32" },
        uTear: { value: uniforms.uTear, type: "f32" },
        uChroma: { value: uniforms.uChroma, type: "f32" },
        uSeed: { value: uniforms.uSeed, type: "f32" },
      },
    },
  });
  return {
    filter: filter as unknown as FlickerFilter,
    uniforms: filter.resources.flickerUniforms.uniforms as Uniforms,
  };
}
const VERTEX = `in vec2 aPosition;out vec2 vTextureCoord;out vec2 vLocalCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(void){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0,1);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);vLocalCoord=aPosition;}`;
export const FLICKER_FRAGMENT_SOURCE = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vLocalCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform float uProgress;
uniform float uPower;
uniform float uBursts;
uniform float uIrregularity;
uniform float uInvert;
uniform float uWhite;
uniform float uTear;
uniform float uChroma;
uniform float uSeed;
float hash11(float value) {
  return fract(sin(value * 127.1 + uSeed * 311.7) * 43758.5453123);
}
vec2 inputUv(vec2 localUv) {
  vec2 frameScale = uInputClamp.xy + uInputClamp.zw;
  return clamp(localUv * frameScale, uInputClamp.xy, uInputClamp.zw);
}
vec3 currentAt(vec2 localUv) { return texture(uTexture, inputUv(localUv)).rgb; }
void main(void) {
  vec2 uv = vLocalCoord;
  vec4 source = texture(uTexture, vTextureCoord);
  float burstCount = max(1.0, uBursts);
  float scaled = min(uProgress, 0.999999) * burstCount;
  float event = floor(scaled);
  float localTime = fract(scaled);
  float center = mix(0.34, 0.66, hash11(event * 5.17 + 2.0));
  float width = mix(0.10, 0.34, hash11(event * 9.31 + 7.0)) * (1.0 + uIrregularity * 0.42);
  float pulse = 1.0 - smoothstep(width, width + 0.055, abs(localTime - center));
  float band = floor(uv.y * (9.0 + uTear * 31.0));
  float tear = (hash11(band + event) - 0.5) * uTear * 0.12 * pulse * uPower;
  vec2 tornUv = clamp(uv + vec2(tear, 0.0), 0.0, 1.0);
  float afterburn = smoothstep(0.76, 0.82, uProgress) * (1.0 - smoothstep(0.82, 1.0, uProgress));
  float chromaPulse = max(pulse, afterburn);
  vec3 color = currentAt(tornUv);
  vec3 shifted = color;
  shifted.r = currentAt(tornUv + vec2(uChroma * 0.018 * chromaPulse, 0.0)).r;
  shifted.b = currentAt(tornUv - vec2(uChroma * 0.015 * chromaPulse, 0.0)).b;
  color = mix(color, shifted, uChroma * chromaPulse);
  float operationClass = mod(event + floor(abs(uSeed)), 4.0);
  if (operationClass < 0.5) color *= 1.0 - pulse * 0.94;
  else if (operationClass < 1.5) color = mix(color, vec3(1.0) - color, pulse * uInvert);
  else if (operationClass < 2.5) color = mix(color, vec3(1.0), pulse * uWhite);
  else color = mix(color, abs(color * 2.0 - 1.0), pulse * mix(0.45, 0.9, uTear));
  float levels = mix(14.0, 3.0, uTear);
  vec3 posterized = floor(color * levels + 0.5) / levels;
  color = mix(color, posterized, pulse * uTear);
  finalColor = vec4(mix(source.rgb, color, uPower), source.a);
}`;
const FRAGMENT = FLICKER_FRAGMENT_SOURCE;
