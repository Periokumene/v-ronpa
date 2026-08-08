import { PixiScreenFiltersSnapshotSchema, type PixiStageSnapshot, type RuntimeCommand, type RuntimeValue } from "@v-ronpa/contracts";
import {
  booleanParam,
  changedSnapshot,
  durationMsParam,
  emptyReduction,
  numberParam,
  sceneVector2Param,
  stringParam,
  timingTransition,
  unsupportedPixiParams,
  withWaitTasks,
  type PixiRuntimeCommandReduction
} from "./reduction";

export function reducePulse(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 0.6);
  if (!unit(power)) return unsupportedPixiParams(snapshot, command, "power must be in 0..1");
  const current = snapshot.screenFilters.pulse;
  if (power <= 0) {
    if (!current) return emptyReduction(snapshot);
    const { pulse: _pulse, ...screenFilters } = snapshot.screenFilters;
    const reduction = changedSnapshot({ ...snapshot, screenFilters });
    const durationMs = durationMsParam(command, 0);
    return {
      ...withWaitTasks(command, reduction, "screen-filter-transition", ["pulse"]),
      hints: durationMs > 0 ? [{
        type: "screen-filter-remove",
        kind: "pulse",
        durationMs,
        ...hintTiming(command)
      }] : []
    };
  }
  const pulse: NonNullable<PixiStageSnapshot["screenFilters"]["pulse"]> = {
    power,
    rate: numberParam(command, "rate", 92),
    origin: sceneVector2Param(command, "origin") ?? [0.5, 0.52],
    echoes: numberParam(command, "echoes", 3),
    expansion: numberParam(command, "expansion", 0.035),
    edge: numberParam(command, "edge", 0.65),
    distortion: numberParam(command, "distortion", 0.35),
    chroma: numberParam(command, "chroma", 0.18),
    decay: numberParam(command, "decay", 0.72),
    color: stringParam(command, "color") ?? "#b8d6d8",
    transition: timingTransition(command)
  };
  if (!validCommandOrigin(command.params.origin) || !PixiScreenFiltersSnapshotSchema.safeParse({ pulse }).success ||
    !validEasing(pulse.transition.easing)) {
    return unsupportedPixiParams(snapshot, command, "pulse parameters do not satisfy the terminal screen-filter contract");
  }
  if (current && samePulse(current, pulse)) return emptyReduction(snapshot);
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    screenFilters: { ...snapshot.screenFilters, pulse }
  }), "screen-filter-transition", ["pulse"]);
}

function samePulse(
  left: NonNullable<PixiStageSnapshot["screenFilters"]["pulse"]>,
  right: NonNullable<PixiStageSnapshot["screenFilters"]["pulse"]>
): boolean {
  return left.power === right.power && left.rate === right.rate && left.origin[0] === right.origin[0] &&
    left.origin[1] === right.origin[1] && left.echoes === right.echoes && left.expansion === right.expansion &&
    left.edge === right.edge && left.distortion === right.distortion && left.chroma === right.chroma &&
    left.decay === right.decay && left.color === right.color;
}

function validCommandOrigin(value: RuntimeValue | undefined): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) && value.length === 2 && value.every((item) =>
    typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 100
  );
}

function hintTiming(command: RuntimeCommand): { easing?: string; wait?: boolean } {
  const easing = stringParam(command, "easing");
  return { ...(easing ? { easing } : {}), wait: booleanParam(command, "wait", false) };
}

function validEasing(value: string | undefined): boolean {
  return value === undefined || value === "linear" || value === "easeIn" || value === "easeOut" || value === "easeInOut";
}

function unit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }
