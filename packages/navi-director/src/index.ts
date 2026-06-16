import type {
  InteractableDef,
  NaviInteractionConfirmRequest,
  NaviInteractionSensorReport,
  NaviInteractionView,
  NaviRuntimeState,
  NaviSubstate,
  PlayerPose,
  Vector3,
  WorldMapDef
} from "@v-ronpa/contracts";
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

export interface NaviSensorFocusResolution extends NaviFocusResolution {
  report: NaviInteractionSensorReport;
  view: NaviInteractionView;
}

export type WorldMapSource = readonly WorldMapDef[] | Record<string, WorldMapDef>;

const SENSOR_FACING_THRESHOLD = 0.72;

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

function interactionBlockedReason(state: NaviRuntimeState): NaviInteractionView["blockedReason"] {
  if (state.substate !== "walk") return "wrong-substate";
  if (state.inputLock !== "none") return "input-lock";
  if (!state.activeInteractableId && !state.playerPose) return "missing-pose";
  if (!state.activeInteractableId) return "no-target";
  return undefined;
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

export function createNaviInteractionView(state: NaviRuntimeState): NaviInteractionView {
  const blockedReason = interactionBlockedReason(state);
  const view: NaviInteractionView = {
    canConfirm: !blockedReason
  };
  if (state.activeInteractableId) view.activeInteractableId = state.activeInteractableId;
  if (blockedReason) view.blockedReason = blockedReason;
  return view;
}

export function focusNaviInteractionFromSensorReport(
  state: NaviRuntimeState,
  map: WorldMapDef,
  report: NaviInteractionSensorReport
): NaviSensorFocusResolution {
  const reportedState: NaviRuntimeState = {
    ...state,
    activeMapId: report.mapId,
    playerPose: report.pose
  };
  const focused = focusNaviInteractableFromSensor(reportedState, map, report);
  return {
    ...focused,
    report,
    view: createNaviInteractionView(focused.navi)
  };
}

function focusNaviInteractableFromSensor(
  state: NaviRuntimeState,
  map: WorldMapDef,
  report: NaviInteractionSensorReport
): NaviFocusResolution {
  if (!canAcceptNaviWalkInteraction(state)) {
    return {
      navi: state,
      outcome: { type: "none" }
    };
  }

  const interactable = selectInteractableFromSensorReport(map, report);
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

export function createNaviInteractionConfirmRequest(
  state: NaviRuntimeState,
  mapId = state.activeMapId
): NaviInteractionConfirmRequest | undefined {
  if (!mapId) return undefined;
  return {
    mapId,
    ...(state.playerPose ? { pose: state.playerPose } : {})
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

function selectInteractableFromSensorReport(
  map: WorldMapDef,
  report: NaviInteractionSensorReport
): InteractableDef | undefined {
  let selected: { interactable: InteractableDef; score: number } | undefined;
  for (const interactable of map.interactables) {
    const score = sensorCandidateScore(interactable, report);
    if (score === undefined) continue;
    if (!selected || score > selected.score) {
      selected = { interactable, score };
    }
  }

  return selected?.interactable;
}

function sensorCandidateScore(interactable: InteractableDef, report: NaviInteractionSensorReport): number | undefined {
  const distance = vectorDistance(interactable.position, report.pose.position);
  if (distance > interactable.radius) return undefined;

  const proximityScore = 1 - distance / interactable.radius;
  if (!report.facing) return proximityScore;

  const facingScore = facingScoreToInteractable(report.pose.position, report.facing, interactable.position);
  if (facingScore === undefined || facingScore < SENSOR_FACING_THRESHOLD) return undefined;

  return proximityScore + facingScore;
}

function facingScoreToInteractable(position: Vector3, facing: Vector3, target: Vector3): number | undefined {
  const facing2d = normalize2d([facing[0], facing[2]]);
  const targetDirection = normalize2d([target[0] - position[0], target[2] - position[2]]);
  if (!targetDirection) return 1;
  if (!facing2d) return undefined;
  return facing2d[0] * targetDirection[0] + facing2d[1] * targetDirection[1];
}

function normalize2d(vector: [number, number]): [number, number] | undefined {
  const length = Math.hypot(vector[0], vector[1]);
  if (length <= 0.001) return undefined;
  return [vector[0] / length, vector[1] / length];
}

function vectorDistance(a: Vector3, b: Vector3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
