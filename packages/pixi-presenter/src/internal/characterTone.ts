import { Filter, GlProgram } from "pixi.js";
import type { CharacterTonePresetId } from "@v-ronpa/contracts";

export interface CharacterToneLiveState extends Record<string, number> {
  shadowL: number;
  shadowA: number;
  shadowB: number;
  midtoneL: number;
  midtoneA: number;
  midtoneB: number;
  highlightL: number;
  highlightA: number;
  highlightB: number;
  amount: number;
}

interface CharacterToneUniformValues {
  uToneShadow: Float32Array;
  uToneMidtone: Float32Array;
  uToneHighlight: Float32Array;
  uToneAmount: number;
}

export interface CharacterToneFilter {
  filter: Filter;
  uniforms: CharacterToneUniformValues;
}

const CHARACTER_TONE_RECIPES = {
  rain: ["#4D627A", "#82ABC6", "#CADFE8"],
  fog: ["#6D777A", "#9CA8A5", "#D9D8D0"],
  sunset: ["#6A536F", "#D78E66", "#F2C58B"],
  night: ["#354564", "#667DA8", "#B5C2DB"],
  alert: ["#4A121B", "#C63E48", "#FFB196"],
  fluorescent: ["#716C45", "#C6C58B", "#E4E6A8"]
} as const satisfies Record<CharacterTonePresetId, readonly [string, string, string]>;

const FILTER_VERTEX = `
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

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const TONE_FRAGMENT = `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uToneShadow;
uniform vec3 uToneMidtone;
uniform vec3 uToneHighlight;
uniform float uToneAmount;

vec3 srgbToLinear(vec3 color) {
  vec3 low = color / 12.92;
  vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), color));
}

vec3 linearToSrgb(vec3 color) {
  vec3 safe = max(color, vec3(0.0));
  vec3 low = safe * 12.92;
  vec3 high = 1.055 * pow(safe, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), safe));
}

vec3 linearRgbToOklab(vec3 color) {
  float l = 0.4122214708 * color.r + 0.5363325363 * color.g + 0.0514459929 * color.b;
  float m = 0.2119034982 * color.r + 0.6806995451 * color.g + 0.1073969566 * color.b;
  float s = 0.0883024619 * color.r + 0.2817188376 * color.g + 0.6299787005 * color.b;
  vec3 root = pow(max(vec3(l, m, s), vec3(0.0)), vec3(1.0 / 3.0));
  return vec3(
    0.2104542553 * root.x + 0.7936177850 * root.y - 0.0040720468 * root.z,
    1.9779984951 * root.x - 2.4285922050 * root.y + 0.4505937099 * root.z,
    0.0259040371 * root.x + 0.7827717662 * root.y - 0.8086757660 * root.z
  );
}

vec3 oklabToLinearRgb(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

bool inSrgbGamut(vec3 color) {
  return all(greaterThanEqual(color, vec3(0.0))) && all(lessThanEqual(color, vec3(1.0)));
}

vec3 gamutMapOklab(vec3 lab) {
  vec3 direct = oklabToLinearRgb(lab);
  if (inSrgbGamut(direct)) return direct;
  float safeL = clamp(lab.x, 0.0, 1.0);
  float low = 0.0;
  float high = 1.0;
  vec3 mapped = oklabToLinearRgb(vec3(safeL, 0.0, 0.0));
  for (int index = 0; index < 5; index++) {
    float scale = (low + high) * 0.5;
    vec3 candidate = oklabToLinearRgb(vec3(safeL, lab.yz * scale));
    if (inSrgbGamut(candidate)) {
      low = scale;
      mapped = candidate;
    } else {
      high = scale;
    }
  }
  return clamp(mapped, 0.0, 1.0);
}

vec3 bandTarget(vec3 baseLab, vec3 toneLab, float chromaStrength, float lightnessStrength) {
  return vec3(
    mix(baseLab.x, toneLab.x, lightnessStrength),
    mix(baseLab.yz * 0.96, toneLab.yz, chromaStrength)
  );
}

void main(void) {
  vec4 source = texture(uTexture, vTextureCoord);
  if (source.a <= 0.000001 || uToneAmount <= 0.000001) {
    finalColor = source;
    return;
  }

  vec3 straightSrgb = clamp(source.rgb / source.a, 0.0, 1.0);
  vec3 baseLab = linearRgbToOklab(srgbToLinear(straightSrgb));
  float shadowWeight = 1.0 - smoothstep(0.30, 0.56, baseLab.x);
  float highlightWeight = smoothstep(0.60, 0.88, baseLab.x);
  float midtoneWeight = max(0.0, 1.0 - shadowWeight - highlightWeight);
  float totalWeight = max(0.000001, shadowWeight + midtoneWeight + highlightWeight);

  vec3 shadowResult = bandTarget(baseLab, uToneShadow, 0.38, 0.08);
  vec3 midtoneResult = bandTarget(baseLab, uToneMidtone, 0.26, 0.05);
  vec3 highlightResult = bandTarget(baseLab, uToneHighlight, 0.10, 0.02);
  vec3 tonedLab = (
    shadowResult * shadowWeight +
    midtoneResult * midtoneWeight +
    highlightResult * highlightWeight
  ) / totalWeight;
  float gain = uToneAmount * 0.5;
  vec3 outputLab = baseLab + (tonedLab - baseLab) * gain;
  vec3 outputSrgb = clamp(linearToSrgb(gamutMapOklab(outputLab)), 0.0, 1.0);
  finalColor = vec4(outputSrgb * source.a, source.a);
}
`;

let characterToneGlProgram: GlProgram | undefined;

export function characterToneTarget(
  preset: CharacterTonePresetId,
  amount: number
): CharacterToneLiveState {
  const [shadow, midtone, highlight] = CHARACTER_TONE_RECIPES[preset].map(hexToOklab);
  return {
    shadowL: shadow![0],
    shadowA: shadow![1],
    shadowB: shadow![2],
    midtoneL: midtone![0],
    midtoneA: midtone![1],
    midtoneB: midtone![2],
    highlightL: highlight![0],
    highlightA: highlight![1],
    highlightB: highlight![2],
    amount
  };
}

export function createCharacterToneFilter(state: CharacterToneLiveState): CharacterToneFilter {
  const filter = new Filter({
    glProgram: characterToneGlProgram ??= GlProgram.from({
      vertex: FILTER_VERTEX,
      fragment: TONE_FRAGMENT,
      name: "v-ronpa-oklab-character-tone"
    }),
    resources: {
      characterToneUniforms: {
        uToneShadow: { value: new Float32Array(3), type: "vec3<f32>" },
        uToneMidtone: { value: new Float32Array(3), type: "vec3<f32>" },
        uToneHighlight: { value: new Float32Array(3), type: "vec3<f32>" },
        uToneAmount: { value: 0, type: "f32" }
      }
    },
    resolution: "inherit",
    antialias: "inherit",
    padding: 0
  });
  const result = {
    filter,
    uniforms: filter.resources.characterToneUniforms.uniforms as CharacterToneUniformValues
  };
  syncCharacterToneFilter(result, state);
  return result;
}

export function syncCharacterToneFilter(
  tone: CharacterToneFilter,
  state: CharacterToneLiveState
): void {
  tone.uniforms.uToneShadow.set([state.shadowL, state.shadowA, state.shadowB]);
  tone.uniforms.uToneMidtone.set([state.midtoneL, state.midtoneA, state.midtoneB]);
  tone.uniforms.uToneHighlight.set([state.highlightL, state.highlightA, state.highlightB]);
  tone.uniforms.uToneAmount = Math.min(1_000_000, Math.max(0, state.amount));
}

export function copyCharacterToneState(
  state: CharacterToneLiveState
): CharacterToneLiveState {
  return { ...state };
}

function hexToOklab(hex: string): [number, number, number] {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return linearRgbToOklab(srgbToLinear(red), srgbToLinear(green), srgbToLinear(blue));
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearRgbToOklab(red: number, green: number, blue: number): [number, number, number] {
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(Math.max(0, l));
  const mRoot = Math.cbrt(Math.max(0, m));
  const sRoot = Math.cbrt(Math.max(0, s));
  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  ];
}
