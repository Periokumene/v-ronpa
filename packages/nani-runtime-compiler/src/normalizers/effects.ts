import { PIXI_MAIN_BACKGROUND_ID, type RuntimeValue } from "@v-ronpa/contracts";
import type { CommandNormalizerDescriptor, CommandShape } from "../types";
import {
  compactParams,
  durationMsValue,
  runtimeCommandValue,
  runtimeParam
} from "../values.ts";

export const effectNormalizers: Readonly<Record<string, CommandNormalizerDescriptor>> = {
  afterimage: {
    acceptsPrimary: false,
    consumedParams: ["target", "power", "count", "offset", "decay", "tint", "edge", "time", "easing", "wait"],
    normalize: (command) => compactParams({
      target: runtimeParam(command, "target") ?? "stage", power: runtimeParam(command, "power") ?? 0.7,
      count: runtimeParam(command, "count") ?? 4, offset: runtimeParam(command, "offset") ?? [-1.5, 0],
      decay: runtimeParam(command, "decay") ?? 0.7, tint: runtimeParam(command, "tint") ?? "#9fc2c7",
      edge: runtimeParam(command, "edge") ?? 0.55, ...normalizeTimingParams(command, { easing: true }, 0.65),
      easing: runtimeParam(command, "easing") ?? "outExpo"
    })
  },
  blur: {
    acceptsPrimary: true,
    consumedParams: ["actorId", "power", "time", "wait"],
    normalize: (command) =>
      compactParams({
        target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "actorId") ?? PIXI_MAIN_BACKGROUND_ID,
        power: runtimeParam(command, "power") ?? 0,
        ...normalizeTimingParams(command)
      })
  },
  bokeh: {
    acceptsPrimary: false,
    consumedParams: ["focus", "dist", "power", "time", "wait"],
    normalize: (command) =>
      compactParams({
        focus: runtimeParam(command, "focus"),
        dist: runtimeParam(command, "dist"),
        power: runtimeParam(command, "power") ?? 0,
        ...normalizeTimingParams(command)
      })
  },
  chartone: {
    acceptsPrimary: true,
    consumedParams: ["preset", "amount", "time", "wait"],
    normalize: normalizeCharacterToneCommand
  },
  glitch: {
    acceptsPrimary: false,
    consumedParams: ["time", "power", "blockJump", "burstJump", "pixelScatter", "colorNoise", "speed", "seed", "wait"],
    normalize: (command) => normalizeGlitchCommand(command, 1, false)
  },
  glitchfilter: {
    acceptsPrimary: false,
    consumedParams: ["time", "easing", "power", "blockJump", "burstJump", "pixelScatter", "colorNoise", "speed", "seed", "wait"],
    normalize: (command) => normalizeGlitchCommand(command, 0, true)
  },
  rain: {
    acceptsPrimary: false,
    consumedParams: ["power", "wind", "hue", "tint", "time", "easing", "wait"],
    normalize: (command) =>
      compactParams({
        kind: "rain",
        power: runtimeParam(command, "power") ?? 1,
        wind: runtimeParam(command, "wind"),
        hue: runtimeParam(command, "hue"),
        tint: runtimeParam(command, "tint"),
        ...normalizeTimingParams(command, { easing: true })
      })
  },
  snow: {
    acceptsPrimary: false,
    consumedParams: ["power", "time", "xSpeed", "ySpeed", "density", "flakeScale", "sway", "fog", "noise", "seed", "pos", "position", "rotation", "scale", "wait"],
    normalize: (command) => normalizeWeatherCommand(command, "snow")
  },
  sun: {
    acceptsPrimary: false,
    consumedParams: ["power", "time", "pos", "position", "rotation", "scale", "wait"],
    normalize: (command) => normalizeWeatherCommand(command, "sun")
  },
  shake: {
    acceptsPrimary: true,
    consumedParams: ["actorId", "target", "count", "loop", "time", "deltaTime", "power", "deltaPower", "hor", "ver", "wait", "intensity", "duration"],
    normalize: normalizeShakeCommand
  },
  flash: {
    acceptsPrimary: false,
    consumedParams: ["color", "duration", "wait"],
    normalize: (command) =>
      compactParams({
        color: runtimeParam(command, "color") ?? "#ffffff",
        durationMs: runtimeParam(command, "duration") ?? 160,
        wait: runtimeParam(command, "wait") ?? false
      })
  },
  flicker: {
    acceptsPrimary: false,
    consumedParams: ["power", "bursts", "irregularity", "invert", "white", "tear", "chroma", "seed", "time", "easing", "wait"],
    normalize: (command) => compactParams({
      power: runtimeParam(command, "power") ?? 1, bursts: runtimeParam(command, "bursts") ?? 4,
      irregularity: runtimeParam(command, "irregularity") ?? 0.65, invert: runtimeParam(command, "invert") ?? 0.75,
      white: runtimeParam(command, "white") ?? 0.7, tear: runtimeParam(command, "tear") ?? 0.65,
      chroma: runtimeParam(command, "chroma") ?? 0.35, seed: runtimeParam(command, "seed") ?? 1,
      ...normalizeTimingParams(command, { easing: true }, 0.45)
    })
  },
  impact: {
    acceptsPrimary: false,
    consumedParams: ["power", "origin", "direction", "smear", "chroma", "time", "easing", "wait"],
    normalize: (command) => compactParams({
      power: runtimeParam(command, "power") ?? 1, origin: runtimeParam(command, "origin") ?? [50, 50],
      direction: runtimeParam(command, "direction") ?? 0, smear: runtimeParam(command, "smear") ?? 0.6,
      chroma: runtimeParam(command, "chroma") ?? 0.25, ...normalizeTimingParams(command, { easing: true }, 0.22),
      easing: runtimeParam(command, "easing") ?? "outExpo"
    })
  },
  pulse: persistentNormalizer({
    power: 0.6, rate: 92, origin: [50, 52], echoes: 3, expansion: 0.035, edge: 0.65,
    distortion: 0.35, chroma: 0.18, decay: 0.72, color: "#b8d6d8"
  }),
  shutter: {
    acceptsPrimary: false,
    consumedParams: ["power", "shape", "color", "hold", "skew", "time", "easing", "wait"],
    normalize: (command) => compactParams({
      power: runtimeParam(command, "power") ?? 1, shape: runtimeParam(command, "shape") ?? "eyelid",
      color: runtimeParam(command, "color") ?? "#020304", hold: runtimeParam(command, "hold") ?? 0.08,
      skew: runtimeParam(command, "skew") ?? 0.18, ...normalizeTimingParams(command, { easing: true }, 0.48)
    })
  },
  signalmask: persistentNormalizer({
    target: "alice", region: "head", power: 0.7, bands: 0.8, noise: 0.45,
    chroma: 0.25, speed: 0.6, threshold: 0.5, seed: 1
  }),
  staticfilter: persistentNormalizer({
    power: 0.6, density: 0.7, scanline: 0.65, jitter: 0.45, warp: 0.35,
    grainSize: 1, speed: 1, vignette: 0.35, palette: "cold", seed: 1
  }),
  vignette: persistentNormalizer({
    power: 0.5, radius: 0.62, softness: 0.3, color: "#160a10", breathe: 0.06, grain: 0.03
  }),
  waterveil: persistentNormalizer({
    power: 0.5, level: 0.18, ripple: 0.35, drift: -0.1, blur: 0.12,
    tint: "#6c8390", droplets: 0.5, seed: 1
  })
};

function persistentNormalizer(defaults: Record<string, RuntimeValue>): CommandNormalizerDescriptor {
  const params = [...Object.keys(defaults), "time", "easing", "wait"];
  return {
    acceptsPrimary: false,
    consumedParams: params,
    normalize: (command) => compactParams({
      ...Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, runtimeParam(command, key) ?? fallback])),
      ...normalizeTimingParams(command, { easing: true })
    })
  };
}

function normalizeCharacterToneCommand(command: CommandShape): Record<string, RuntimeValue> {
  const preset = runtimeCommandValue(command.primary) ?? runtimeParam(command, "preset");
  const requestedAmount = runtimeParam(command, "amount");
  return compactParams({
    preset,
    amount: requestedAmount ?? (
      typeof preset === "string" && preset !== "none"
        ? 1
        : undefined
    ),
    durationMs: durationMsValue(runtimeParam(command, "time")) ?? 0,
    wait: runtimeParam(command, "wait") ?? false
  });
}

function normalizeGlitchCommand(
  command: CommandShape,
  defaultPower: number,
  consumesEasing: boolean
): Record<string, RuntimeValue> {
  return compactParams({
    power: runtimeParam(command, "power") ?? defaultPower,
    blockJump: runtimeParam(command, "blockJump"),
    burstJump: runtimeParam(command, "burstJump"),
    pixelScatter: runtimeParam(command, "pixelScatter"),
    colorNoise: runtimeParam(command, "colorNoise"),
    speed: runtimeParam(command, "speed"),
    seed: runtimeParam(command, "seed"),
    ...normalizeTimingParams(command, { easing: consumesEasing })
  });
}

function normalizeWeatherCommand(command: CommandShape, kind: string): Record<string, RuntimeValue> {
  const snowShaderParams =
    kind === "snow"
      ? {
          density: runtimeParam(command, "density"),
          flakeScale: runtimeParam(command, "flakeScale"),
          sway: runtimeParam(command, "sway"),
          fog: runtimeParam(command, "fog"),
          noise: runtimeParam(command, "noise"),
          seed: runtimeParam(command, "seed")
        }
      : {};
  return compactParams({
    kind,
    power: runtimeParam(command, "power") ?? 1,
    xSpeed: kind === "snow" ? runtimeParam(command, "xSpeed") : undefined,
    ySpeed: kind === "snow" ? runtimeParam(command, "ySpeed") : undefined,
    ...snowShaderParams,
    pos: runtimeParam(command, "pos"),
    position: runtimeParam(command, "position"),
    rotation: runtimeParam(command, "rotation"),
    scale: runtimeParam(command, "scale"),
    ...normalizeTimingParams(command, { easing: false, lazy: false })
  });
}

function normalizeShakeCommand(command: CommandShape): Record<string, RuntimeValue> {
  return compactParams({
    target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "actorId") ?? runtimeParam(command, "target") ?? "stage",
    count: runtimeParam(command, "count"),
    loop: runtimeParam(command, "loop"),
    deltaTime: durationMsValue(runtimeParam(command, "deltaTime")),
    power: runtimeParam(command, "power") ?? runtimeParam(command, "intensity") ?? 0.5,
    deltaPower: runtimeParam(command, "deltaPower"),
    hor: runtimeParam(command, "hor"),
    ver: runtimeParam(command, "ver"),
    durationMs: runtimeParam(command, "duration") ?? durationMsValue(runtimeParam(command, "time")),
    wait: runtimeParam(command, "wait") ?? false
  });
}

function normalizeTimingParams(
  command: CommandShape,
  options: { easing?: boolean; lazy?: boolean } = {},
  defaultSeconds?: number
): Record<string, RuntimeValue | undefined> {
  return {
    easing: options.easing ? runtimeParam(command, "easing") : undefined,
    durationMs: durationMsValue(runtimeParam(command, "time")) ?? (
      defaultSeconds === undefined ? undefined : defaultSeconds * 1000
    ),
    lazy: options.lazy ? runtimeParam(command, "lazy") ?? false : false,
    wait: runtimeParam(command, "wait") ?? false
  };
}
