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

type Hint = Extract<PixiStageRenderHint, { type: "impact" }>;
interface Uniforms {
  uProgress: number;
  uResolution: Float32Array;
  uPower: number;
  uOrigin: Float32Array;
  uDirection: number;
  uSmear: number;
  uChroma: number;
}
interface ImpactFilter {
  resources: { impactUniforms: { uniforms: Uniforms } };
  destroy(destroyPrograms?: boolean): void;
}
interface RecordState {
  filter: ImpactFilter;
  uniforms: Uniforms;
  tween?: TweenHandle;
  task?: PixiPresentationTaskHandle;
}

export class ImpactEffectController implements TransientEffectController {
  private record: RecordState | undefined;
  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController,
  ) {}
  run(hint: Hint, revision: number): void {
    this.clear();
    const record = createImpactFilter(
      this.options.width(),
      this.options.height(),
    );
    record.uniforms.uPower = hint.power;
    record.uniforms.uOrigin.set(hint.origin);
    record.uniforms.uDirection = hint.direction;
    record.uniforms.uSmear = hint.smear;
    record.uniforms.uChroma = hint.chroma;
    this.record = record;
    this.rootFilters.addTransientFilter(record.filter as unknown as Filter);
    const cleanup = () => this.cleanup(record);
    let task!: PixiPresentationTaskHandle;
    task = this.tasks.start({
      kind: "impact",
      target: "screen",
      revision,
      durationMs: hint.durationMs,
      onCancel: cleanup,
      onSettle: cleanup,
    });
    record.task = task;
    record.tween = this.tweens.tween(
      record.uniforms as unknown as Record<string, number>,
      { uProgress: 1 },
      Math.max(1, hint.durationMs),
      hint.easing ?? "easeOut",
      () => {
        if (!task.isCurrent()) return;
        this.cleanup(record, false);
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
  private cleanup(record: RecordState, cancelTask = true): void {
    if (this.record !== record) return;
    this.record = undefined;
    record.tween?.stop();
    if (cancelTask && record.task?.isCurrent()) record.task.cancel();
    this.rootFilters.removeTransientFilter(record.filter as unknown as Filter);
    record.filter.destroy();
  }
}
function createImpactFilter(width: number, height: number): RecordState {
  const uniforms: Uniforms = {
    uProgress: 0,
    uResolution: new Float32Array([width, height]),
    uPower: 1,
    uOrigin: new Float32Array([0.5, 0.5]),
    uDirection: 0,
    uSmear: 0.6,
    uChroma: 0.25,
  };
  if (typeof document === "undefined")
    return {
      filter: {
        resources: { impactUniforms: { uniforms } },
        destroy: () => undefined,
      },
      uniforms,
    };
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
      name: "v-ronpa-impact",
    }),
    resources: {
      impactUniforms: {
        uProgress: { value: uniforms.uProgress, type: "f32" },
        uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
        uPower: { value: uniforms.uPower, type: "f32" },
        uOrigin: { value: uniforms.uOrigin, type: "vec2<f32>" },
        uDirection: { value: uniforms.uDirection, type: "f32" },
        uSmear: { value: uniforms.uSmear, type: "f32" },
        uChroma: { value: uniforms.uChroma, type: "f32" },
      },
    },
    padding: 32,
  });
  return {
    filter: filter as unknown as ImpactFilter,
    uniforms: filter.resources.impactUniforms.uniforms as Uniforms,
  };
}
const VERTEX = `in vec2 aPosition;out vec2 vTextureCoord;out vec2 vLocalCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(void){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0,1);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);vLocalCoord=aPosition;}`;
export const IMPACT_FRAGMENT_SOURCE = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vLocalCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform float uProgress;
uniform vec2 uResolution;
uniform float uPower;
uniform vec2 uOrigin;
uniform float uDirection;
uniform float uSmear;
uniform float uChroma;
float luminance(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
vec2 inputUv(vec2 localUv) {
  vec2 frameScale = uInputClamp.xy + uInputClamp.zw;
  return clamp(localUv * frameScale, uInputClamp.xy, uInputClamp.zw);
}
vec3 currentAt(vec2 localUv) { return texture(uTexture, inputUv(localUv)).rgb; }
float edgeAt(vec2 uv, float radius) {
  vec2 pixelStep = vec2(radius) / max(vec2(1.0), uResolution);
  float gradientX = luminance(currentAt(uv + vec2(pixelStep.x, 0.0)))
    - luminance(currentAt(uv - vec2(pixelStep.x, 0.0)));
  float gradientY = luminance(currentAt(uv + vec2(0.0, pixelStep.y)))
    - luminance(currentAt(uv - vec2(0.0, pixelStep.y)));
  float center = luminance(currentAt(uv));
  return clamp(length(vec2(gradientX, gradientY)) * 4.2 + max(0.0, center - 0.72) * 1.8, 0.0, 1.0);
}
void main(void) {
  vec2 uv = vLocalCoord;
  vec4 source = texture(uTexture, vTextureCoord);
  float attack = 1.0 - exp(-uProgress * 45.0);
  float tail = 1.0 - smoothstep(0.30, 1.0, uProgress);
  float envelope = attack * tail * uPower;
  float rebound = uProgress < 0.38
    ? 0.0
    : sin((uProgress - 0.38) * 18.0) * exp(-(uProgress - 0.38) * 7.0) * 0.16 * uPower;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 direction = normalize(
    vec2(cos(radians(uDirection)) / aspect, sin(radians(uDirection))) + vec2(0.0001)
  );
  vec2 radial = uv - uOrigin;
  vec2 warped = clamp(
    uv - radial * (envelope * 0.045 - rebound * 0.012) - direction * envelope * uSmear * 0.018,
    0.0,
    1.0
  );
  float edge = edgeAt(warped, 1.2);
  vec2 streak = (
    direction * uSmear + normalize(radial + vec2(0.0001)) * uSmear * 0.7
  ) * envelope * 0.009;
  vec3 color = (
    currentAt(warped) + currentAt(warped - streak) + currentAt(warped - streak * 2.2)
  ) / 3.0;
  color.r = currentAt(warped + direction * uChroma * envelope * 0.012).r;
  color.b = currentAt(warped - direction * uChroma * envelope * 0.014).b;
  color += vec3(edge * envelope * 0.72);
  finalColor = vec4(color, source.a);
}`;
const FRAGMENT = IMPACT_FRAGMENT_SOURCE;
