import type { PixiStageSnapshot, RuntimeCommand } from "@v-ronpa/contracts";
import { reduceWeatherEffect } from "./weather";
import type { PixiRuntimeCommandReduction } from "./reduction";

export function reduceSun(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  return reduceWeatherEffect(snapshot, command, "sun");
}
