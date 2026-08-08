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
type Hint = Extract<PixiStageRenderHint, { type: "shutter" }>;
interface Uniforms {
  uTime: number;
  uDuration: number;
  uResolution: Float32Array;
  uPower: number;
  uShape: number;
  uColor: Float32Array;
  uHold: number;
  uSkew: number;
}
interface ShutterFilter {
  resources: { shutterUniforms: { uniforms: Uniforms } };
  destroy(destroyPrograms?: boolean): void;
}
interface RecordState {
  filter: ShutterFilter;
  uniforms: Uniforms;
  tween?: TweenHandle;
  task?: PixiPresentationTaskHandle;
}
export class ShutterEffectController implements TransientEffectController {
  private record: RecordState | undefined;
  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController,
  ) {}
  run(hint: Hint, revision: number): void {
    this.clear();
    const r = createFilter(this.options.width(), this.options.height());
    r.uniforms.uPower = hint.power;
    r.uniforms.uShape = ["eyelid", "iris", "slice"].indexOf(hint.shape);
    r.uniforms.uColor.set(parseColor(hint.color));
    r.uniforms.uHold = hint.hold;
    r.uniforms.uSkew = hint.skew;
    r.uniforms.uDuration = Math.max(0.001, hint.durationMs / 1000);
    this.record = r;
    this.rootFilters.addTransientFilter(r.filter as unknown as Filter);
    const cleanup = () => this.cleanup(r);
    let task!: PixiPresentationTaskHandle;
    task = this.tasks.start({
      kind: "shutter",
      target: "screen",
      revision,
      durationMs: hint.durationMs,
      onCancel: cleanup,
      onSettle: cleanup,
    });
    r.task = task;
    r.tween = this.tweens.tween(
      r.uniforms as unknown as Record<string, number>,
      { uTime: r.uniforms.uDuration },
      Math.max(1, hint.durationMs),
      hint.easing ?? "linear",
      () => {
        if (!task.isCurrent()) return;
        this.cleanup(r, false);
        task.complete();
      },
    );
  }
  relayoutViewport(): void {
    this.record?.uniforms.uResolution.set([
      Math.max(1, this.options.width()),
      Math.max(1, this.options.height()),
    ]);
  }
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
function createFilter(width: number, height: number): RecordState {
  const uniforms: Uniforms = {
    uTime: 0,
    uDuration: 0.48,
    uResolution: new Float32Array([width, height]),
    uPower: 1,
    uShape: 0,
    uColor: new Float32Array([0, 0, 0]),
    uHold: 0.08,
    uSkew: 0.18,
  };
  if (typeof document === "undefined")
    return {
      filter: {
        resources: { shutterUniforms: { uniforms } },
        destroy: () => undefined,
      },
      uniforms,
    };
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
      name: "v-ronpa-shutter",
    }),
    resources: {
      shutterUniforms: {
        uTime: { value: uniforms.uTime, type: "f32" },
        uDuration: { value: uniforms.uDuration, type: "f32" },
        uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
        uPower: { value: uniforms.uPower, type: "f32" },
        uShape: { value: uniforms.uShape, type: "f32" },
        uColor: { value: uniforms.uColor, type: "vec3<f32>" },
        uHold: { value: uniforms.uHold, type: "f32" },
        uSkew: { value: uniforms.uSkew, type: "f32" },
      },
    },
  });
  return {
    filter: filter as unknown as ShutterFilter,
    uniforms: filter.resources.shutterUniforms.uniforms as Uniforms,
  };
}
function parseColor(v: string): [number, number, number] {
  const h = v.replace(/^#/, "");
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
const VERTEX = `in vec2 aPosition;out vec2 vTextureCoord;out vec2 vLocalCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(void){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0,1);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);vLocalCoord=aPosition;}`;
export const SHUTTER_FRAGMENT_SOURCE = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vLocalCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform float uTime;
uniform float uDuration;
uniform vec2 uResolution;
uniform float uPower;
uniform float uShape;
uniform vec3 uColor;
uniform float uHold;
uniform float uSkew;
float luminance(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
vec2 inputUv(vec2 localUv) {
  vec2 frameScale = uInputClamp.xy + uInputClamp.zw;
  return clamp(localUv * frameScale, uInputClamp.xy, uInputClamp.zw);
}
vec3 currentAt(vec2 localUv) { return texture(uTexture, inputUv(localUv)).rgb; }
void main(void) {
  vec2 uv = vLocalCoord;
  vec4 source = texture(uTexture, vTextureCoord);
  float motion = max(0.001, uDuration - min(uHold, uDuration * 0.8));
  float closeDuration = motion * 0.44;
  float openStart = closeDuration + min(uHold, uDuration * 0.8);
  float close = pow(clamp(uTime / closeDuration, 0.0, 1.0), 3.0);
  float openTime = clamp((uTime - openStart) / max(0.001, uDuration - openStart), 0.0, 1.0);
  float open = 1.0 - pow(1.0 - openTime, 5.0);
  float amount = clamp(close - open, 0.0, 1.0) * uPower;
  vec2 point = uv - 0.5;
  float shapeDistance = 0.0;
  if (uShape < 0.5) {
    shapeDistance = abs(point.y) - 0.5 + amount * 0.52
      - sin(uv.x * 9.0 + uTime * 7.0) * uSkew * 0.012;
  } else if (uShape < 1.5) {
    shapeDistance = length(point * vec2(1.0, 1.55)) - 0.92 * (1.0 - amount);
  } else {
    shapeDistance = abs(point.x + point.y * uSkew)
      - (0.5 + uSkew * 0.5) + amount * (0.55 + uSkew * 0.5);
  }
  float antialias = 1.5 / max(1.0, min(uResolution.x, uResolution.y));
  float mask = smoothstep(-antialias, antialias, shapeDistance);
  vec2 pinched = 0.5 + point * (1.0 - amount * 0.025);
  vec3 lens = currentAt(pinched);
  float lightness = luminance(lens);
  lens = mix(lens, vec3(lightness) * vec3(0.86, 0.9, 0.96), amount * 0.62);
  finalColor = vec4(mix(lens, uColor, mask), source.a);
}`;
const FRAGMENT = SHUTTER_FRAGMENT_SOURCE;
