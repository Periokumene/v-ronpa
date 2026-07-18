import { PIXI_MAIN_BACKGROUND_ID, type RuntimeValue } from "@v-ronpa/contracts";
import type { CommandNormalizerDescriptor, CommandShape } from "../types";
import {
  compactParams,
  durationMsValue,
  runtimeCommandValue,
  runtimeParam
} from "../values.ts";

export const effectNormalizers: Readonly<Record<string, CommandNormalizerDescriptor>> = {
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
  focus: {
    acceptsPrimary: true,
    consumedParams: ["target", "duration"],
    normalize: (command) =>
      compactParams({
        target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "target") ?? "stage",
        durationMs: runtimeParam(command, "duration") ?? 500
      })
  }
};

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
  options: { easing?: boolean; lazy?: boolean } = {}
): Record<string, RuntimeValue | undefined> {
  return {
    easing: options.easing ? runtimeParam(command, "easing") : undefined,
    durationMs: durationMsValue(runtimeParam(command, "time")),
    lazy: options.lazy ? runtimeParam(command, "lazy") ?? false : false,
    wait: runtimeParam(command, "wait") ?? false
  };
}
