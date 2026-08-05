import type { PixiStageSnapshot, RuntimeCommand } from "@v-ronpa/contracts";
import { reduceWeatherEffect } from "./weather";
import type { PixiRuntimeCommandReduction } from "./reduction";

export function reduceSnow(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  return reduceWeatherEffect(snapshot, command, "snow");
}
