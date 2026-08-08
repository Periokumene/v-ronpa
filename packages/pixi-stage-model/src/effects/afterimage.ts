import type { PixiStageSnapshot, RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import {
  booleanParam,
  durationMsParam,
  numberParam,
  sceneVector2Param,
  stringParam,
  unsupportedPixiParams,
  waitTask,
  type PixiRuntimeCommandReduction,
  type PixiStageRenderHint
} from "./reduction";

const colorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u;

export function reduceAfterimage(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const target = stringParam(command, "target") ?? "stage";
  if (target !== "stage" && target !== "camera" && !snapshot.charactersById[target] &&
    !snapshot.backgroundsById[target] && !snapshot.innerBackgroundsById[target]) {
    return unsupportedPixiParams(snapshot, command, `afterimage target '${target}' is not active`);
  }
  const hint: Extract<PixiStageRenderHint, { type: "afterimage" }> = {
    type: "afterimage",
    target,
    power: numberParam(command, "power", 0.7),
    count: numberParam(command, "count", 4),
    offset: sceneVector2Param(command, "offset") ?? [-0.015, 0],
    decay: numberParam(command, "decay", 0.7),
    tint: stringParam(command, "tint") ?? "#9fc2c7",
    edge: numberParam(command, "edge", 0.55),
    durationMs: durationMsParam(command, 650),
    ...timing(command)
  };
  if (!unit(hint.power) || !Number.isInteger(hint.count) || hint.count < 1 || hint.count > 6 ||
    !validCommandVector2(command.params.offset) || !hint.offset.every(Number.isFinite) ||
    !unit(hint.decay) || !unit(hint.edge) || !colorPattern.test(hint.tint) ||
    !Number.isFinite(hint.durationMs) || hint.durationMs <= 0 || !validEasing(hint.easing)) {
    return unsupportedPixiParams(snapshot, command, "afterimage parameters are invalid");
  }
  return {
    snapshot,
    hints: [hint],
    waitTasks: waitTask(command, "afterimage", target, snapshot.revision),
    diagnostics: []
  };
}

function timing(command: RuntimeCommand): { easing?: string; wait?: boolean } {
  const easing = stringParam(command, "easing");
  return { ...(easing ? { easing } : {}), wait: booleanParam(command, "wait", false) };
}

function validCommandVector2(value: RuntimeValue | undefined): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function unit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }

function validEasing(value: string | undefined): boolean {
  return value === undefined || value === "linear" || value === "easeIn" || value === "easeOut" || value === "easeInOut";
}
