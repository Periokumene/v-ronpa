import type { PixiActorSnapshot, PixiStageSnapshot, RuntimeCommand } from "@v-ronpa/contracts";
import { PIXI_MAIN_BACKGROUND_ID } from "@v-ronpa/contracts";
import { resolvePixiActorTarget } from "../actorTargets";
import {
  changedSnapshot,
  emptyReduction,
  numberParam,
  stringParam,
  timingTransition,
  unsupportedPixiParams,
  withWaitTasks,
  type PixiRuntimeCommandReduction
} from "./reduction";

export function reduceBlur(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const requestedTarget = stringParam(command, "target");
  const targets = resolvePixiActorTarget(requestedTarget, snapshot);
  if (targets.length === 0) {
    return unsupportedPixiParams(snapshot, command, `unknown actor target: ${requestedTarget ?? PIXI_MAIN_BACKGROUND_ID}`);
  }
  const power = numberParam(command, "power", 0);
  let next = snapshot;
  const changedTargets: string[] = [];
  for (const target of targets) {
    const actor = next.backgroundsById[target] ?? next.charactersById[target];
    if (!actor) continue;
    const currentPower = actor.filters.blur;
    if ((power <= 0 && currentPower === undefined) || (power > 0 && currentPower === power)) continue;
    const filters = { ...actor.filters };
    if (power <= 0) delete filters.blur;
    else filters.blur = power;
    const updated: PixiActorSnapshot = { ...actor, filters, transition: timingTransition(command) };
    next = actor.kind === "background"
      ? { ...next, backgroundsById: { ...next.backgroundsById, [target]: updated } }
      : { ...next, charactersById: { ...next.charactersById, [target]: updated } };
    changedTargets.push(target);
  }
  if (changedTargets.length === 0) return emptyReduction(snapshot);
  return withWaitTasks(command, changedSnapshot(next), "actor-transition", changedTargets);
}
