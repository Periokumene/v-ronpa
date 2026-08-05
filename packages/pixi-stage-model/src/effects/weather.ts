import type { PixiStageSnapshot, PixiWeatherKind, RuntimeCommand } from "@v-ronpa/contracts";
import {
  booleanParam,
  changedSnapshot,
  durationMsParam,
  numberParam,
  sceneVector2Param,
  stringParam,
  timingTransition,
  vector3Param,
  withWaitTasks,
  type PixiRuntimeCommandReduction
} from "./reduction";

export function reduceWeatherEffect(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand,
  kind: PixiWeatherKind
): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 1);
  if (power <= 0) {
    const hadWeather = Boolean(snapshot.weather[kind]);
    const weather = { ...snapshot.weather };
    delete weather[kind];
    const reduction = changedSnapshot({ ...snapshot, weather });
    const durationMs = durationMsParam(command, 0);
    if (!hadWeather) return reduction;
    const easing = stringParam(command, "easing");
    return {
      ...withWaitTasks(command, reduction, "weather-transition", [kind]),
      hints: durationMs > 0 ? [{
        type: "weather-remove",
        kind,
        durationMs,
        ...(easing ? { easing } : {}),
        wait: booleanParam(command, "wait", false)
      }] : []
    };
  }
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    weather: {
      ...snapshot.weather,
      [kind]: {
        kind,
        power,
        xSpeed: numberParam(command, "xSpeed"),
        ySpeed: numberParam(command, "ySpeed"),
        ...(kind === "snow" ? {
          density: numberParam(command, "density"),
          flakeScale: numberParam(command, "flakeScale"),
          sway: numberParam(command, "sway"),
          fog: numberParam(command, "fog"),
          noise: numberParam(command, "noise"),
          seed: numberParam(command, "seed")
        } : {}),
        pos: sceneVector2Param(command, "pos"),
        position: vector3Param(command, "position"),
        rotation: vector3Param(command, "rotation"),
        scale: vector3Param(command, "scale"),
        transition: timingTransition(command)
      }
    }
  }), "weather-transition", [kind]);
}
