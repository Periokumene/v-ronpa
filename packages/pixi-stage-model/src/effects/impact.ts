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

export function reduceImpact(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const hint: Extract<PixiStageRenderHint, { type: "impact" }> = {
    type: "impact",
    power: numberParam(command, "power", 1),
    origin: sceneVector2Param(command, "origin") ?? [0.5, 0.5],
    direction: numberParam(command, "direction", 0),
    smear: numberParam(command, "smear", 0.6),
    chroma: numberParam(command, "chroma", 0.25),
    durationMs: durationMsParam(command, 220),
    ...timing(command)
  };
  if (!unit(hint.power) || !unit(hint.smear) || !unit(hint.chroma) ||
    !Number.isFinite(hint.direction) || !validCommandVector2(command.params.origin) ||
    !hint.origin.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) ||
    !Number.isFinite(hint.durationMs) || hint.durationMs <= 0 || !validEasing(hint.easing)) {
    return unsupportedPixiParams(snapshot, command, "impact parameters are invalid");
  }
  return {
    snapshot,
    hints: [hint],
    waitTasks: waitTask(command, "impact", "screen", snapshot.revision),
    diagnostics: []
  };
}

function timing(command: RuntimeCommand): { easing?: string; wait?: boolean } {
  const easing = stringParam(command, "easing");
  return { ...(easing ? { easing } : {}), wait: booleanParam(command, "wait", false) };
}

function validCommandVector2(value: RuntimeValue | undefined): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) && value.length === 2 && value.every((item) =>
    typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 100
  );
}

function unit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }

function validEasing(value: string | undefined): boolean {
  return value === undefined || value === "linear" || value === "easeIn" || value === "easeOut" || value === "easeInOut";
}
