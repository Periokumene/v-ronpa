import type { PixiStageSnapshot, RuntimeCommand } from "@v-ronpa/contracts";
import {
  booleanParam,
  changedSnapshot,
  durationMsParam,
  numberParam,
  stringParam,
  timingTransition,
  withWaitTasks,
  type PixiRuntimeCommandReduction
} from "./reduction";

export function reduceBokeh(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 0);
  if (power <= 0) {
    const hadBokeh = Boolean(snapshot.screenFilters.bokeh);
    const { bokeh: _bokeh, ...screenFilters } = snapshot.screenFilters;
    const reduction = changedSnapshot({ ...snapshot, screenFilters });
    const durationMs = durationMsParam(command, 0);
    if (!hadBokeh) return reduction;
    const easing = stringParam(command, "easing");
    return {
      ...withWaitTasks(command, reduction, "screen-filter-transition", ["bokeh"]),
      hints: durationMs > 0 ? [{
        type: "screen-filter-remove",
        kind: "bokeh",
        durationMs,
        ...(easing ? { easing } : {}),
        wait: booleanParam(command, "wait", false)
      }] : []
    };
  }
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    screenFilters: {
      ...snapshot.screenFilters,
      bokeh: {
        focus: stringParam(command, "focus"),
        dist: numberParam(command, "dist", 0),
        power,
        transition: timingTransition(command)
      }
    }
  }), "screen-filter-transition", ["bokeh"]);
}
