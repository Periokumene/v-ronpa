import type { PixiRainCommandParams } from "@v-ronpa/contracts";
import {
  DEFAULT_RAIN_COMMAND_PARAMS,
  RAIN_HUE_WRAP,
  RAIN_POWER_MAX,
  RAIN_POWER_MIN,
  RAIN_TINT_MAX,
  RAIN_TINT_MIN,
  RAIN_WIND_MAX,
  RAIN_WIND_MIN
} from "./commandParams";
import { resolveNearTrackPreset, type NearTrackPreset } from "./nearTrackPresets";

export type PresetId = 'calibration' | 'preview';
export type PlaybackMode = 'auto' | 'manual';
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Transform2D = [number, number, number, number, number, number];
export type MidRainBandVisibility = [boolean, boolean, boolean];

export type RainColorState = {
  hue: number;
  tint: number;
};

export type NearStreakState = {
  energyMin: number;
  energyMax: number;
};

export type MidRainBandState = {
  density: number;
  strength: number;
  length: number;
  width: number;
};

export type MidRainBandSettings = [MidRainBandState, MidRainBandState, MidRainBandState];

export type MidRainFieldState = {
  speedPerFrame: number;
  directionSpread: number;
  bands: MidRainBandSettings;
};

export type GlobalRainState = {
  time: {
    continuousTime: number;
    frameDelta: number;
  };
  dynamics: {
    gravityDirection: Vec2;
    meanWind: Vec2;
    gustAmplitude: number;
    gustCoherenceTime: number;
    gustAdvectionVelocity: Vec2;
    spatialWindScale: number;
  };
  dropPopulation: {
    diameterMin: number;
    diameterMax: number;
    diameterFalloff: number;
    visibilityBias: number;
    globalSeed: number;
  };
  camera: {
    currentTransform: Transform2D;
    previousIntegrationTransform: Transform2D;
    focalLengthOrProjectionScale: number;
    focusDepth: number;
    defocusStrength: number;
    internalResolution: Vec2;
  };
  rainColor: RainColorState;
  style: {
    paletteQuantization: number;
    allowedSlopeSet: string;
  };
  nearStreaks: NearStreakState;
  midRain: MidRainFieldState;
};

export type RainBase = {
  startPosition: number;
  speedPerFrame: number;
  length: number;
  width: number;
  strength: number;
};

export type RainTrackSelection = {
  enabled: boolean;
  minActive: number;
  maxActive: number;
  windowSeed: number;
};

export type RainIdentity = {
  identitySeed: number;
  diameter: number;
  sizeRank: number;
  shapeFamily: number;
  brightnessRank: number;
  phase: number;
  laneOffset: number;
  bend: number;
};

export type EffectiveRainTrack = RainBase & {
  guideIndex: number;
  preset: NearTrackPreset;
  identity: RainIdentity;
};

export type RainSettings = {
  preset: PresetId;
  showRain: boolean;
  showMidRain: boolean;
  midRainBands: MidRainBandVisibility;
  overallBrightness: number;
  wind: number;
  previewFps: number;
  playbackMode: PlaybackMode;
  currentFrame: number;
  globalRain: GlobalRainState;
  rainBase: RainBase;
  rainTrackSelection: RainTrackSelection;
};

export const presetLabels: Record<PresetId, string> = {
  calibration: "Track calibration",
  preview: "Config + preview",
};

export const rainTrackCount = 11;
export const internalRainSeed = 0;
const identityTransform: Transform2D = [1, 0, 0, 1, 0, 0];
const defaultRainTrackSelection: RainTrackSelection = {
  enabled: true,
  minActive: 4,
  maxActive: 7,
  windowSeed: 0,
};
const defaultMidRainBands: MidRainBandVisibility = [true, true, true];
const defaultMidRainLength = 0.094;
const previewMidRainLength = 0.133826;
const previewNearRainLength = 0.204615;
const defaultRainColor: RainColorState = {
  hue: DEFAULT_RAIN_COMMAND_PARAMS.hue,
  tint: DEFAULT_RAIN_COMMAND_PARAMS.tint,
};
export const rainTintMax = RAIN_TINT_MAX;
const rainColorLightnessMax = 0.975;
const rainColorLightnessDrop = 0.06;
const rainColorStrongLightnessDrop = 0.055;
const rainColorChromaMax = 0.068;
const rainColorStrongChromaMax = 0.075;
const oklchGamutFitSteps = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function finiteNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeHue(value: unknown, fallback = defaultRainColor.hue) {
  const hue = finiteNumber(value, fallback);
  return ((hue % RAIN_HUE_WRAP) + RAIN_HUE_WRAP) % RAIN_HUE_WRAP;
}

function smoothstep01(value: number) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function srgbFromLinear(value: number) {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function linearSrgbFromOklch(lightness: number, chroma: number, hue: number): Vec3 {
  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime * lPrime * lPrime;
  const m = mPrime * mPrime * mPrime;
  const s = sPrime * sPrime * sPrime;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function isDisplayableLinearSrgb(color: Vec3) {
  return color.every((channel) => channel >= 0 && channel <= 1);
}

function fitOklchToSrgb(lightness: number, chroma: number, hue: number): Vec3 {
  let low = 0;
  let high = chroma;

  for (let index = 0; index < oklchGamutFitSteps; index += 1) {
    const mid = (low + high) * 0.5;
    if (isDisplayableLinearSrgb(linearSrgbFromOklch(lightness, mid, hue))) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return linearSrgbFromOklch(lightness, low, hue).map((channel) =>
    clamp(srgbFromLinear(channel), 0, 1),
  ) as Vec3;
}

export function resolveRainBaseColor(color: RainColorState): Vec3 {
  const hue = normalizeHue(color.hue);
  const tint = clamp(finiteNumber(color.tint, defaultRainColor.tint), RAIN_TINT_MIN, RAIN_TINT_MAX);
  const baseTint = smoothstep01(Math.min(tint, 1));
  const strongTint = smoothstep01(tint - 1);
  const lightness = rainColorLightnessMax - rainColorLightnessDrop * baseTint - rainColorStrongLightnessDrop * strongTint;
  const chroma = rainColorChromaMax * baseTint + rainColorStrongChromaMax * strongTint;

  return fitOklchToSrgb(lightness, chroma, hue);
}

export function rainBaseColorToCss(color: Vec3) {
  const channels = color.map((channel) => Math.round(clamp(channel, 0, 1) * 255));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

export function rainBaseColorToHex(color: Vec3) {
  return `#${color
    .map((channel) => Math.round(clamp(channel, 0, 1) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function mix(min: number, max: number, amount: number) {
  return min + (max - min) * amount;
}

function fract(value: number) {
  return value - Math.floor(value);
}

function hash01(seed: number, guideIndex: number, salt: number) {
  return fract(Math.sin(seed * 97.231 + guideIndex * 37.719 + salt * 13.137) * 43758.5453123);
}

function makeMidRainBands(length: number): MidRainBandSettings {
  return [
    { density: 0.9, strength: 0.72, length, width: 0.72 },
    { density: 0.9, strength: 0.72, length, width: 0.72 },
    { density: 0.9, strength: 0.72, length, width: 0.72 },
  ];
}

function sampleDiameter(globalRain: GlobalRainState, guideIndex: number, seed: number) {
  const min = globalRain.dropPopulation.diameterMin;
  const max = Math.max(globalRain.dropPopulation.diameterMax, min);
  const falloff = Math.max(globalRain.dropPopulation.diameterFalloff, 0.0001);
  const visibilityBias = globalRain.dropPopulation.visibilityBias;
  const raw = hash01(seed, guideIndex, 1.3);
  const visibilityRoll = Math.pow(raw, 1 / Math.max(visibilityBias + 1, 0.0001));
  const truncatedExp =
    min - Math.log(1 - visibilityRoll * (1 - Math.exp(-falloff * (max - min)))) / falloff;

  return clamp(truncatedExp, min, max);
}

function pickShapeFamily(seed: number, guideIndex: number) {
  const offset = Math.floor(hash01(seed, 0, 5.9) * rainTrackCount);
  const slot = (guideIndex + offset) % rainTrackCount;

  if (slot < 4) return 0;
  if (slot === 4) return 1;

  const specialRoll = hash01(seed, guideIndex, 6.8);
  if (specialRoll < 0.72) return 2;
  if (specialRoll < 0.94) return 3;
  return 4;
}

function resolveRainIdentity(settings: RainSettings, guideIndex: number): RainIdentity {
  const globalRain = resolveGlobalRainState(settings);
  const preset = resolveNearTrackPreset(guideIndex);
  const identitySeed = globalRain.dropPopulation.globalSeed * 101 + guideIndex * 17;
  const diameter = sampleDiameter(globalRain, guideIndex, identitySeed);
  const diameterMin = globalRain.dropPopulation.diameterMin;
  const diameterMax = Math.max(globalRain.dropPopulation.diameterMax, diameterMin + 0.0001);
  const sizeRank = clamp((diameter - diameterMin) / (diameterMax - diameterMin), 0, 1);
  const shapeFamily = pickShapeFamily(globalRain.dropPopulation.globalSeed, guideIndex);
  const brightnessRank = clamp(
    mix(0.78, 1.16, hash01(identitySeed, guideIndex, 7.1)) + preset.identity.brightnessBias,
    0.2,
    2,
  );
  const phase = hash01(identitySeed, guideIndex, 9.4) * Math.PI * 2 + preset.identity.phaseOffset;
  const laneOffset = clamp(
    mix(-0.0045, 0.0045, hash01(identitySeed, guideIndex, 11.2)) + preset.identity.laneOffsetBias,
    -0.02,
    0.02,
  );
  const bendRoll = mix(-1, 1, hash01(identitySeed, guideIndex, 13.6));
  const bend = bendRoll * mix(0.003, 0.009, sizeRank) * (shapeFamily === 4 ? 1.8 : 1) * preset.identity.bendScale;

  return {
    identitySeed,
    diameter,
    sizeRank,
    shapeFamily,
    brightnessRank,
    phase,
    laneOffset,
    bend,
  };
}

function clampVec2(value: unknown, fallback: Vec2, min = -Infinity, max = Infinity): Vec2 {
  if (!Array.isArray(value)) return fallback;
  return [
    clamp(Number(value[0] ?? fallback[0]), min, max),
    clamp(Number(value[1] ?? fallback[1]), min, max),
  ];
}

function coerceTransform(value: unknown, fallback: Transform2D): Transform2D {
  if (!Array.isArray(value)) return fallback;
  return [
    Number(value[0] ?? fallback[0]),
    Number(value[1] ?? fallback[1]),
    Number(value[2] ?? fallback[2]),
    Number(value[3] ?? fallback[3]),
    Number(value[4] ?? fallback[4]),
    Number(value[5] ?? fallback[5]),
  ];
}

function makeGlobalRainState({
  rainColor = defaultRainColor,
  meanWind,
  midRainLength = defaultMidRainLength,
  nearStreaks,
}: {
  rainColor?: RainColorState;
  meanWind: Vec2;
  midRainLength?: number;
  nearStreaks?: Partial<NearStreakState>;
}): GlobalRainState {
  const nearStreakState: NearStreakState = {
    energyMin: 0.58,
    energyMax: 1.24,
    ...nearStreaks,
  };

  return {
    time: {
      continuousTime: 0,
      frameDelta: 1 / 24,
    },
    dynamics: {
      gravityDirection: [0, 1],
      meanWind,
      gustAmplitude: 0.04,
      gustCoherenceTime: 1.1,
      gustAdvectionVelocity: [0.08, 0],
      spatialWindScale: 0.55,
    },
    dropPopulation: {
      diameterMin: 0.35,
      diameterMax: 2.2,
      diameterFalloff: 1.45,
      visibilityBias: 0.72,
      globalSeed: internalRainSeed,
    },
    camera: {
      currentTransform: identityTransform,
      previousIntegrationTransform: identityTransform,
      focalLengthOrProjectionScale: 1,
      focusDepth: 0.55,
      defocusStrength: 0.18,
      internalResolution: [1384, 646],
    },
    rainColor,
    style: {
      paletteQuantization: 4,
    allowedSlopeSet: "continuous",
    },
    nearStreaks: nearStreakState,
    midRain: {
      speedPerFrame: 0.086,
      directionSpread: 0.05,
      bands: makeMidRainBands(midRainLength),
    },
  };
}

export const presets: Record<PresetId, RainSettings> = {
  calibration: {
    preset: "calibration",
    showRain: false,
    showMidRain: false,
    midRainBands: [...defaultMidRainBands],
    overallBrightness: 0.98,
    wind: -1,
    previewFps: 24,
    playbackMode: "auto",
    currentFrame: 0,
    globalRain: makeGlobalRainState({
      meanWind: [-1, 1],
    }),
    rainBase: {
      startPosition: 0.35,
      speedPerFrame: 0.072,
      length: 0.055,
      width: 1.55,
      strength: 0.82,
    },
    rainTrackSelection: {
      ...defaultRainTrackSelection,
      enabled: false,
    },
  },
  preview: {
    preset: "preview",
    showRain: true,
    showMidRain: true,
    midRainBands: [...defaultMidRainBands],
    overallBrightness: 0.86,
    wind: -1,
    previewFps: 14,
    playbackMode: "auto",
    currentFrame: 0,
    globalRain: makeGlobalRainState({
      meanWind: [-1, 1],
      midRainLength: previewMidRainLength,
    }),
    rainBase: {
      startPosition: 0.35,
      speedPerFrame: 0.123,
      length: previewNearRainLength,
      width: 0.65,
      strength: 0.82,
    },
    rainTrackSelection: defaultRainTrackSelection,
  },
};

export const defaultSettings = presets.preview;

export const settingsStorageKey = "pixel-rain-lab:v22";

export function resolvePresetId(value: string | null | undefined): PresetId | null {
  if (value === "calibration" || value === "tutorial") return "calibration";
  if (value === "preview" || value === "soft" || value === "storm") return "preview";
  return null;
}

export function applyWorkMode(settings: RainSettings, preset: PresetId): RainSettings {
  if (preset === 'calibration') {
    return {
      ...settings,
      preset,
      showRain: false,
      showMidRain: false,
      rainTrackSelection: {
        ...settings.rainTrackSelection,
        enabled: false,
      },
    };
  }

  return {
    ...settings,
    preset,
    showRain: true,
    showMidRain: true,
    midRainBands: coerceMidRainBands(settings.midRainBands, defaultMidRainBands),
    rainTrackSelection: {
      ...settings.rainTrackSelection,
      enabled: true,
    },
  };
}

export function resolveRainTrack(settings: RainSettings, guideIndex: number): EffectiveRainTrack {
  const length = settings.rainBase.length;
  const preset = resolveNearTrackPreset(guideIndex);

  return {
    guideIndex,
    startPosition: clamp(settings.rainBase.startPosition + preset.motion.startOffset, -length, 1),
    speedPerFrame: settings.rainBase.speedPerFrame,
    length,
    width: clamp(settings.rainBase.width * preset.style.widthScale, 0.1, 8),
    strength: clamp(settings.rainBase.strength * preset.style.strengthScale, 0, 1),
    preset,
    identity: resolveRainIdentity(settings, guideIndex),
  };
}

type RainBaseInput = Partial<RainBase>;

type MidRainBandInput = Partial<MidRainBandState>;

type MidRainFieldInput = Partial<Omit<MidRainFieldState, "bands">> &
  MidRainBandInput & {
    bands?: unknown;
  };

type GlobalRainInput = Partial<Omit<GlobalRainState, "midRain">> & {
  midRain?: MidRainFieldInput;
};

type RainSettingsInput = Omit<Partial<RainSettings>, "globalRain" | "rainBase" | "rainTrackSelection" | "preset"> & {
  preset?: string;
  globalRain?: GlobalRainInput;
  rainBase?: RainBaseInput;
  rainTrackSelection?: Partial<RainTrackSelection>;
};

function coerceGlobalRainState(input: GlobalRainInput | undefined, base: GlobalRainState): GlobalRainState {
  const nearStreaks: NearStreakState = {
    energyMin: clamp(Number(input?.nearStreaks?.energyMin ?? base.nearStreaks.energyMin), 0.05, 2),
    energyMax: clamp(Number(input?.nearStreaks?.energyMax ?? base.nearStreaks.energyMax), 0.05, 4),
  };
  const midRainInput = input?.midRain;

  return {
    time: {
      continuousTime: Math.max(0, Number(input?.time?.continuousTime ?? base.time.continuousTime)),
      frameDelta: clamp(Number(input?.time?.frameDelta ?? base.time.frameDelta), 1 / 240, 1),
    },
    dynamics: {
      gravityDirection: clampVec2(input?.dynamics?.gravityDirection, base.dynamics.gravityDirection, -1, 1),
      meanWind: clampVec2(input?.dynamics?.meanWind, base.dynamics.meanWind, -2, 2),
      gustAmplitude: clamp(Number(input?.dynamics?.gustAmplitude ?? base.dynamics.gustAmplitude), 0, 2),
      gustCoherenceTime: clamp(Number(input?.dynamics?.gustCoherenceTime ?? base.dynamics.gustCoherenceTime), 0.05, 20),
      gustAdvectionVelocity: clampVec2(input?.dynamics?.gustAdvectionVelocity, base.dynamics.gustAdvectionVelocity, -5, 5),
      spatialWindScale: clamp(Number(input?.dynamics?.spatialWindScale ?? base.dynamics.spatialWindScale), 0.01, 10),
    },
    dropPopulation: {
      diameterMin: clamp(Number(input?.dropPopulation?.diameterMin ?? base.dropPopulation.diameterMin), 0.01, 10),
      diameterMax: clamp(Number(input?.dropPopulation?.diameterMax ?? base.dropPopulation.diameterMax), 0.01, 12),
      diameterFalloff: clamp(Number(input?.dropPopulation?.diameterFalloff ?? base.dropPopulation.diameterFalloff), 0.01, 12),
      visibilityBias: clamp(Number(input?.dropPopulation?.visibilityBias ?? base.dropPopulation.visibilityBias), 0, 4),
      globalSeed: internalRainSeed,
    },
    camera: {
      currentTransform: coerceTransform(input?.camera?.currentTransform, base.camera.currentTransform),
      previousIntegrationTransform: coerceTransform(
        input?.camera?.previousIntegrationTransform,
        base.camera.previousIntegrationTransform,
      ),
      focalLengthOrProjectionScale: clamp(
        Number(input?.camera?.focalLengthOrProjectionScale ?? base.camera.focalLengthOrProjectionScale),
        0.01,
        100,
      ),
      focusDepth: clamp(Number(input?.camera?.focusDepth ?? base.camera.focusDepth), 0.001, 100),
      defocusStrength: clamp(Number(input?.camera?.defocusStrength ?? base.camera.defocusStrength), 0, 10),
      internalResolution: clampVec2(input?.camera?.internalResolution, base.camera.internalResolution, 1, 8192),
    },
    rainColor: coerceRainColor(input?.rainColor, base.rainColor),
    style: {
      paletteQuantization: clamp(Math.round(Number(input?.style?.paletteQuantization ?? base.style.paletteQuantization)), 0, 16),
      allowedSlopeSet: String(input?.style?.allowedSlopeSet ?? base.style.allowedSlopeSet),
    },
    nearStreaks,
    midRain: {
      speedPerFrame: clamp(Number(midRainInput?.speedPerFrame ?? base.midRain.speedPerFrame), 0, 0.64),
      directionSpread: clamp(Number(midRainInput?.directionSpread ?? base.midRain.directionSpread), 0, 0.2),
      bands: coerceMidRainBandSettings(midRainInput, base.midRain.bands),
    },
  };
}

function coerceRainColor(value: unknown, base: RainColorState): RainColorState {
  const input = value && typeof value === 'object' ? (value as Partial<RainColorState>) : {};

  return {
    hue: normalizeHue(input.hue, base.hue),
    tint: clamp(finiteNumber(input.tint, base.tint), RAIN_TINT_MIN, RAIN_TINT_MAX),
  };
}

function coerceMidRainBand(input: unknown, base: MidRainBandState, legacy: MidRainBandInput): MidRainBandState {
  const bandInput = input && typeof input === 'object' ? (input as MidRainBandInput) : {};

  return {
    density: clamp(Number(bandInput.density ?? legacy.density ?? base.density), 0, 3),
    strength: clamp(Number(bandInput.strength ?? legacy.strength ?? base.strength), 0, 1.5),
    length: clamp(Number(bandInput.length ?? legacy.length ?? base.length), 0.001, 0.95),
    width: clamp(Number(bandInput.width ?? legacy.width ?? base.width), 0.1, 8),
  };
}

function coerceMidRainBandSettings(
  input: MidRainFieldInput | undefined,
  base: MidRainBandSettings,
): MidRainBandSettings {
  const bands = Array.isArray(input?.bands) ? input.bands : [];
  const legacy: MidRainBandInput = {};
  if (input?.density !== undefined) legacy.density = input.density;
  if (input?.strength !== undefined) legacy.strength = input.strength;
  if (input?.length !== undefined) legacy.length = input.length;
  if (input?.width !== undefined) legacy.width = input.width;

  return [
    coerceMidRainBand(bands[0], base[0], legacy),
    coerceMidRainBand(bands[1], base[1], legacy),
    coerceMidRainBand(bands[2], base[2], legacy),
  ];
}

function coerceRainBase(input: RainBaseInput | undefined, base: RainBase): RainBase {
  const length = clamp(Number(input?.length ?? base.length), 0.001, 0.95);
  return {
    startPosition: clamp(Number(input?.startPosition ?? base.startPosition), -length, 1),
    speedPerFrame: clamp(Number(input?.speedPerFrame ?? base.speedPerFrame), 0, 0.32),
    length,
    width: clamp(Number(input?.width ?? base.width), 0.1, 8),
    strength: clamp(Number(input?.strength ?? base.strength), 0, 1),
  };
}

function coerceRainTrackSelection(
  value: Partial<RainTrackSelection> | undefined,
  base: RainTrackSelection,
): RainTrackSelection {
  const rawMinActive = clamp(Math.round(Number(value?.minActive ?? base.minActive)), 0, rainTrackCount);
  const rawMaxActive = clamp(Math.round(Number(value?.maxActive ?? base.maxActive)), 0, rainTrackCount);
  const minActive = Math.min(rawMinActive, rawMaxActive);
  const maxActive = Math.max(rawMinActive, rawMaxActive);

  return {
    enabled: Boolean(value?.enabled ?? base.enabled),
    minActive,
    maxActive,
    windowSeed: Math.max(0, Math.round(Number(value?.windowSeed ?? base.windowSeed))),
  };
}

function coerceMidRainBands(value: unknown, base: MidRainBandVisibility): MidRainBandVisibility {
  if (!Array.isArray(value)) return [...base];

  return [
    Boolean(value[0] ?? base[0]),
    Boolean(value[1] ?? base[1]),
    Boolean(value[2] ?? base[2]),
  ];
}

export function coerceSettings(value: unknown): RainSettings {
  if (!value || typeof value !== 'object') {
    return defaultSettings;
  }

  const input = value as RainSettingsInput;
  const preset = resolvePresetId(input.preset) ?? defaultSettings.preset;
  const base = presets[preset];
  const rainBase = coerceRainBase(input.rainBase, base.rainBase);
  const globalRain = coerceGlobalRainState(input.globalRain, base.globalRain);
  const rainTrackSelection = coerceRainTrackSelection(input.rainTrackSelection, base.rainTrackSelection);

  return {
    preset,
    showRain: Boolean(input.showRain ?? base.showRain),
    showMidRain: Boolean(input.showMidRain ?? base.showMidRain),
    midRainBands: coerceMidRainBands(input.midRainBands, base.midRainBands),
    overallBrightness: clamp(Number(input.overallBrightness ?? base.overallBrightness), 0, 4),
    wind: clamp(Number(input.wind ?? base.wind), RAIN_WIND_MIN, RAIN_WIND_MAX),
    previewFps: clamp(Math.round(Number(input.previewFps ?? base.previewFps)), 1, 60),
    playbackMode: input.playbackMode === "manual" ? "manual" : "auto",
    currentFrame: Math.max(0, Math.round(Number(input.currentFrame ?? base.currentFrame))),
    globalRain,
    rainBase,
    rainTrackSelection,
  };
}

export function resolveGlobalRainState(settings: RainSettings, internalResolution?: Vec2): GlobalRainState {
  const frameDelta = 1 / Math.max(1, settings.previewFps);
  const meanWindY = settings.globalRain.dynamics.meanWind[1] || 1;

  return {
    ...settings.globalRain,
    time: {
      ...settings.globalRain.time,
      frameDelta,
    },
    dynamics: {
      ...settings.globalRain.dynamics,
      meanWind: [settings.wind, meanWindY],
    },
    dropPopulation: {
      ...settings.globalRain.dropPopulation,
      diameterMax: Math.max(settings.globalRain.dropPopulation.diameterMax, settings.globalRain.dropPopulation.diameterMin),
      globalSeed: internalRainSeed,
    },
    camera: {
      ...settings.globalRain.camera,
      internalResolution: internalResolution ?? settings.globalRain.camera.internalResolution,
    },
    style: {
      ...settings.globalRain.style,
    },
    nearStreaks: {
      ...settings.globalRain.nearStreaks,
      energyMax: Math.max(settings.globalRain.nearStreaks.energyMax, settings.globalRain.nearStreaks.energyMin),
    },
    midRain: {
      ...settings.globalRain.midRain,
    },
  };
}

export function coerceRainSettings(value: unknown): RainSettings {
  return coerceSettings(value);
}

const weakRainPowerPresetInput = {
  previewFps: 14,
  playbackMode: "auto",
  overallBrightness: 0.86,
  wind: -1,
  globalRain: {
    rainColor: {
      hue: 215,
      tint: 0.55,
    },
    nearStreaks: {
      energyMin: 0.09,
      energyMax: 2,
    },
    midRain: {
      speedPerFrame: 0.294,
      directionSpread: 0.028,
      bands: [
        { density: 0.83, strength: 0.66, length: 0.146, width: 1.05 },
        { density: 0.87, strength: 0.77, length: 0.205, width: 0.65 },
        { density: 0.67, strength: 1.2, length: 0.222, width: 2.15 },
      ],
    },
  },
  rainBase: {
    speedPerFrame: 0.119,
    length: 0.256,
    width: 1.25,
    strength: 0.54,
  },
  rainTrackSelection: {
    enabled: true,
    minActive: 3,
    maxActive: 6,
  },
} satisfies RainSettingsInput;

const mediumRainPowerPresetInput = {
  previewFps: 14,
  playbackMode: "auto",
  overallBrightness: 0.86,
  wind: -1,
  globalRain: {
    rainColor: {
      hue: 215,
      tint: 0.55,
    },
    nearStreaks: {
      energyMin: 0.09,
      energyMax: 2,
    },
    midRain: {
      speedPerFrame: 0.334,
      directionSpread: 0.028,
      bands: [
        { density: 1.02, strength: 0.76, length: 0.146, width: 1.05 },
        { density: 0.68, strength: 0.89, length: 0.234, width: 0.65 },
        { density: 0.67, strength: 0.99, length: 0.22, width: 2.15 },
      ],
    },
  },
  rainBase: {
    speedPerFrame: 0.153,
    length: 0.256,
    width: 1.25,
    strength: 0.73,
  },
  rainTrackSelection: {
    enabled: true,
    minActive: 3,
    maxActive: 7,
  },
} satisfies RainSettingsInput;

const strongRainPowerPresetInput = {
  previewFps: 14,
  playbackMode: "auto",
  overallBrightness: 0.86,
  wind: -1,
  globalRain: {
    rainColor: {
      hue: 215,
      tint: 0.55,
    },
    nearStreaks: {
      energyMin: 0.09,
      energyMax: 2,
    },
    midRain: {
      speedPerFrame: 0.558,
      directionSpread: 0.05,
      bands: [
        { density: 2, strength: 0.76, length: 0.146, width: 1.05 },
        { density: 1.06, strength: 0.89, length: 0.234, width: 0.65 },
        { density: 0.95, strength: 1.2, length: 0.246, width: 2.2 },
      ],
    },
  },
  rainBase: {
    speedPerFrame: 0.178,
    length: 0.278,
    width: 1.4,
    strength: 0.82,
  },
  rainTrackSelection: {
    enabled: true,
    minActive: 4,
    maxActive: 7,
  },
} satisfies RainSettingsInput;

export function resolveRainSettingsFromCommandParams(commandParams: PixiRainCommandParams): RainSettings {
  const power = clamp(
    finiteNumber(commandParams.power, DEFAULT_RAIN_COMMAND_PARAMS.power),
    RAIN_POWER_MIN,
    RAIN_POWER_MAX,
  );
  const { lower, upper, amount } = resolveRainPowerPresetRange(power);
  const interpolated = interpolateSettings(lower, upper, amount);
  const meanWindY = interpolated.globalRain.dynamics.meanWind[1] || 1;

  return coerceRainSettings({
    ...interpolated,
    showRain: interpolated.showRain,
    showMidRain: interpolated.showMidRain,
    wind: commandParams.wind,
    globalRain: {
      ...interpolated.globalRain,
      dynamics: {
        ...interpolated.globalRain.dynamics,
        meanWind: [commandParams.wind, meanWindY],
      },
      rainColor: {
        hue: commandParams.hue,
        tint: commandParams.tint,
      },
    },
  });
}

type RainPowerPresetStop = {
  power: number;
  settings: RainSettings;
};

function makeCommandRainPowerPreset(input: RainSettingsInput): RainSettings {
  return coerceRainSettings(input);
}

function makeZeroRainPowerPreset(): RainSettings {
  const weak = makeCommandRainPowerPreset(weakRainPowerPresetInput);
  return coerceRainSettings({
    ...weak,
    globalRain: {
      ...weak.globalRain,
      midRain: {
        ...weak.globalRain.midRain,
        bands: weak.globalRain.midRain.bands.map((band) => ({ ...band, density: 0 })),
      },
    },
    rainTrackSelection: {
      ...weak.rainTrackSelection,
      minActive: 0,
      maxActive: 0,
    },
  });
}

const rainPowerPresetStops: RainPowerPresetStop[] = [
  { power: 0, settings: makeZeroRainPowerPreset() },
  { power: 0.2, settings: makeCommandRainPowerPreset(weakRainPowerPresetInput) },
  { power: 0.5, settings: makeCommandRainPowerPreset(mediumRainPowerPresetInput) },
  { power: 1, settings: makeCommandRainPowerPreset(strongRainPowerPresetInput) },
];

function resolveRainPowerPresetRange(power: number): { lower: RainSettings; upper: RainSettings; amount: number } {
  let lower = rainPowerPresetStops[0]!;
  for (const upper of rainPowerPresetStops.slice(1)) {
    if (power <= upper.power) {
      const span = upper.power - lower.power;
      return {
        lower: lower.settings,
        upper: upper.settings,
        amount: span > 0 ? (power - lower.power) / span : 0,
      };
    }
    lower = upper;
  }
  return { lower: lower.settings, upper: lower.settings, amount: 0 };
}

function interpolateSettings(left: RainSettings, right: RainSettings, amount: number): RainSettings {
  return coerceRainSettings(interpolateValue(left, right, clamp(amount, 0, 1)));
}

function interpolateValue(left: unknown, right: unknown, amount: number): unknown {
  if (typeof left === "number" && typeof right === "number") return mix(left, right, amount);
  if (typeof left === "boolean" && typeof right === "boolean") return amount < 0.5 ? left : right;
  if (typeof left === "string" && typeof right === "string") return amount < 0.5 ? left : right;
  if (Array.isArray(left) && Array.isArray(right)) {
    return right.map((rightValue, index) => interpolateValue(left[index], rightValue, amount));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    return Object.fromEntries(
      Object.entries(right).map(([key, rightValue]) => [key, interpolateValue((left as Record<string, unknown>)[key], rightValue, amount)])
    );
  }
  return amount < 0.5 ? left : right;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
