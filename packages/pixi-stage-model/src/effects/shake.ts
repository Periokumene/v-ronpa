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

export function reduceShake(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  if (booleanParam(command, "loop", false)) {
    return unsupportedPixiParams(
      snapshot,
      command,
      "@shake loop! is not implemented by this Pixi runtime; disable loop or issue a finite shake"
    );
  }
  const hint: Extract<PixiStageRenderHint, { type: "shake" }> = {
    type: "shake",
    target: stringParam(command, "target") ?? "stage",
    intensity: numberParam(command, "power", 0.5),
    durationMs: durationMsParam(command, 150),
    count: numberParam(command, "count", 3),
    loop: false,
    hor: booleanParam(command, "hor", false),
    ver: booleanParam(command, "ver", true),
    wait: booleanParam(command, "wait", false)
  };
  const deltaTimeMs = numberParam(command, "deltaTime");
  const deltaPower = numberParam(command, "deltaPower");
  if (deltaTimeMs !== undefined) hint.deltaTimeMs = deltaTimeMs;
  if (deltaPower !== undefined) hint.deltaPower = deltaPower;
  return {
    snapshot,
    hints: [hint],
    waitTasks: waitTask(command, "shake", hint.target, snapshot.revision),
    diagnostics: []
  };
}
