import type { GameplayEvent, InteractableDef, PlayerPose, Vector3, WorldMapDef } from "@v-ronpa/contracts";
import { applyGameplayEvent, type GameplayEventResult } from "./events";
import type { GameplayState } from "./state";

export type ExplorationOutcome =
  | { type: "none" }
  | { type: "start-script"; script: string; label?: string }
  | { type: "change-map"; mapId: string; spawnId?: string; pose?: PlayerPose }
  | { type: "grant-item"; itemId: string; quantity: number }
  | { type: "grant-evidence"; evidenceId: string }
  | { type: "character-state"; characterId: string; affinityDelta: number };

export type ExplorationApplicationResult =
  | { type: "none"; owner: "none"; applied: false }
  | { type: "start-script"; owner: "director"; applied: false; script: string; label?: string }
  | { type: "change-map"; owner: "director"; applied: false; mapId: string; spawnId?: string; pose?: PlayerPose }
  | { type: "gameplay-event"; owner: "gameplay"; applied: boolean; event: GameplayEvent; eventResult: GameplayEventResult };

export interface ExplorationApplication {
  state: GameplayState;
  result: ExplorationApplicationResult;
}

export function nearestInteractable(map: WorldMapDef, position: Vector3): InteractableDef | undefined {
  return map.interactables.find((interactable) => distance(interactable.position, position) <= interactable.radius);
}

export function resolveInteractable(interactable: InteractableDef | undefined): ExplorationOutcome {
  if (!interactable) return { type: "none" };
  const { action } = interactable;

  if (action.type === "start-script") {
    return action.label
      ? { type: "start-script", script: action.script, label: action.label }
      : { type: "start-script", script: action.script };
  }

  if (action.type === "grant-item") {
    return { type: "grant-item", itemId: action.itemId, quantity: action.quantity };
  }

  if (action.type === "grant-evidence") {
    return { type: "grant-evidence", evidenceId: action.evidenceId };
  }

  if (action.type === "change-map") {
    return {
      type: "change-map",
      mapId: action.mapId,
      ...(action.spawnId ? { spawnId: action.spawnId } : {}),
      ...(action.pose ? { pose: action.pose } : {})
    };
  }

  return {
    type: "character-state",
    characterId: action.characterId,
    affinityDelta: action.affinityDelta
  };
}

export function applyExplorationOutcome(state: GameplayState, outcome: ExplorationOutcome): ExplorationApplication {
  if (outcome.type === "none") {
    return {
      state,
      result: { type: "none", owner: "none", applied: false }
    };
  }

  if (outcome.type === "start-script") {
    return {
      state,
      result: outcome.label
        ? {
            type: "start-script",
            owner: "director",
            applied: false,
            script: outcome.script,
            label: outcome.label
          }
        : {
            type: "start-script",
            owner: "director",
            applied: false,
            script: outcome.script
          }
    };
  }

  if (outcome.type === "change-map") {
    return {
      state,
      result: {
        type: "change-map",
        owner: "director",
        applied: false,
        mapId: outcome.mapId,
        ...(outcome.spawnId ? { spawnId: outcome.spawnId } : {}),
        ...(outcome.pose ? { pose: outcome.pose } : {})
      }
    };
  }

  const event = explorationOutcomeToGameplayEvent(outcome);
  const applied = applyGameplayEvent(state, event);
  return {
    state: applied.state,
    result: {
      type: "gameplay-event",
      owner: "gameplay",
      applied: applied.result.applied,
      event,
      eventResult: applied.result
    }
  };
}

function explorationOutcomeToGameplayEvent(
  outcome: Exclude<ExplorationOutcome, { type: "none" | "start-script" | "change-map" }>
): GameplayEvent {
  if (outcome.type === "grant-item") {
    return {
      type: "grant-item",
      itemId: outcome.itemId,
      quantity: outcome.quantity
    };
  }

  if (outcome.type === "grant-evidence") {
    return {
      type: "grant-evidence",
      evidenceId: outcome.evidenceId
    };
  }

  return {
    type: "change-character-affinity",
    characterId: outcome.characterId,
    affinityDelta: outcome.affinityDelta
  };
}

function distance(a: Vector3, b: Vector3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
