import type { NaviRuntimeState, NaviSubstate, WorldMapDef } from "@v-ronpa/contracts";
import {
  changeCharacterAffinity,
  grantItem,
  type ExplorationOutcome,
  type GameplayState,
  resolveInteractable
} from "@v-ronpa/gameplay";

export type NaviEvent =
  | { type: "ENTER_WALK"; mapId?: string }
  | { type: "FOCUS_INTERACTABLE"; interactableId?: string }
  | { type: "OPEN_INVENTORY" }
  | { type: "CLOSE_OVERLAY" }
  | { type: "START_VN2D"; script: string; interactableId?: string }
  | { type: "START_EVENT"; script?: string; interactableId?: string };

export interface NaviInteractionResolution {
  navi: NaviRuntimeState;
  gameplay: GameplayState;
  outcome: ExplorationOutcome;
}

export function createInitialNaviState(activeMapId?: string): NaviRuntimeState {
  const state: NaviRuntimeState = {
    substate: "walk",
    inputLock: "none"
  };
  if (activeMapId) state.activeMapId = activeMapId;
  return state;
}

export function naviReducer(state: NaviRuntimeState, event: NaviEvent): NaviRuntimeState {
  if (event.type === "ENTER_WALK" || event.type === "CLOSE_OVERLAY") {
    return withOptionalFields(
      {
        substate: "walk",
        inputLock: "none"
      },
      event.type === "ENTER_WALK" ? event.mapId : state.activeMapId,
      undefined
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

  if (event.type === "START_VN2D") {
    return withOverlay(state, "vn2d-overlay", event.script, event.interactableId);
  }

  return withOverlay(state, "event", event.script, event.interactableId);
}

export function resolveNaviInteractable(
  state: NaviRuntimeState,
  map: WorldMapDef,
  gameplay: GameplayState,
  interactableId: string
): NaviInteractionResolution {
  const interactable = map.interactables.find((candidate) => candidate.id === interactableId);
  const outcome = resolveInteractable(interactable);

  if (outcome.type === "grant-item") {
    return {
      navi: naviReducer(state, { type: "FOCUS_INTERACTABLE", interactableId }),
      gameplay: grantItem(gameplay, outcome.itemId, outcome.quantity),
      outcome
    };
  }

  if (outcome.type === "character-state") {
    return {
      navi: naviReducer(state, { type: "FOCUS_INTERACTABLE", interactableId }),
      gameplay: changeCharacterAffinity(gameplay, outcome.characterId, outcome.affinityDelta),
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

  return {
    navi: naviReducer(state, { type: "FOCUS_INTERACTABLE", interactableId }),
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
