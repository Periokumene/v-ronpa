import { useReducer, type CSSProperties } from "react";
import type { ExplorationOutcome, GameplayState } from "@v-ronpa/gameplay";
import { createGameplayState } from "@v-ronpa/gameplay";
import type { NaviRuntimeState, PlayerPose, WorldMapDef } from "@v-ronpa/contracts";
import {
  confirmFocusedNaviInteraction,
  createInitialNaviState,
  focusNearestNaviInteractable,
  naviReducer
} from "@v-ronpa/navi-director";
import { ScenarioFrame } from "../../ScenarioFrame";
import { verticalSliceEvidence, verticalSliceItem, verticalSliceMaps } from "../../fixtures/verticalSlice";

type PosePresetId = "notebook" | "keycard" | "witness" | "classroom-door" | "empty";

interface PosePreset {
  id: PosePresetId;
  label: string;
  pose: PlayerPose;
}

interface ScenarioState {
  navi: NaviRuntimeState;
  gameplay: GameplayState;
  lastAction: string;
  lastOutcome: string;
}

type ScenarioEvent =
  | { type: "MOVE"; presetId: PosePresetId }
  | { type: "FOCUS_NEAREST" }
  | { type: "CONFIRM_INTERACTION" }
  | { type: "CLOSE_OVERLAY" };

const fallbackMap: WorldMapDef = {
  id: "map:missing",
  name: "Missing Map",
  spawn: [0, 0, 0],
  collisionProxyIds: [],
  interactables: [],
  assetRefs: []
};

const initialMap = verticalSliceMaps.find((map) => map.id === "map:academy-hall") ?? verticalSliceMaps[0] ?? fallbackMap;

const posePresets: PosePreset[] = [
  {
    id: "notebook",
    label: "Notebook",
    pose: { position: [1.2, 1.7, -0.8], yaw: -0.25, pitch: 0 }
  },
  {
    id: "keycard",
    label: "Keycard",
    pose: { position: [2, 1.7, -1.7], yaw: -0.35, pitch: 0 }
  },
  {
    id: "witness",
    label: "Witness",
    pose: { position: [-1.7, 1.7, -1.5], yaw: 0.45, pitch: 0 }
  },
  {
    id: "classroom-door",
    label: "Classroom Door",
    pose: { position: [0, 1.7, -3.7], yaw: 3.14, pitch: 0 }
  },
  {
    id: "empty",
    label: "Empty Space",
    pose: { position: [3.4, 1.7, 3.8], yaw: 0, pitch: 0 }
  }
];

const initialState: ScenarioState = {
  navi: {
    ...createInitialNaviState(initialMap.id),
    playerPose: { position: initialMap.spawn, yaw: 0, pitch: 0 }
  },
  gameplay: createGameplayState(),
  lastAction: "boot",
  lastOutcome: "ready"
};

export function NaviInteractionScenario() {
  const [state, dispatch] = useReducer(scenarioReducer, initialState);
  const activeMap = getActiveMap(state.navi);

  return (
    <ScenarioFrame
      scenarioId="navi-interaction"
      title="Navi Interaction Flow"
      description="Pose-based focus, active confirm, item/evidence grants, map changes, and VN overlay transitions via gameplay plus navi-director."
      status="Interaction helpers wired"
      log={[
        { id: "map", label: "Map", value: activeMap.id },
        { id: "item", label: "Fixture Item", value: verticalSliceItem.id },
        { id: "evidence", label: "Fixture Evidence", value: verticalSliceEvidence.id },
        { id: "substate", label: "Substate", value: state.navi.substate },
        { id: "input", label: "Input Lock", value: state.navi.inputLock },
        { id: "outcome", label: "Last Outcome", value: state.lastOutcome }
      ]}
      commands={
        <>
          {posePresets.map((preset) => (
            <button
              data-testid={`navi-interaction-move-${preset.id}`}
              key={preset.id}
              onClick={() => dispatch({ type: "MOVE", presetId: preset.id })}
              type="button"
            >
              Move: {preset.label}
            </button>
          ))}
          <button data-testid="navi-interaction-focus" onClick={() => dispatch({ type: "FOCUS_NEAREST" })} type="button">
            Focus nearest
          </button>
          <button
            data-testid="navi-interaction-confirm"
            onClick={() => dispatch({ type: "CONFIRM_INTERACTION" })}
            type="button"
          >
            Confirm interact
          </button>
          <button
            data-testid="navi-interaction-close-overlay"
            onClick={() => dispatch({ type: "CLOSE_OVERLAY" })}
            type="button"
          >
            Close overlay
          </button>
        </>
      }
    >
      <div className="harness-placeholder" data-testid="navi-interaction-shell" style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <h1>Navi interaction loop</h1>
            <p>Move to a preset pose, focus the nearest valid interactable, then confirm the active action.</p>
          </div>
          <span className="scene-label scene-label-focus" data-testid="navi-interaction-active-interactable">
            {state.navi.activeInteractableId ?? "none"}
          </span>
        </header>

        <dl style={stateGridStyle}>
          <StateItem label="Active map" testId="navi-interaction-active-map" value={state.navi.activeMapId ?? "none"} />
          <StateItem label="Pose" testId="navi-interaction-pose" value={formatPose(state.navi.playerPose)} />
          <StateItem label="Substate" testId="navi-interaction-substate" value={state.navi.substate} />
          <StateItem label="Input lock" testId="navi-interaction-input-lock" value={state.navi.inputLock} />
          <StateItem label="Overlay script" testId="navi-interaction-overlay-script" value={state.navi.overlayScript ?? "none"} />
          <StateItem label="Last action" testId="navi-interaction-last-action" value={state.lastAction} />
          <StateItem label="Inventory" testId="navi-interaction-inventory" value={formatInventory(state.gameplay)} />
          <StateItem label="Evidence" testId="navi-interaction-evidence" value={formatEvidence(state.gameplay)} />
          <StateItem label="Last outcome" testId="navi-interaction-last-outcome" value={state.lastOutcome} />
        </dl>

        <section aria-label="Active map interactables" style={hotspotListStyle}>
          {activeMap.interactables.map((interactable) => (
            <span
              className={`scene-label${state.navi.activeInteractableId === interactable.id ? " scene-label-focus" : ""}`}
              data-testid={`navi-interaction-hotspot-${interactable.id}`}
              key={interactable.id}
            >
              {interactable.label}: {interactable.id}
            </span>
          ))}
        </section>
      </div>
    </ScenarioFrame>
  );
}

function scenarioReducer(state: ScenarioState, event: ScenarioEvent): ScenarioState {
  if (event.type === "MOVE") {
    const preset = posePresets.find((candidate) => candidate.id === event.presetId);
    if (!preset) return state;
    const moved = naviReducer({ ...state.navi, playerPose: preset.pose }, { type: "FOCUS_INTERACTABLE" });
    return {
      ...state,
      navi: moved,
      lastAction: `move:${preset.id}`,
      lastOutcome: `pose:${formatPose(preset.pose)}`
    };
  }

  if (event.type === "FOCUS_NEAREST") {
    const focus = focusNearestNaviInteractable(state.navi, getActiveMap(state.navi));
    return {
      ...state,
      navi: focus.navi,
      lastAction: "focus-nearest",
      lastOutcome: focus.outcome.type === "focused" ? `focused:${focus.outcome.interactableId}` : "none"
    };
  }

  if (event.type === "CONFIRM_INTERACTION") {
    const resolution = confirmFocusedNaviInteraction(state.navi, getActiveMap(state.navi), state.gameplay, verticalSliceMaps);
    return {
      navi: resolution.navi,
      gameplay: resolution.gameplay,
      lastAction: `confirm:${state.navi.activeInteractableId ?? "none"}`,
      lastOutcome: formatOutcome(resolution.outcome)
    };
  }

  const closed = naviReducer(state.navi, { type: "CLOSE_OVERLAY" });
  return {
    ...state,
    navi: closed,
    lastAction: "close-overlay",
    lastOutcome: `substate:${closed.substate}`
  };
}

function StateItem({ label, testId, value }: { label: string; testId: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </div>
  );
}

function getActiveMap(navi: NaviRuntimeState): WorldMapDef {
  return verticalSliceMaps.find((map) => map.id === navi.activeMapId) ?? initialMap;
}

function formatOutcome(outcome: ExplorationOutcome): string {
  if (outcome.type === "none") return "none";
  if (outcome.type === "grant-item") return `grant-item:${outcome.itemId}:${outcome.quantity}`;
  if (outcome.type === "grant-evidence") return `grant-evidence:${outcome.evidenceId}`;
  if (outcome.type === "start-script") return `start-script:${outcome.script}`;
  if (outcome.type === "change-map") return `change-map:${outcome.mapId}`;
  return `character-state:${outcome.characterId}:${outcome.affinityDelta}`;
}

function formatPose(pose: PlayerPose | undefined): string {
  if (!pose) return "none";
  return `${pose.position.map((value) => value.toFixed(1)).join(",")} yaw:${pose.yaw.toFixed(2)} pitch:${pose.pitch.toFixed(2)}`;
}

function formatInventory(gameplay: GameplayState): string {
  const entries = Object.entries(gameplay.inventory.items);
  if (entries.length === 0) return "empty";
  return entries.map(([itemId, quantity]) => `${itemId}:${quantity}`).join(", ");
}

function formatEvidence(gameplay: GameplayState): string {
  if (gameplay.evidence.ownedEvidenceIds.length === 0) return "empty";
  return gameplay.evidence.ownedEvidenceIds.join(", ");
}

const shellStyle = {
  display: "grid",
  gap: "14px",
  width: "min(860px, 88vw)"
} satisfies CSSProperties;

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "start"
} satisfies CSSProperties;

const stateGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "8px",
  margin: 0
} satisfies CSSProperties;

const hotspotListStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px"
} satisfies CSSProperties;
