import type { PixiStageSnapshot, PixiWeatherSnapshot, RuntimeCommand } from "@v-ronpa/contracts";
import {
  booleanParam,
  changedSnapshot,
  durationMsParam,
  emptyReduction,
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
  kind: "snow" | "sun"
): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 1);
  if (power <= 0) {
    const hadWeather = Boolean(snapshot.weather[kind]);
    if (!hadWeather) return emptyReduction(snapshot);
    const weather = { ...snapshot.weather };
    delete weather[kind];
    const reduction = changedSnapshot({ ...snapshot, weather });
    const durationMs = durationMsParam(command, 0);
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
  const nextWeather: Extract<PixiWeatherSnapshot, { kind: "snow" | "sun" }> = {
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
  };
  const current = snapshot.weather[kind];
  if (current && sameWeather(current, nextWeather)) return emptyReduction(snapshot);
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    weather: {
      ...snapshot.weather,
      [kind]: nextWeather
    }
  }), "weather-transition", [kind]);
}

function sameWeather(left: PixiWeatherSnapshot, right: PixiWeatherSnapshot): boolean {
  if (left.kind !== right.kind || left.kind === "rain" || right.kind === "rain") return false;
  if (left.power !== right.power || left.pos?.[0] !== right.pos?.[0] || left.pos?.[1] !== right.pos?.[1] ||
    !sameVector(left.position, right.position) || !sameVector(left.rotation, right.rotation) || !sameVector(left.scale, right.scale)) {
    return false;
  }
  if (left.kind === "sun" && right.kind === "sun") return true;
  return left.kind === "snow" && right.kind === "snow" && left.xSpeed === right.xSpeed && left.ySpeed === right.ySpeed &&
    left.density === right.density && left.flakeScale === right.flakeScale && left.sway === right.sway &&
    left.fog === right.fog && left.noise === right.noise && left.seed === right.seed;
}

function sameVector(left: readonly number[] | undefined, right: readonly number[] | undefined): boolean {
  return left?.length === right?.length && left?.every((value, index) => value === right?.[index]) !== false;
}
