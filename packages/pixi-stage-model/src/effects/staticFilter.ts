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

export function reduceStaticFilter(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 0.6);
  if (!unit(power)) return unsupportedPixiParams(snapshot, command, "power must be in 0..1");
  const current = snapshot.screenFilters.staticFilter;
  if (power <= 0) {
    if (!current) return emptyReduction(snapshot);
    const { staticFilter: _staticFilter, ...screenFilters } = snapshot.screenFilters;
    const reduction = changedSnapshot({ ...snapshot, screenFilters });
    const durationMs = durationMsParam(command, 0);
    return {
      ...withWaitTasks(command, reduction, "screen-filter-transition", ["staticFilter"]),
      hints: durationMs > 0 ? [{
        type: "screen-filter-remove",
        kind: "staticFilter",
        durationMs,
        ...hintTiming(command)
      }] : []
    };
  }
  const palette = stringParam(command, "palette") ?? "cold";
  if (palette !== "cold" && palette !== "sepia" && palette !== "green" && palette !== "mono") {
    return unsupportedPixiParams(snapshot, command, `unknown static palette '${palette}'`);
  }
  const staticFilter: NonNullable<PixiStageSnapshot["screenFilters"]["staticFilter"]> = {
    power,
    density: numberParam(command, "density", 0.7),
    scanline: numberParam(command, "scanline", 0.65),
    jitter: numberParam(command, "jitter", 0.45),
    warp: numberParam(command, "warp", 0.35),
    grainSize: numberParam(command, "grainSize", 1),
    speed: numberParam(command, "speed", 1),
    vignette: numberParam(command, "vignette", 0.35),
    palette,
    seed: numberParam(command, "seed", 1),
    transition: timingTransition(command)
  };
  if (!PixiScreenFiltersSnapshotSchema.safeParse({ staticFilter }).success || !validEasing(staticFilter.transition.easing)) {
    return unsupportedPixiParams(snapshot, command, "staticFilter parameters do not satisfy the terminal screen-filter contract");
  }
  if (current && sameStaticFilter(current, staticFilter)) return emptyReduction(snapshot);
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    screenFilters: { ...snapshot.screenFilters, staticFilter }
  }), "screen-filter-transition", ["staticFilter"]);
}

function sameStaticFilter(
  left: NonNullable<PixiStageSnapshot["screenFilters"]["staticFilter"]>,
  right: NonNullable<PixiStageSnapshot["screenFilters"]["staticFilter"]>
): boolean {
  return left.power === right.power && left.density === right.density && left.scanline === right.scanline &&
    left.jitter === right.jitter && left.warp === right.warp && left.grainSize === right.grainSize &&
    left.speed === right.speed && left.vignette === right.vignette && left.palette === right.palette && left.seed === right.seed;
}

function hintTiming(command: RuntimeCommand): { easing?: string; wait?: boolean } {
  const easing = stringParam(command, "easing");
  return { ...(easing ? { easing } : {}), wait: booleanParam(command, "wait", false) };
}

function validEasing(value: string | undefined): boolean {
  return value === undefined || value === "linear" || value === "easeIn" || value === "easeOut" || value === "easeInOut";
}

function unit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }
