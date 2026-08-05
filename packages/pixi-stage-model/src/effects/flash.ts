import type { PixiStageSnapshot, RuntimeCommand } from "@v-ronpa/contracts";
import { booleanParam, durationMsParam, stringParam, waitTask, type PixiRuntimeCommandReduction } from "./reduction";

export function reduceFlash(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  return {
    snapshot,
    hints: [{
      type: "flash",
      color: stringParam(command, "color") ?? "#ffffff",
      durationMs: durationMsParam(command, 160),
      wait: booleanParam(command, "wait", false)
    }],
    waitTasks: waitTask(command, "flash", "screen", snapshot.revision),
    diagnostics: []
  };
}
