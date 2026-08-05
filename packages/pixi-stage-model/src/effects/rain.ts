import type {
  PixiRainCommandParams,
  PixiStageSnapshot,
  RuntimeCommand
} from "@v-ronpa/contracts";
import {
  DEFAULT_RAIN_COMMAND_PARAMS,
  RAIN_HUE_WRAP,
  RAIN_POWER_MAX,
  RAIN_POWER_MIN,
  RAIN_TINT_MAX,
  RAIN_TINT_MIN,
  RAIN_WIND_MAX,
  RAIN_WIND_MIN
} from "../rainCommandParams";
import {
  booleanParam,
  changedSnapshot,
  durationMsParam,
  numberParam,
  stringParam,
  timingTransition,
  withWaitTasks,
  type PixiRuntimeCommandDiagnostic,
  type PixiRuntimeCommandReduction
} from "./reduction";

export function reduceRain(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const { params, diagnostics } = normalizeRainCommandParams(command);
  if (params.power <= 0) {
    const hadWeather = Boolean(snapshot.weather.rain);
    const weather = { ...snapshot.weather };
    delete weather.rain;
    const reduction = changedSnapshot({ ...snapshot, weather });
    const durationMs = durationMsParam(command, 0);
    const withDiagnostics = { ...reduction, diagnostics: [...reduction.diagnostics, ...diagnostics] };
    if (!hadWeather) return withDiagnostics;
    const easing = stringParam(command, "easing");
    return {
      ...withWaitTasks(command, withDiagnostics, "weather-transition", ["rain"]),
      hints: durationMs > 0 ? [{
        type: "weather-remove",
        kind: "rain",
        durationMs,
        ...(easing ? { easing } : {}),
        wait: booleanParam(command, "wait", false)
      }] : []
    };
  }

  return withWaitTasks(command, {
    ...changedSnapshot({
      ...snapshot,
      weather: {
        ...snapshot.weather,
        rain: { kind: "rain", commandParams: params, transition: timingTransition(command) }
      }
    }),
    diagnostics
  }, "weather-transition", ["rain"]);
}

function normalizeRainCommandParams(
  command: RuntimeCommand
): { params: PixiRainCommandParams; diagnostics: PixiRuntimeCommandDiagnostic[] } {
  const diagnostics: PixiRuntimeCommandDiagnostic[] = [];
  const power = clampRainNumber(command, "power", DEFAULT_RAIN_COMMAND_PARAMS.power, RAIN_POWER_MIN, RAIN_POWER_MAX, diagnostics);
  const wind = clampRainNumber(command, "wind", DEFAULT_RAIN_COMMAND_PARAMS.wind, RAIN_WIND_MIN, RAIN_WIND_MAX, diagnostics);
  const hue = normalizeRainHue(command, diagnostics);
  const tint = clampRainNumber(command, "tint", DEFAULT_RAIN_COMMAND_PARAMS.tint, RAIN_TINT_MIN, RAIN_TINT_MAX, diagnostics);
  return { params: { power, wind, hue, tint }, diagnostics };
}

function clampRainNumber(
  command: RuntimeCommand,
  key: keyof PixiRainCommandParams,
  fallback: number,
  min: number,
  max: number,
  diagnostics: PixiRuntimeCommandDiagnostic[]
): number {
  const value = numberParam(command, key);
  if (value === undefined) return fallback;
  const normalized = Math.min(max, Math.max(min, value));
  if (normalized !== value) diagnostics.push({
    code: "normalized-pixi-params",
    commandId: command.commandId,
    message: `@${command.canonicalName} ${key}:${value} was clamped to ${normalized}.`
  });
  return normalized;
}

function normalizeRainHue(command: RuntimeCommand, diagnostics: PixiRuntimeCommandDiagnostic[]): number {
  const value = numberParam(command, "hue");
  if (value === undefined) return DEFAULT_RAIN_COMMAND_PARAMS.hue;
  const normalized = ((value % RAIN_HUE_WRAP) + RAIN_HUE_WRAP) % RAIN_HUE_WRAP;
  if (normalized !== value) diagnostics.push({
    code: "normalized-pixi-params",
    commandId: command.commandId,
    message: `@${command.canonicalName} hue:${value} was normalized to ${normalized}.`
  });
  return normalized;
}
