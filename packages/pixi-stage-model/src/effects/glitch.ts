import type { PixiStageSnapshot, RuntimeCommand } from "@v-ronpa/contracts";
import {
  booleanParam,
  changedSnapshot,
  durationMsParam,
  numberParam,
  stringParam,
  timingTransition,
  withWaitTasks,
  waitTask,
  type PixiRuntimeCommandReduction,
  type PixiStageRenderHint
} from "./reduction";

export function reduceTransientGlitch(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand
): PixiRuntimeCommandReduction {
  const hint: Extract<PixiStageRenderHint, { type: "glitch" }> = {
    type: "glitch",
    power: numberParam(command, "power", 1),
    durationMs: durationMsParam(command, 1000),
    wait: booleanParam(command, "wait", false)
  };
  for (const key of ["blockJump", "burstJump", "pixelScatter", "colorNoise", "speed", "seed"] as const) {
    const value = numberParam(command, key);
    if (value !== undefined) hint[key] = value;
  }
  return {
    snapshot,
    hints: [hint],
    waitTasks: waitTask(command, "glitch", "screen", snapshot.revision),
    diagnostics: []
  };
}

export function reduceGlitchFilter(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 0);
  if (power <= 0) {
    const hadGlitch = Boolean(snapshot.screenFilters.glitch);
    const { glitch: _glitch, ...screenFilters } = snapshot.screenFilters;
    const reduction = changedSnapshot({ ...snapshot, screenFilters });
    const durationMs = durationMsParam(command, 0);
    if (!hadGlitch) return reduction;
    const easing = stringParam(command, "easing");
    return {
      ...withWaitTasks(command, reduction, "screen-filter-transition", ["glitch"]),
      hints: durationMs > 0 ? [{
        type: "screen-filter-remove",
        kind: "glitch",
        durationMs,
        ...(easing ? { easing } : {}),
        wait: booleanParam(command, "wait", false)
      }] : []
    };
  }

  const glitch: NonNullable<PixiStageSnapshot["screenFilters"]["glitch"]> = {
    power,
    transition: timingTransition(command)
  };
  for (const key of ["blockJump", "burstJump", "pixelScatter", "colorNoise", "speed", "seed"] as const) {
    const value = numberParam(command, key);
    if (value !== undefined) glitch[key] = value;
  }
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    screenFilters: { ...snapshot.screenFilters, glitch }
  }), "screen-filter-transition", ["glitch"]);
}
