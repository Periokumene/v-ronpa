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

export function reduceFlicker(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const hint: Extract<PixiStageRenderHint, { type: "flicker" }> = {
    type: "flicker",
    power: numberParam(command, "power", 1),
    bursts: numberParam(command, "bursts", 4),
    irregularity: numberParam(command, "irregularity", 0.65),
    invert: numberParam(command, "invert", 0.75),
    white: numberParam(command, "white", 0.7),
    tear: numberParam(command, "tear", 0.65),
    chroma: numberParam(command, "chroma", 0.35),
    seed: numberParam(command, "seed", 1),
    durationMs: durationMsParam(command, 450),
    ...timing(command)
  };
  if (!unit(hint.power) || !Number.isInteger(hint.bursts) || hint.bursts < 1 || hint.bursts > 32 ||
    !unit(hint.irregularity) || !unit(hint.invert) || !unit(hint.white) || !unit(hint.tear) ||
    !unit(hint.chroma) || !Number.isFinite(hint.seed) || !Number.isFinite(hint.durationMs) || hint.durationMs <= 0 ||
    !validEasing(hint.easing)) {
    return unsupportedPixiParams(snapshot, command, "flicker parameters are invalid");
  }
  return {
    snapshot,
    hints: [hint],
    waitTasks: waitTask(command, "flicker", "screen", snapshot.revision),
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
