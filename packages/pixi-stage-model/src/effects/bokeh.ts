import type { PixiStageSnapshot, RuntimeCommand } from "@v-ronpa/contracts";
import {
  booleanParam,
  changedSnapshot,
  durationMsParam,
  emptyReduction,
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
    if (!hadBokeh) return emptyReduction(snapshot);
    const { bokeh: _bokeh, ...screenFilters } = snapshot.screenFilters;
    const reduction = changedSnapshot({ ...snapshot, screenFilters });
    const durationMs = durationMsParam(command, 0);
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
  const bokeh: NonNullable<PixiStageSnapshot["screenFilters"]["bokeh"]> = {
    focus: stringParam(command, "focus"),
    dist: numberParam(command, "dist", 0),
    power,
    transition: timingTransition(command)
  };
  const current = snapshot.screenFilters.bokeh;
  if (current && current.focus === bokeh.focus && current.dist === bokeh.dist && current.power === bokeh.power) {
    return emptyReduction(snapshot);
  }
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    screenFilters: {
      ...snapshot.screenFilters,
      bokeh
    }
  }), "screen-filter-transition", ["bokeh"]);
}
