import type { PixiWeatherSnapshot } from "@v-ronpa/contracts";
import { Filter, GlProgram, Graphics, Rectangle, type Container, type Ticker } from "pixi.js";
import type { NumericLiveState } from "../animation";
import type { WeatherEffectRenderer } from "./types";

interface SnowUniforms {
  uTime: number;
  uResolution: Float32Array;
  uPower: number;
  uDensity: number;
  uFallSpeed: number;
  uWind: number;
  uFlakeScale: number;
  uSway: number;
  uFog: number;
  uNoise: number;
  uSeed: number;
}

interface SnowFilter {
  resources: { snowUniforms: { uniforms: SnowUniforms } };
  destroy(destroyPrograms?: boolean): void;
}

export class SnowWeatherRenderer implements WeatherEffectRenderer {
  private readonly surface: Graphics;
  private readonly filter: SnowFilter;
  private readonly uniforms: SnowUniforms;

  constructor(container: Container, width: number, height: number) {
    this.surface = new Graphics().rect(0, 0, width, height).fill({ color: 0xffffff, alpha: 1 });
    this.surface.label = "weather:snow:shader-surface";
    const shader = createFilter(width, height);
    this.filter = shader.filter;
    this.uniforms = shader.uniforms;
    this.surface.filters = [this.filter as unknown as Filter];
    this.surface.filterArea = new Rectangle(0, 0, width, height);
    container.addChild(this.surface);
  }

  apply(snapshot: PixiWeatherSnapshot, live: NumericLiveState): void {
    if (snapshot.kind !== "snow") return;
    this.uniforms.uPower = clamp01(live.power ?? snapshot.power);
    this.uniforms.uDensity = live.density ?? snapshot.density ?? 1;
    this.uniforms.uFallSpeed = live.ySpeed ?? snapshot.ySpeed ?? 0.45;
    this.uniforms.uWind = live.xSpeed ?? snapshot.xSpeed ?? 0.25;
    this.uniforms.uFlakeScale = live.flakeScale ?? snapshot.flakeScale ?? snapshot.scale?.[0] ?? 1;
    this.uniforms.uSway = live.sway ?? snapshot.sway ?? 1;
    this.uniforms.uFog = live.fog ?? snapshot.fog ?? 0.25;
    this.uniforms.uNoise = live.noise ?? snapshot.noise ?? 0.01;
    this.uniforms.uSeed = snapshot.seed ?? 0;
  }

  tick(ticker: Ticker): void {
    this.uniforms.uTime += Math.max(0, ticker.deltaMS) / 1000;
  }

  resize(width: number, height: number): void {
    if (this.uniforms.uResolution[0] === width && this.uniforms.uResolution[1] === height) return;
    this.uniforms.uResolution[0] = width;
    this.uniforms.uResolution[1] = height;
    this.surface.clear().rect(0, 0, width, height).fill({ color: 0xffffff, alpha: 1 });
    this.surface.filterArea = new Rectangle(0, 0, width, height);
  }

  destroy(): void {
    this.filter.destroy();
  }
}

function createFilter(width: number, height: number): { filter: SnowFilter; uniforms: SnowUniforms } {
  const uniforms: SnowUniforms = {
    uTime: 0,
    uResolution: new Float32Array([width, height]),
    uPower: 1,
    uDensity: 1,
    uFallSpeed: 0.45,
    uWind: 0.25,
    uFlakeScale: 1,
    uSway: 1,
    uFog: 0.25,
    uNoise: 0.01,
    uSeed: 0
  };
  if (typeof document === "undefined") {
    return { filter: { resources: { snowUniforms: { uniforms } }, destroy: () => undefined }, uniforms };
  }
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: "v-ronpa-snow-shader" }),
    resources: { snowUniforms: {
      uTime: { value: uniforms.uTime, type: "f32" },
      uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
      uPower: { value: uniforms.uPower, type: "f32" },
      uDensity: { value: uniforms.uDensity, type: "f32" },
      uFallSpeed: { value: uniforms.uFallSpeed, type: "f32" },
      uWind: { value: uniforms.uWind, type: "f32" },
      uFlakeScale: { value: uniforms.uFlakeScale, type: "f32" },
      uSway: { value: uniforms.uSway, type: "f32" },
      uFog: { value: uniforms.uFog, type: "f32" },
      uNoise: { value: uniforms.uNoise, type: "f32" },
      uSeed: { value: uniforms.uSeed, type: "f32" }
    } }
  });
  return {
    filter: filter as unknown as SnowFilter,
    uniforms: filter.resources.snowUniforms.uniforms as SnowUniforms
  };
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) { gl_Position = filterVertexPosition(); vTextureCoord = filterTextureCoord(); }
`;

const FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
uniform float uPower;
uniform float uDensity;
uniform float uFallSpeed;
uniform float uWind;
uniform float uFlakeScale;
uniform float uSway;
uniform float uFog;
uniform float uNoise;
uniform float uSeed;
float snowHash(vec2 value, vec2 basis, float offset) {
  return fract(sin(dot(value, basis) + offset + uSeed * 19.19) * 43758.5453);
}
void main(void) {
  vec2 fragCoord = vTextureCoord * uResolution;
  float axis = max(1.0, uResolution.x);
  float power = clamp(uPower, 0.0, 1.0);
  float density = max(0.0, uDensity);
  float flakeScale = max(0.05, uFlakeScale);
  float fallSpeed = max(0.0, uFallSpeed);
  float sway = max(0.0, uSway);
  float snow = 0.0;
  float random = snowHash(fragCoord, vec2(12.9898, 78.233), 0.0);
  for (int k = 0; k < 6; k++) {
    for (int i = 1; i <= 12; i++) {
      float fk = float(k);
      float fi = float(i);
      float cellSize = (2.0 + fi * 3.0) / flakeScale;
      float layerSpeed = fallSpeed * (0.54 + fi * 0.072) + (sin(uTime * 0.4 + fk + fi * 20.0) + 1.0) * 0.00012;
      vec2 uv = fragCoord / axis + vec2(
        0.01 * sin((uTime + fk * 6185.0) * 0.6 + fi) * (5.0 / fi) * sway + uWind * uTime * 0.015 / fi,
        -layerSpeed * (uTime + fk * 1352.0) * (1.0 / fi)
      );
      vec2 uvStep = ceil(uv * cellSize - vec2(0.5)) / cellSize;
      float x = snowHash(uvStep, vec2(12.9898 + fk * 12.0, 78.233 + fk * 315.156), fk * 12.0) - 0.5;
      float y = snowHash(uvStep, vec2(62.2364 + fk * 23.0, 94.674 + fk * 95.0), fk * 12.0) - 0.5;
      float randomMagnitude1 = sin(uTime * 2.5) * 0.7 / cellSize;
      float randomMagnitude2 = cos(uTime * 2.5) * 0.7 / cellSize;
      vec2 flakeCenter = uvStep + vec2(x * sin(y), y) * randomMagnitude1 + vec2(y, x) * randomMagnitude2;
      float d = 5.0 * distance(flakeCenter, uv);
      float omit = snowHash(uvStep, vec2(32.4691, 94.615), fk * 5.0);
      float threshold = clamp(0.06 * density * mix(0.5, 1.05, power), 0.0, 0.28);
      if (omit < threshold) {
        float sharpness = 15.0 + x * 6.3;
        float shaped = clamp(1.9 - d * sharpness * (cellSize / 1.4), 0.0, 1.0);
        snow += (x + 1.0) * 0.4 * shaped;
      }
    }
  }
  float flurry = clamp(snow * (0.42 + density * 0.16) * (0.32 + power * 0.68), 0.0, 1.0);
  float fogGradient = smoothstep(0.0, 1.0, 1.0 - vTextureCoord.y);
  float fogAlpha = clamp(uFog, 0.0, 1.0) * power * (0.045 + fogGradient * 0.13);
  float noiseAlpha = random * max(0.0, uNoise) * power * 0.25;
  float alpha = clamp(flurry * 0.58 * power + fogAlpha + noiseAlpha, 0.0, 0.68);
  vec3 fogColor = vec3(0.62, 0.82, 1.0);
  vec3 snowColor = vec3(0.94, 0.98, 1.0);
  vec3 color = mix(fogColor, snowColor, flurry);
  finalColor = vec4(color * alpha, alpha);
}
`;
