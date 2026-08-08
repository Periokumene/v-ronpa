import {
  PixiActorFilterSnapshotSchema,
  type PixiActorFilterSnapshot,
  type PixiActorSnapshot,
  type PixiStageSnapshot,
  type RuntimeCommand
} from "@v-ronpa/contracts";
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

export function reduceSignalMask(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const target = stringParam(command, "target");
  if (!target) return unsupportedPixiParams(snapshot, command, "signalMask target is required");
  const actor = snapshot.charactersById[target];
  if (!actor) return unsupportedPixiParams(snapshot, command, `signalMask target '${target}' is not an active character`);
  const power = numberParam(command, "power", 0.7);
  if (!unit(power)) return unsupportedPixiParams(snapshot, command, "power must be in 0..1");
  if (!validEasing(stringParam(command, "easing"))) return unsupportedPixiParams(snapshot, command, "easing is unsupported");

  const current = actor.filters.signalMask;
  if (power <= 0) {
    if (!current) return emptyReduction(snapshot);
    const filters = { ...actor.filters };
    delete filters.signalMask;
    return updateActor(snapshot, command, target, actor, filters);
  }

  const signalMask: NonNullable<PixiActorFilterSnapshot["signalMask"]> = {
    power,
    bands: numberParam(command, "bands", 0.8),
    noise: numberParam(command, "noise", 0.45),
    chroma: numberParam(command, "chroma", 0.25),
    speed: numberParam(command, "speed", 0.6),
    threshold: numberParam(command, "threshold", 0.5),
    seed: numberParam(command, "seed", 1)
  };
  const filters: PixiActorSnapshot["filters"] = { ...actor.filters, signalMask };
  if (!PixiActorFilterSnapshotSchema.safeParse(filters).success) {
    return unsupportedPixiParams(snapshot, command, "signalMask parameters do not satisfy the terminal actor-filter contract");
  }
  if (current && sameSignalMask(current, signalMask)) return emptyReduction(snapshot);
  return updateActor(snapshot, command, target, actor, filters);
}

function updateActor(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand,
  target: string,
  actor: PixiActorSnapshot,
  filters: PixiActorSnapshot["filters"]
): PixiRuntimeCommandReduction {
  const nextActor: PixiActorSnapshot = { ...actor, filters, transition: timingTransition(command) };
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    charactersById: { ...snapshot.charactersById, [target]: nextActor }
  }), "actor-transition", [target]);
}

function sameSignalMask(
  left: NonNullable<PixiActorFilterSnapshot["signalMask"]>,
  right: NonNullable<PixiActorFilterSnapshot["signalMask"]>
): boolean {
  return left.power === right.power && left.bands === right.bands && left.noise === right.noise &&
    left.chroma === right.chroma && left.speed === right.speed && left.threshold === right.threshold &&
    left.seed === right.seed;
}

function validEasing(value: string | undefined): boolean {
  return value === undefined || value === "linear" || value === "easeIn" || value === "easeOut" || value === "easeInOut";
}

function unit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }
