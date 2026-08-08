import type { PixiActorFilterSnapshot } from "@v-ronpa/contracts";
import { Container, Filter, GlProgram, type Ticker } from "pixi.js";
import type { PixiPresenterSystemsOptions } from "../systemTypes";

type SignalMaskSnapshot = NonNullable<PixiActorFilterSnapshot["signalMask"]>;

interface SignalMaskUniforms {
  uTime: number;
  uResolution: Float32Array;
  uPower: number;
  uBands: number;
  uNoise: number;
  uChroma: number;
  uSpeed: number;
  uThreshold: number;
  uSeed: number;
}

interface SignalMaskFilter {
  resources: { signalMaskUniforms: { uniforms: SignalMaskUniforms } };
  destroy(destroyPrograms?: boolean): void;
}

interface SignalMaskRecord {
  filter: SignalMaskFilter;
  uniforms: SignalMaskUniforms;
}

export class SignalMaskEffectController {
  private readonly records = new Map<Container, SignalMaskRecord>();

  constructor(private readonly options: PixiPresenterSystemsOptions) {}

  apply(container: Container, snapshot: SignalMaskSnapshot | undefined, live: Partial<Record<string, number>>): void {
    const previous = this.records.get(container);
    const power = Math.max(0, live.signalPower ?? snapshot?.power ?? 0);
    if (!snapshot || power <= 0.001) {
      this.release(container);
      return;
    }
    const record = previous ?? createSignalMaskFilter(this.options.width(), this.options.height());
    if (!previous) this.records.set(container, record);
    record.uniforms.uPower = power;
    record.uniforms.uBands = live.signalBands ?? snapshot.bands;
    record.uniforms.uNoise = live.signalNoise ?? snapshot.noise;
    record.uniforms.uChroma = live.signalChroma ?? snapshot.chroma;
    record.uniforms.uSpeed = live.signalSpeed ?? snapshot.speed;
    record.uniforms.uThreshold = live.signalThreshold ?? snapshot.threshold;
    record.uniforms.uSeed = snapshot.seed;
    const siblings = (container.filters ?? []).filter((filter) => filter !== previous?.filter as unknown as Filter);
    container.filters = [record.filter as unknown as Filter, ...siblings];
  }

  tick(ticker: Ticker): void {
    const deltaSeconds = Math.max(0, ticker.deltaMS) / 1000;
    for (const record of this.records.values()) record.uniforms.uTime += deltaSeconds * record.uniforms.uSpeed;
  }

  relayout(container: Container): void {
    const record = this.records.get(container);
    if (!record) return;
    record.uniforms.uResolution[0] = Math.max(1, this.options.width());
    record.uniforms.uResolution[1] = Math.max(1, this.options.height());
  }

  release(container: Container): void {
    const record = this.records.get(container);
    if (!record) return;
    const siblings = (container.filters ?? []).filter((filter) => filter !== record.filter as unknown as Filter);
    container.filters = siblings.length > 0 ? siblings : null;
    record.filter.destroy();
    this.records.delete(container);
  }

  clear(): void {
    for (const container of [...this.records.keys()]) this.release(container);
  }

  destroy(): void { this.clear(); }
}

function createSignalMaskFilter(width: number, height: number): SignalMaskRecord {
  const uniforms: SignalMaskUniforms = {
    uTime: 0,
    uResolution: new Float32Array([Math.max(1, width), Math.max(1, height)]),
    uPower: 0,
    uBands: 0,
    uNoise: 0,
    uChroma: 0,
    uSpeed: 0,
    uThreshold: 0,
    uSeed: 1
  };
  if (typeof document === "undefined") {
    return { filter: { resources: { signalMaskUniforms: { uniforms } }, destroy: () => undefined }, uniforms };
  }
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: "v-ronpa-signal-mask" }),
    resources: {
      signalMaskUniforms: {
        uTime: { value: uniforms.uTime, type: "f32" },
        uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
        uPower: { value: uniforms.uPower, type: "f32" },
        uBands: { value: uniforms.uBands, type: "f32" },
        uNoise: { value: uniforms.uNoise, type: "f32" },
        uChroma: { value: uniforms.uChroma, type: "f32" },
        uSpeed: { value: uniforms.uSpeed, type: "f32" },
        uThreshold: { value: uniforms.uThreshold, type: "f32" },
        uSeed: { value: uniforms.uSeed, type: "f32" }
      }
    },
    padding: 32
  });
  return { filter: filter as unknown as SignalMaskFilter, uniforms: filter.resources.signalMaskUniforms.uniforms as SignalMaskUniforms };
}

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vLocalCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vLocalCoord = aPosition;
}`;

export const SIGNAL_MASK_FRAGMENT_SOURCE = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vLocalCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform float uTime;
uniform vec2 uResolution;
uniform float uPower;
uniform float uBands;
uniform float uNoise;
uniform float uChroma;
uniform float uThreshold;
uniform float uSeed;
float hash11(float p) { return fract(sin(p * 127.1 + uSeed * 311.7) * 43758.5453123); }
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 73.13) * 43758.5453123);
}
vec2 inputUv(vec2 localUv) {
  vec2 frameScale = uInputClamp.xy + uInputClamp.zw;
  return clamp(localUv * frameScale, uInputClamp.xy, uInputClamp.zw);
}
vec4 sampleAt(vec2 uv) { return texture(uTexture, inputUv(uv)); }
vec3 straight(vec4 c) { return c.a > 0.00001 ? c.rgb / c.a : vec3(0.0); }
void main(void) {
  vec2 uv = vLocalCoord;
  vec4 source = texture(uTexture, vTextureCoord);
  float band = floor(uv.y * (18.0 + uBands * 70.0));
  float gate = step(uThreshold, hash11(band + floor(uTime * 18.0)));
  float dx = (hash11(band + uTime) - 0.5) * uBands * 0.07 * gate * uPower;
  vec2 shiftedUv = clamp(uv + vec2(dx, 0.0), 0.0, 1.0);
  vec3 shifted = straight(sampleAt(shiftedUv));
  float noiseValue = hash21(floor(uv * uResolution * 0.7) + floor(uTime * 31.0));
  shifted = mix(shifted, vec3(noiseValue), uNoise * gate * uPower);
  float mosaic = mix(96.0, 28.0, uNoise * gate);
  shifted = mix(shifted, straight(sampleAt(floor(shiftedUv * mosaic) / mosaic)), gate * uNoise * 0.42);
  float levels = mix(20.0, 5.0, uNoise * gate);
  shifted = floor(shifted * levels + 0.5) / levels;
  shifted.r = straight(sampleAt(shiftedUv + vec2(uChroma * 0.012, 0.0))).r;
  shifted.b = straight(sampleAt(shiftedUv - vec2(uChroma * 0.009, 0.0))).b;
  vec3 sourceStraight = straight(source);
  finalColor = vec4(mix(sourceStraight, shifted, uPower) * source.a, source.a);
}`;
const FRAGMENT = SIGNAL_MASK_FRAGMENT_SOURCE;
