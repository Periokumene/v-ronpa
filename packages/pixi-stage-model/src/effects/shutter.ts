import type { PixiStageSnapshot, RuntimeCommand } from "@v-ronpa/contracts";
import {
  booleanParam,
  durationMsParam,
  numberParam,
  stringParam,
  unsupportedPixiParams,
  waitTask,
  type PixiRuntimeCommandReduction,
  type PixiStageRenderHint
} from "./reduction";

const colorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u;

export function reduceShutter(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const shape = stringParam(command, "shape") ?? "eyelid";
  if (shape !== "eyelid" && shape !== "iris" && shape !== "slice") {
    return unsupportedPixiParams(snapshot, command, `unknown shutter shape '${shape}'`);
  }
  const hint: Extract<PixiStageRenderHint, { type: "shutter" }> = {
    type: "shutter",
    power: numberParam(command, "power", 1),
    shape,
    color: stringParam(command, "color") ?? "#020304",
    hold: numberParam(command, "hold", 0.08),
    skew: numberParam(command, "skew", 0.18),
    durationMs: durationMsParam(command, 480),
    ...timing(command)
  };
  if (!unit(hint.power) || !unit(hint.hold) || !unit(hint.skew) || !colorPattern.test(hint.color) ||
    !Number.isFinite(hint.durationMs) || hint.durationMs <= 0 || !validEasing(hint.easing)) {
    return unsupportedPixiParams(snapshot, command, "shutter parameters are invalid");
  }
  return {
    snapshot,
    hints: [hint],
    waitTasks: waitTask(command, "shutter", "screen", snapshot.revision),
    diagnostics: []
  };
}

function timing(command: RuntimeCommand): { easing?: string; wait?: boolean } {
  const easing = stringParam(command, "easing");
  return { ...(easing ? { easing } : {}), wait: booleanParam(command, "wait", false) };
}

function unit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }

function validEasing(value: string | undefined): boolean {
  return value === undefined || value === "linear" || value === "easeIn" || value === "easeOut" || value === "easeInOut";
}
