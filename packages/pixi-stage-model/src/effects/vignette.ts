import { PixiScreenFiltersSnapshotSchema, type PixiStageSnapshot, type RuntimeCommand } from "@v-ronpa/contracts";
import {
  booleanParam,
  changedSnapshot,
  durationMsParam,
  emptyReduction,
  numberParam,
  stringParam,
  timingTransition,
  unsupportedPixiParams,
  withWaitTasks,
  type PixiRuntimeCommandReduction
} from "./reduction";

export function reduceVignette(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 0.5);
  if (!unit(power)) return unsupportedPixiParams(snapshot, command, "power must be in 0..1");
  const current = snapshot.screenFilters.vignette;
  if (power <= 0) {
    if (!current) return emptyReduction(snapshot);
    const { vignette: _vignette, ...screenFilters } = snapshot.screenFilters;
    const reduction = changedSnapshot({ ...snapshot, screenFilters });
    const durationMs = durationMsParam(command, 0);
    return {
      ...withWaitTasks(command, reduction, "screen-filter-transition", ["vignette"]),
      hints: durationMs > 0 ? [{
        type: "screen-filter-remove",
        kind: "vignette",
        durationMs,
        ...hintTiming(command)
      }] : []
    };
  }
  const vignette: NonNullable<PixiStageSnapshot["screenFilters"]["vignette"]> = {
    power,
    radius: numberParam(command, "radius", 0.62),
    softness: numberParam(command, "softness", 0.3),
    color: stringParam(command, "color") ?? "#160a10",
    breathe: numberParam(command, "breathe", 0.06),
    grain: numberParam(command, "grain", 0.03),
    transition: timingTransition(command)
  };
  if (!PixiScreenFiltersSnapshotSchema.safeParse({ vignette }).success || !validEasing(vignette.transition.easing)) {
    return unsupportedPixiParams(snapshot, command, "vignette parameters do not satisfy the terminal screen-filter contract");
  }
  if (current && current.power === vignette.power && current.radius === vignette.radius &&
    current.softness === vignette.softness && current.color === vignette.color &&
    current.breathe === vignette.breathe && current.grain === vignette.grain) return emptyReduction(snapshot);
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    screenFilters: { ...snapshot.screenFilters, vignette }
  }), "screen-filter-transition", ["vignette"]);
}

function hintTiming(command: RuntimeCommand): { easing?: string; wait?: boolean } {
  const easing = stringParam(command, "easing");
  return { ...(easing ? { easing } : {}), wait: booleanParam(command, "wait", false) };
}

function validEasing(value: string | undefined): boolean {
  return value === undefined || value === "linear" || value === "easeIn" || value === "easeOut" || value === "easeInOut";
}

function unit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }
