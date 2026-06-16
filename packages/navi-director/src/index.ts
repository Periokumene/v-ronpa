import type { InteractableDef, NaviRuntimeState, NaviSubstate, PlayerPose, WorldMapDef } from "@v-ronpa/contracts";
import {
  applyExplorationOutcome,
  type ExplorationOutcome,
  type GameplayState,
  nearestInteractable,
  resolveInteractable
} from "@v-ronpa/gameplay";

export type NaviEvent =
  | { type: "ENTER_WALK"; mapId?: string }
  | { type: "FOCUS_INTERACTABLE"; interactableId?: string }
  | { type: "OPEN_INVENTORY" }
  | { type: "CLOSE_OVERLAY" }
  | { type: "CHANGE_MAP"; mapId: string; pose?: PlayerPose }
  | { type: "START_VN2D"; script: string; interactableId?: string }
  | { type: "START_EVENT"; script?: string; interactableId?: string };

export interface NaviInteractionResolution {
  navi: NaviRuntimeState;
  gameplay: GameplayState;
  outcome: ExplorationOutcome;
}

export type NaviFocusOutcome = { type: "focused"; interactableId: string } | { type: "none" };

export interface NaviFocusResolution {
  navi: NaviRuntimeState;
  outcome: NaviFocusOutcome;
  interactable?: InteractableDef;
}

export type WorldMapSource = readonly WorldMapDef[] | Record<string, WorldMapDef>;

export function createInitialNaviState(activeMapId?: string): NaviRuntimeState {
  const state: NaviRuntimeState = {
    substate: "walk",
    inputLock: "none"
  };
  if (activeMapId) state.activeMapId = activeMapId;
  return state;
}

function canAcceptNaviWalkInteraction(state: NaviRuntimeState): boolean {
  return state.substate === "walk" && state.inputLock === "none";
}

export function naviReducer(state: NaviRuntimeState, event: NaviEvent): NaviRuntimeState {
  if (event.type === "ENTER_WALK") {
    return withOptionalFields(
      {
        ...state,
        substate: "walk",
        inputLock: "none"
      },
      event.mapId ?? state.activeMapId,
      state.activeInteractableId
    );
  }

  if (event.type === "CLOSE_OVERLAY") {
    return withOptionalFields(
      {
        ...state,
        substate: "walk",
        inputLock: "none"
      },
      state.activeMapId,
      state.activeInteractableId
    );
  }

  if (event.type === "FOCUS_INTERACTABLE") {
    return withOptionalFields(
      {
        ...state,
        substate: "walk",
        inputLock: "none"
      },
      state.activeMapId,
      event.interactableId
    );
  }

  if (event.type === "OPEN_INVENTORY") {
    return withOptionalFields(
      {
        ...state,
        substate: "inventory",
        inputLock: "inventory"
      },
      state.activeMapId,
      state.activeInteractableId
    );
  }

  if (event.type === "CHANGE_MAP") {
    return withOptionalFields(
      {
        ...state,
        ...(event.pose ? { playerPose: event.pose } : {}),
        substate: "walk",
        inputLock: "none"
      },
      event.mapId,
      undefined
    );
  }

  if (event.type === "START_VN2D") {
    return withOverlay(state, "vn2d-overlay", event.script, event.interactableId);
  }

  return withOverlay(state, "event", event.script, event.interactableId);
}

export function focusNearestNaviInteractable(state: NaviRuntimeState, map: WorldMapDef): NaviFocusResolution {
  if (!canAcceptNaviWalkInteraction(state)) {
    return {
      navi: state,
      outcome: { type: "none" }
    };
  }

  if (!state.playerPose) {
    return {
      navi: state,
      outcome: { type: "none" }
    };
  }

  const interactable = nearestInteractable(map, state.playerPose.position);
  if (!interactable) {
    return {
      navi: naviReducer(state, { type: "FOCUS_INTERACTABLE" }),
      outcome: { type: "none" }
    };
  }

  return {
    navi: naviReducer(state, { type: "FOCUS_INTERACTABLE", interactableId: interactable.id }),
    outcome: { type: "focused", interactableId: interactable.id },
    interactable
  };
}

export function confirmFocusedNaviInteraction(
  state: NaviRuntimeState,
  map: WorldMapDef,
  gameplay: GameplayState,
  maps?: WorldMapSource
): NaviInteractionResolution {
  if (!canAcceptNaviWalkInteraction(state)) {
    return {
      navi: state,
      gameplay,
      outcome: { type: "none" }
    };
  }

  if (!state.activeInteractableId) {
    return {
      navi: state,
      gameplay,
      outcome: { type: "none" }
    };
  }

  return resolveNaviInteractable(state, map, gameplay, state.activeInteractableId, maps);
}

export function resolveNaviInteractable(
  state: NaviRuntimeState,
  map: WorldMapDef,
  gameplay: GameplayState,
  interactableId: string,
  maps?: WorldMapSource
): NaviInteractionResolution {
  if (!canAcceptNaviWalkInteraction(state)) {
    return {
      navi: state,
      gameplay,
      outcome: { type: "none" }
    };
  }

  const interactable = map.interactables.find((candidate) => candidate.id === interactableId);
  if (!interactable) {
    return {
      navi: state,
      gameplay,
      outcome: { type: "none" }
    };
  }

  const outcome = resolveInteractable(interactable);
  const focused = naviReducer(state, { type: "FOCUS_INTERACTABLE", interactableId });
  const applied = applyExplorationOutcome(gameplay, outcome);

  if (applied.result.owner === "gameplay") {
    return {
      navi: focused,
      gameplay: applied.state,
      outcome
    };
  }

  if (outcome.type === "start-script") {
    return {
      navi: naviReducer(state, { type: "START_VN2D", script: outcome.script, interactableId }),
      gameplay,
      outcome
    };
  }

  if (outcome.type === "change-map") {
    const pose = resolveChangeMapPose(outcome, map, maps);
    return {
      navi: naviReducer(focused, { type: "CHANGE_MAP", mapId: outcome.mapId, ...(pose ? { pose } : {}) }),
      gameplay,
      outcome
    };
  }

  return {
    navi: focused,
    gameplay,
    outcome
  };
}

function withOverlay(
  state: NaviRuntimeState,
  substate: Extract<NaviSubstate, "vn2d-overlay" | "event">,
  script: string | undefined,
  interactableId: string | undefined
): NaviRuntimeState {
  const next: NaviRuntimeState = {
    ...state,
    substate,
    inputLock: "dialog"
  };
  if (script) next.overlayScript = script;
  if (interactableId) next.activeInteractableId = interactableId;
  return next;
}

function resolveChangeMapPose(
  outcome: Extract<ExplorationOutcome, { type: "change-map" }>,
  currentMap: WorldMapDef,
  maps: WorldMapSource | undefined
): PlayerPose | undefined {
  if (outcome.pose) return outcome.pose;
  const targetMap = findWorldMap(outcome.mapId, maps) ?? (currentMap.id === outcome.mapId ? currentMap : undefined);
  if (!targetMap) return undefined;
  return {
    position: targetMap.spawn,
    yaw: 0,
    pitch: 0
  };
}

function findWorldMap(mapId: string, maps: WorldMapSource | undefined): WorldMapDef | undefined {
  if (!maps) return undefined;
  if (isWorldMapArray(maps)) return maps.find((map) => map.id === mapId);
  return maps[mapId];
}

function isWorldMapArray(maps: WorldMapSource): maps is readonly WorldMapDef[] {
  return Array.isArray(maps);
}

function withOptionalFields(
  state: NaviRuntimeState,
  activeMapId: string | undefined,
  activeInteractableId: string | undefined
): NaviRuntimeState {
  const next: NaviRuntimeState = { ...state };
  delete next.overlayScript;
  delete next.activeMapId;
  delete next.activeInteractableId;
  if (activeMapId) next.activeMapId = activeMapId;
  if (activeInteractableId) next.activeInteractableId = activeInteractableId;
  return next;
}
