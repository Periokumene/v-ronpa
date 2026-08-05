import { Filter, GlProgram } from "pixi.js";
import type { NumericLiveState } from "./animation";

export interface GlitchShaderFilter {
  resources: { glitchUniforms: { uniforms: GlitchShaderUniformValues } };
  destroy(destroyPrograms?: boolean): void;
}

export interface GlitchShaderUniformValues {
  uTime: number;
  uProgress: number;
  uResolution: Float32Array;
  uPower: number;
  uBlockJump: number;
  uBurstJump: number;
  uPixelScatter: number;
  uColorNoise: number;
  uSpeed: number;
  uSeed: number;
}

export interface GlitchShaderControls {
  power?: number | undefined;
  blockJump?: number | undefined;
  burstJump?: number | undefined;
  pixelScatter?: number | undefined;
  colorNoise?: number | undefined;
  speed?: number | undefined;
  seed?: number | undefined;
}

export interface GlitchShaderRecord {
  filter: GlitchShaderFilter;
  uniforms: GlitchShaderUniformValues;
}

export function setGlitchResolution(uniforms: GlitchShaderUniformValues, width: number, height: number): void {
  uniforms.uResolution[0] = width;
  uniforms.uResolution[1] = height;
}

export function createGlitchShaderFilter(width: number, height: number): GlitchShaderRecord {
  const uniforms: GlitchShaderUniformValues = {
    uTime: 0,
    uProgress: 0,
    uResolution: new Float32Array([width, height]),
    uPower: 1,
    uBlockJump: 1,
    uBurstJump: 1,
    uPixelScatter: 1,
    uColorNoise: 1,
    uSpeed: 1,
    uSeed: 0
  };
  if (typeof document === "undefined") {
    return { filter: { resources: { glitchUniforms: { uniforms } }, destroy: () => undefined }, uniforms };
  }
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: "v-ronpa-morton-glitch-shader" }),
    resources: { glitchUniforms: {
      uTime: { value: uniforms.uTime, type: "f32" },
      uProgress: { value: uniforms.uProgress, type: "f32" },
      uResolution: { value: uniforms.uResolution, type: "vec2<f32>" },
      uPower: { value: uniforms.uPower, type: "f32" },
      uBlockJump: { value: uniforms.uBlockJump, type: "f32" },
      uBurstJump: { value: uniforms.uBurstJump, type: "f32" },
      uPixelScatter: { value: uniforms.uPixelScatter, type: "f32" },
      uColorNoise: { value: uniforms.uColorNoise, type: "f32" },
      uSpeed: { value: uniforms.uSpeed, type: "f32" },
      uSeed: { value: uniforms.uSeed, type: "f32" }
    } }
  });
  return {
    filter: filter as unknown as GlitchShaderFilter,
    uniforms: filter.resources.glitchUniforms.uniforms as GlitchShaderUniformValues
  };
}

export function applyGlitchUniforms(
  uniforms: GlitchShaderUniformValues,
  controls: GlitchShaderControls,
  options: { power?: number; progress?: number } = {}
): void {
  uniforms.uPower = clamp01(options.power ?? controls.power ?? 1);
  uniforms.uBlockJump = Math.max(0, controls.blockJump ?? 1);
  uniforms.uBurstJump = Math.max(0, controls.burstJump ?? 1);
  uniforms.uPixelScatter = Math.max(0, controls.pixelScatter ?? 1);
  uniforms.uColorNoise = Math.max(0, controls.colorNoise ?? 1);
  uniforms.uSpeed = Math.max(0, controls.speed ?? 1);
  uniforms.uSeed = controls.seed ?? 0;
  if (options.progress !== undefined) uniforms.uProgress = options.progress;
}

export function glitchLiveParams(controls: GlitchShaderControls): NumericLiveState {
  return {
    power: clamp01(controls.power ?? 1),
    blockJump: Math.max(0, controls.blockJump ?? 1),
    burstJump: Math.max(0, controls.burstJump ?? 1),
    pixelScatter: Math.max(0, controls.pixelScatter ?? 1),
    colorNoise: Math.max(0, controls.colorNoise ?? 1),
    speed: Math.max(0, controls.speed ?? 1)
  };
}

export function applyGlitchLiveUniforms(uniforms: GlitchShaderUniformValues, live: NumericLiveState): void {
  uniforms.uPower = clamp01(live.power ?? 1);
  uniforms.uBlockJump = Math.max(0, live.blockJump ?? 1);
  uniforms.uBurstJump = Math.max(0, live.burstJump ?? 1);
  uniforms.uPixelScatter = Math.max(0, live.pixelScatter ?? 1);
  uniforms.uColorNoise = Math.max(0, live.colorNoise ?? 1);
  uniforms.uSpeed = Math.max(0, live.speed ?? 1);
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
#version 300 es
precision highp float;
precision highp int;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uProgress;
uniform vec2 uResolution;
uniform float uPower;
uniform float uBlockJump;
uniform float uBurstJump;
uniform float uPixelScatter;
uniform float uColorNoise;
uniform float uSpeed;
uniform float uSeed;
uint SpreadBits(uint x) {
  x &= 0x0000ffffu; x = (x ^ (x << 8u)) & 0x00ff00ffu; x = (x ^ (x << 4u)) & 0x0f0f0f0fu;
  x = (x ^ (x << 2u)) & 0x33333333u; x = (x ^ (x << 1u)) & 0x55555555u; return x;
}
uint GatherBits(uint x) {
  x &= 0x55555555u; x = (x ^ (x >> 1u)) & 0x33333333u; x = (x ^ (x >> 2u)) & 0x0f0f0f0fu;
  x = (x ^ (x >> 4u)) & 0x00ff00ffu; x = (x ^ (x >> 8u)) & 0x0000ffffu; return x;
}
uvec2 MortonToVec2(uint morton) { return uvec2(GatherBits(morton), GatherBits(morton >> 1u)); }
uint Vec2ToMorton(uvec2 vec) { return SpreadBits(vec.x) | (SpreadBits(vec.y) << 1u); }
float hash11(float u, float seed) { return fract(sin(u + uSeed * 131.17) * 999999.9999 + seed * 1.61803398875 + uSeed * 0.03125); }
vec3 hash31(float p) {
  vec3 p3 = fract(vec3(p + uSeed * 4096.0) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float noise(float u, float size, float seed) {
  float zoom = u * size; float index = floor(zoom); float progress = smoothstep(0.0, 1.0, fract(zoom));
  return mix(hash11(index, seed), hash11(index + 1.0, seed), progress);
}
float posterize(float u, float steps) { return floor(u * steps + 0.5) / steps; }
float threshold(float u, float edge) { return u * step(edge, u); }
void main(void) {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 fragCoord = vTextureCoord * resolution;
  float life = 1.0 - smoothstep(0.72, 1.0, clamp(uProgress, 0.0, 1.0));
  float power = clamp(uPower, 0.0, 1.0) * life;
  float time = max(0.0, uTime * max(0.0, uSpeed));
  float rapidBeat = floor(time * 5.0); float blockBeat = floor(time * 1.25); float colorBeat = floor(time * 1.7);
  float temporalPulse = mix(0.72, 1.18, hash11(rapidBeat, uSeed + 23.0));
  vec2 pixel = clamp(floor(fragCoord), vec2(0.0), vec2(65535.0));
  float i = float(Vec2ToMorton(uvec2(pixel)));
  float n1 = posterize(noise(i + blockBeat * 17.0, 1e-3, floor(time * 0.1619) + blockBeat + uSeed), 4.0);
  n1 = threshold(n1, mix(0.96, 0.68, clamp(power * uBlockJump * temporalPulse, 0.0, 1.0)));
  float n2 = posterize(noise(i + rapidBeat * 31.0, 1e-5, floor(time * 3.12349) + rapidBeat + uSeed * 1.7), 20.0);
  n2 = threshold(n2, mix(0.985, 0.88, clamp(power * uBurstJump * temporalPulse, 0.0, 1.0)));
  float n3 = noise(i + rapidBeat * 7.0, 1e3, floor(time * 0.12349) + rapidBeat + uSeed * 2.3);
  n3 = threshold(n3, mix(0.965, 0.88, clamp(power * uPixelScatter * temporalPulse, 0.0, 1.0)));
  float n4 = noise(i + colorBeat * 11.0, 0.01, colorBeat + uSeed * 3.1);
  i += n1 * 40.0 * max(0.0, uBlockJump) * power;
  i += n2 * 1000.0 * max(0.0, uBurstJump) * power;
  i += n3 * 100.0 * max(0.0, uPixelScatter) * power;
  vec2 uv = clamp(vec2(MortonToVec2(uint(max(0.0, i)))) / resolution, vec2(0.0), vec2(1.0));
  vec4 source = texture(uTexture, uv);
  float colorEdge = hash11(floor(time * 2.0), 1.0) * 0.1 + mix(0.97, 0.84, clamp(power * uColorNoise * temporalPulse, 0.0, 1.0));
  float colorMix = step(colorEdge, n4) * clamp(power * uColorNoise, 0.0, 1.0);
  vec3 randomColor = hash31(i) * source.a;
  finalColor = vec4(mix(source.rgb, randomColor, colorMix), source.a);
}
`;
