import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import {
  Filter,
  GlProgram,
  Texture,
  TexturePool,
  type Container,
  type FilterSystem,
  type RenderSurface
} from "pixi.js";
import type { PixiPresentationTaskHandle, PresentationTaskController } from "../../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../../systemTypes";
import type { TweenHandle, TweenSystem } from "../animation";
import type { RootFilterStack } from "../rootFilterStack";
import type { TransientActorTargetResolver, TransientEffectController } from "./types";

type AfterimageHint = Extract<PixiStageRenderHint, { type: "afterimage" }>;

interface AfterimageUniforms {
  uProgress: number;
  uResolution: Float32Array;
  uHistoryClamp: Float32Array;
  uPower: number;
  uCount: number;
  uOffset: Float32Array;
  uDecay: number;
  uTint: Float32Array;
  uEdge: number;
}

interface AfterimageFilter {
  resources: { afterimageUniforms: { uniforms: AfterimageUniforms } };
  requestHistoryCapture(): void;
  destroy(destroyPrograms?: boolean): void;
}

interface AfterimageRecord {
  filter: AfterimageFilter;
  uniforms: AfterimageUniforms;
  actor?: Container | undefined;
  tween?: TweenHandle;
  task?: PixiPresentationTaskHandle;
}

export class AfterimageEffectController implements TransientEffectController {
  private record: AfterimageRecord | undefined;

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly actors: TransientActorTargetResolver,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  run(hint: AfterimageHint, revision: number): void {
    this.clear();
    const record = createAfterimageFilter(this.options.width(), this.options.height());
    record.uniforms.uPower = hint.power;
    record.uniforms.uCount = hint.count;
    record.uniforms.uOffset.set(hint.offset);
    record.uniforms.uDecay = hint.decay;
    record.uniforms.uTint.set(parseColor(hint.tint));
    record.uniforms.uEdge = hint.edge;
    const spacing = hint.count * (0.75 + 0.22 * hint.count);
    (record.filter as unknown as Filter).padding = Math.ceil(Math.max(
      Math.abs(hint.offset[0]) * this.options.width(),
      Math.abs(hint.offset[1]) * this.options.height()
    ) * spacing + 16);
    const actor = hint.target !== "stage" && hint.target !== "camera"
      ? this.actors.getLayerForEffects(hint.target)
      : undefined;
    record.actor = actor;
    this.record = record;
    if (actor) actor.filters = [...(actor.filters ?? []), record.filter as unknown as Filter];
    else this.rootFilters.addTransientFilter(record.filter as unknown as Filter);

    const cleanup = () => this.cleanup(record);
    let task!: PixiPresentationTaskHandle;
    task = this.tasks.start({
      kind: "afterimage",
      target: hint.target,
      revision,
      durationMs: hint.durationMs,
      onCancel: cleanup,
      onSettle: cleanup
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
      }
    );
  }

  relayoutViewport(): void {
    const record = this.record;
    if (!record) return;
    record.uniforms.uResolution.set([Math.max(1, this.options.width()), Math.max(1, this.options.height())]);
    record.filter.requestHistoryCapture();
  }

  clear(): void {
    const record = this.record;
    if (!record) return;
    record.task?.cancel();
    this.cleanup(record);
  }

  destroy(): void { this.clear(); }

  private cleanup(record: AfterimageRecord, cancelTask = true): void {
    if (this.record !== record) return;
    this.record = undefined;
    record.tween?.stop();
    if (cancelTask && record.task?.isCurrent()) record.task.cancel();
    if (record.actor) {
      const remaining = (record.actor.filters ?? []).filter((filter) => filter !== record.filter as unknown as Filter);
      record.actor.filters = remaining.length > 0 ? remaining : null;
    } else this.rootFilters.removeTransientFilter(record.filter as unknown as Filter);
    record.filter.destroy();
  }
}

function createAfterimageFilter(width: number, height: number): AfterimageRecord {
  const uniforms: AfterimageUniforms = {
    uProgress: 0,
    uResolution: new Float32Array([width, height]),
    uHistoryClamp: new Float32Array([0, 0, 1, 1]),
    uPower: 0.7,
    uCount: 4,
    uOffset: new Float32Array([-0.015, 0]),
    uDecay: 0.7,
    uTint: new Float32Array([1, 1, 1]),
    uEdge: 0.55
  };
  if (typeof document === "undefined") return {
    filter: {
      resources: { afterimageUniforms: { uniforms } },
      requestHistoryCapture: () => undefined,
      destroy: () => undefined
    },
    uniforms
  };
  const resources = {
    afterimageUniforms: {
      uProgress: { value: uniforms.uProgress, type: "f32" },
      uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
      uHistoryClamp: { value: uniforms.uHistoryClamp, type: "vec4<f32>" },
      uPower: { value: uniforms.uPower, type: "f32" },
      uCount: { value: uniforms.uCount, type: "f32" },
      uOffset: { value: uniforms.uOffset, type: "vec2<f32>" },
      uDecay: { value: uniforms.uDecay, type: "f32" },
      uTint: { value: uniforms.uTint, type: "vec3<f32>" },
      uEdge: { value: uniforms.uEdge, type: "f32" }
    },
    uHistoryTexture: Texture.EMPTY.source,
    uHistorySampler: Texture.EMPTY.source.style
  };
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: "v-ronpa-afterimage" }),
    resources
  });
  installHistoryCapture(filter, resources);
  return {
    filter: filter as unknown as AfterimageFilter,
    uniforms: filter.resources.afterimageUniforms.uniforms as AfterimageUniforms
  };
}

function installHistoryCapture(
  filter: Filter,
  resources: { uHistoryTexture: Texture["source"]; uHistorySampler: Texture["source"]["style"] }
): void {
  const copy = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment: COPY_FRAGMENT, name: "v-ronpa-afterimage-history-copy" }),
    resources: {}
  });
  let history: Texture | undefined;
  let captureRequested = true;
  let capturedWidth = 0;
  let capturedHeight = 0;
  const originalApply = filter.apply.bind(filter);
  const originalDestroy = filter.destroy.bind(filter);
  filter.apply = (manager: FilterSystem, input: Texture, output: RenderSurface, clear: boolean) => {
    if (captureRequested || !history || capturedWidth !== input.width || capturedHeight !== input.height) {
      if (history) TexturePool.returnTexture(history);
      history = TexturePool.getOptimalTexture(input.width, input.height, Math.max(0.5, input.source.resolution * 0.5), false);
      manager.applyFilter(copy, input, history, true);
      resources.uHistoryTexture = history.source;
      resources.uHistorySampler = history.source.style;
      (filter.resources as typeof resources).uHistoryTexture = history.source;
      (filter.resources as typeof resources).uHistorySampler = history.source.style;
      const clamp = filter.resources.afterimageUniforms.uniforms.uHistoryClamp;
      const halfX = 0.5 / Math.max(1, history.source.pixelWidth);
      const halfY = 0.5 / Math.max(1, history.source.pixelHeight);
      clamp.set([
        halfX,
        halfY,
        history.frame.width / history.source.width - halfX,
        history.frame.height / history.source.height - halfY
      ]);
      capturedWidth = input.width;
      capturedHeight = input.height;
      captureRequested = false;
    }
    originalApply(manager, input, output, clear);
  };
  (filter as Filter & { requestHistoryCapture(): void }).requestHistoryCapture = () => { captureRequested = true; };
  filter.destroy = (destroyPrograms?: boolean) => {
    if (history) {
      TexturePool.returnTexture(history);
      history = undefined;
    }
    copy.destroy(destroyPrograms);
    originalDestroy(destroyPrograms);
  };
}

function parseColor(value: string): [number, number, number] {
  const hex = value.replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  const parsed = Number.parseInt(full, 16);
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
}

const VERTEX = `in vec2 aPosition;out vec2 vTextureCoord;out vec2 vLocalCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(void){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0,1);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);vLocalCoord=aPosition;}`;
export const AFTERIMAGE_FRAGMENT_SOURCE = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vLocalCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uHistoryTexture;
uniform vec4 uHistoryClamp;
uniform float uProgress;
uniform vec2 uResolution;
uniform float uPower;
uniform float uCount;
uniform vec2 uOffset;
uniform float uDecay;
uniform vec3 uTint;
uniform float uEdge;
float luminance(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
vec4 historyAt(vec2 localUv) {
  vec2 frameScale = uHistoryClamp.xy + uHistoryClamp.zw;
  return texture(uHistoryTexture, clamp(localUv * frameScale, uHistoryClamp.xy, uHistoryClamp.zw));
}
void main(void) {
  vec2 uv = vLocalCoord;
  vec4 source = texture(uTexture, vTextureCoord);
  vec3 result = source.rgb;
  float outputAlpha = source.a;
  for (int index = 1; index <= 6; index++) {
    float echoIndex = float(index);
    if (echoIndex > uCount) break;
    float spacing = echoIndex * (0.75 + 0.22 * echoIndex);
    vec2 echoUv = clamp(uv - uOffset * spacing * uProgress, 0.0, 1.0);
    vec2 pixelStep = vec2(1.0 + echoIndex * 0.4) / max(vec2(1.0), uResolution);
    vec4 history0 = historyAt(echoUv + pixelStep);
    vec4 history1 = historyAt(echoUv - pixelStep);
    vec4 history2 = historyAt(echoUv + vec2(pixelStep.x, -pixelStep.y));
    vec4 history3 = historyAt(echoUv + vec2(-pixelStep.x, pixelStep.y));
    vec4 historyColor = (history0 + history1 + history2 + history3) * 0.25;
    float gradientX = luminance(history0.rgb) - luminance(history1.rgb);
    float gradientY = luminance(history2.rgb) - luminance(history3.rgb);
    float edge = clamp(
      length(vec2(gradientX, gradientY)) * 4.2
        + max(0.0, luminance(historyColor.rgb) - 0.7 * historyColor.a),
      0.0,
      1.0
    ) * pow(max(0.01, uDecay), echoIndex - 1.0) * (1.0 - uProgress);
    float echoWeight = edge * uEdge * uPower;
    result += mix(uTint * historyColor.a, historyColor.rgb, 0.25) * echoWeight;
    outputAlpha = max(outputAlpha, historyColor.a * echoWeight);
  }
  outputAlpha = clamp(outputAlpha, 0.0, 1.0);
  finalColor = vec4(min(clamp(result, 0.0, 1.0), vec3(outputAlpha)), outputAlpha);
}`;
const FRAGMENT = AFTERIMAGE_FRAGMENT_SOURCE;
const COPY_FRAGMENT = `precision highp float;in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;void main(void){finalColor=texture(uTexture,vTextureCoord);}`;
