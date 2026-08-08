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

export function reduceWaterVeil(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 0.5);
  if (!unit(power)) return unsupportedPixiParams(snapshot, command, "power must be in 0..1");
  const current = snapshot.screenFilters.waterVeil;
  if (power <= 0) {
    if (!current) return emptyReduction(snapshot);
    const { waterVeil: _waterVeil, ...screenFilters } = snapshot.screenFilters;
    const reduction = changedSnapshot({ ...snapshot, screenFilters });
    const durationMs = durationMsParam(command, 0);
    return {
      ...withWaitTasks(command, reduction, "screen-filter-transition", ["waterVeil"]),
      hints: durationMs > 0 ? [{
        type: "screen-filter-remove",
        kind: "waterVeil",
        durationMs,
        ...hintTiming(command)
      }] : []
    };
  }
  const waterVeil: NonNullable<PixiStageSnapshot["screenFilters"]["waterVeil"]> = {
    power,
    level: numberParam(command, "level", 0.18),
    ripple: numberParam(command, "ripple", 0.35),
    drift: numberParam(command, "drift", -0.1),
    blur: numberParam(command, "blur", 0.12),
    tint: stringParam(command, "tint") ?? "#6c8390",
    droplets: numberParam(command, "droplets", 0.5),
    seed: numberParam(command, "seed", 1),
    transition: timingTransition(command)
  };
  if (!PixiScreenFiltersSnapshotSchema.safeParse({ waterVeil }).success || !validEasing(waterVeil.transition.easing)) {
    return unsupportedPixiParams(snapshot, command, "waterVeil parameters do not satisfy the terminal screen-filter contract");
  }
  if (current && sameWaterVeil(current, waterVeil)) return emptyReduction(snapshot);
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    screenFilters: { ...snapshot.screenFilters, waterVeil }
  }), "screen-filter-transition", ["waterVeil"]);
}

function sameWaterVeil(
  left: NonNullable<PixiStageSnapshot["screenFilters"]["waterVeil"]>,
  right: NonNullable<PixiStageSnapshot["screenFilters"]["waterVeil"]>
): boolean {
  return left.power === right.power && left.level === right.level && left.ripple === right.ripple &&
    left.drift === right.drift && left.blur === right.blur && left.tint === right.tint &&
    left.droplets === right.droplets && left.seed === right.seed;
}

function hintTiming(command: RuntimeCommand): { easing?: string; wait?: boolean } {
  const easing = stringParam(command, "easing");
  return { ...(easing ? { easing } : {}), wait: booleanParam(command, "wait", false) };
}

function validEasing(value: string | undefined): boolean {
  return value === undefined || value === "linear" || value === "easeIn" || value === "easeOut" || value === "easeInOut";
}

function unit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }
