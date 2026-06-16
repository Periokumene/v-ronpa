import { useMemo, useState } from "react";
import { ExplorationStage3D, type FirstPersonFallbackStatus, type PointerLockStatus } from "@v-ronpa/r3f-adapter";
import type { InteractableDef, PlayerPose, WorldMapDef } from "@v-ronpa/contracts";
import { ScenarioFrame } from "../../ScenarioFrame";
import { verticalSliceMaps } from "../../fixtures/verticalSlice";

export function R3fFirstPersonScenario() {
  const fallbackMap = useMemo<WorldMapDef>(() => createMissingModelMap(verticalSliceMaps[0]), []);
  const scenarioMaps = useMemo(() => [...verticalSliceMaps, fallbackMap], [fallbackMap]);
  const [currentMapId, setCurrentMapId] = useState(verticalSliceMaps[0]?.id ?? fallbackMap.id);
  const [pose, setPose] = useState<PlayerPose | undefined>(undefined);
  const [focused, setFocused] = useState<InteractableDef | undefined>(undefined);
  const [lastAction, setLastAction] = useState("none");
  const [fallback, setFallback] = useState<FirstPersonFallbackStatus>({
    active: true,
    reason: "loading",
    mapId: currentMapId
  });
  const [pointerLock, setPointerLock] = useState<PointerLockStatus>("idle");
  const [resetSignal, setResetSignal] = useState(0);
  const [interactSignal, setInteractSignal] = useState(0);
  const [pointerLockSignal, setPointerLockSignal] = useState(0);
  const map = scenarioMaps.find((candidate) => candidate.id === currentMapId) ?? scenarioMaps[0];

  const interact = (interactable: InteractableDef) => {
    const actionLabel = `${interactable.id}:${interactable.action.type}`;
    setLastAction(actionLabel);

    if (interactable.action.type === "change-map") {
      const targetMapId = interactable.action.mapId;
      const nextMap = verticalSliceMaps.find((candidate) => candidate.id === targetMapId);
      if (nextMap) {
        setCurrentMapId(nextMap.id);
        setFocused(undefined);
      }
    }
  };

  return (
    <ScenarioFrame
      scenarioId="r3f-first-person"
      title="R3F First-Person Exploration"
      description="Reserved entry for R3F work: first-person movement, look, AABB clamp, spawn reset, hotspot focus, interact callback, and model/fallback rendering."
      status="R3F first-person adapter slice with scenario-local evidence"
      log={[
        { id: "map", label: "Map", value: map?.id ?? "missing" },
        { id: "bounds", label: "Walk Bounds", value: map?.walkBounds ? formatBounds(map.walkBounds) : "missing" },
        { id: "focus", label: "Focus", value: focused?.id ?? "none" },
        { id: "last-action", label: "Last Action", value: lastAction }
      ]}
      commands={
        <>
          <button data-testid="r3f-activate-look" type="button" onClick={() => {
            setPointerLock("requested");
            setPointerLockSignal((signal) => signal + 1);
          }}>
            Activate look
          </button>
          <button data-testid="r3f-reset-spawn" type="button" onClick={() => setResetSignal((signal) => signal + 1)}>
            Reset spawn
          </button>
          <button data-testid="r3f-trigger-interact" type="button" onClick={() => setInteractSignal((signal) => signal + 1)}>
            Trigger interact
          </button>
          <button data-testid="r3f-show-fallback" type="button" onClick={() => {
            setCurrentMapId(fallbackMap.id);
            setFocused(undefined);
          }}>
            Missing model
          </button>
        </>
      }
    >
      <div className="scene-stack" data-testid="r3f-first-person-shell">
        <ExplorationStage3D
          {...(map ? { map } : {})}
          cameraMode="first-person"
          inputLock="none"
          {...(focused ? { activeInteractableId: focused.id } : {})}
          resetSignal={resetSignal}
          interactSignal={interactSignal}
          pointerLockRequestSignal={pointerLockSignal}
          pointerLockSelector='[data-testid="r3f-activate-look"]'
          onPoseChange={setPose}
          onFocusChange={setFocused}
          onInteract={interact}
          onFallbackChange={setFallback}
          onPointerLockChange={setPointerLock}
        />
        <section aria-label="R3F first-person readouts" style={readoutPanelStyle}>
          <Readout label="Map" testId="r3f-current-map" value={map?.id ?? "missing"} />
          <Readout label="Pose" testId="r3f-pose-readout" value={pose ? formatPose(pose) : "pending"} />
          <Readout label="Focus" testId="r3f-focused-interactable" value={focused?.id ?? "none"} />
          <Readout label="Action" testId="r3f-last-action" value={lastAction} />
          <Readout label="Fallback" testId="r3f-fallback-status" value={formatFallback(fallback)} />
          <Readout label="Pointer" testId="r3f-pointer-lock-status" value={pointerLock} />
        </section>
      </div>
    </ScenarioFrame>
  );
}

function createMissingModelMap(source: WorldMapDef | undefined): WorldMapDef {
  const base: WorldMapDef = source ?? {
    id: "map:missing-model-source",
    name: "Missing Model Source",
    spawn: [0, 1.7, 3],
    walkBounds: {
      min: [-3, 0, -3],
      max: [3, 2.6, 3]
    },
    collisionProxyIds: [],
    interactables: [],
    assetRefs: []
  };

  return {
    ...base,
    id: "map:r3f-missing-model",
    name: "R3F Missing Model Fallback",
    assetRefs: [{ id: "model:r3f-missing", kind: "glb", uri: "/harness/models/r3f-missing-model.gltf", tags: ["harness"] }]
  };
}

function Readout({ label, testId, value }: { label: string; testId: string; value: string }) {
  return (
    <p style={readoutRowStyle}>
      <span style={readoutLabelStyle}>{label}</span>
      <strong data-testid={testId} style={readoutValueStyle}>
        {value}
      </strong>
    </p>
  );
}

function formatPose(pose: PlayerPose): string {
  return JSON.stringify({
    x: round(pose.position[0]),
    y: round(pose.position[1]),
    z: round(pose.position[2]),
    yaw: round(pose.yaw),
    pitch: round(pose.pitch)
  });
}

function formatBounds(bounds: NonNullable<WorldMapDef["walkBounds"]>): string {
  return `${bounds.min.join(",")} -> ${bounds.max.join(",")}`;
}

function formatFallback(status: FirstPersonFallbackStatus): string {
  const active = status.active ? "active" : "loaded";
  return `${active}:${status.reason}:${status.mapId ?? "map:unknown"}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

const readoutPanelStyle = {
  position: "absolute",
  left: 16,
  bottom: 16,
  zIndex: 6,
  width: "min(360px, calc(100vw - 32px))",
  display: "grid",
  gap: 4,
  padding: 10,
  border: "1px solid rgba(110, 231, 216, 0.38)",
  borderRadius: 8,
  background: "rgba(9, 14, 22, 0.78)",
  color: "#f7fbff",
  fontSize: 12,
  lineHeight: 1.35,
  pointerEvents: "none"
} as const;

const readoutRowStyle = {
  display: "grid",
  gridTemplateColumns: "76px minmax(0, 1fr)",
  gap: 8,
  margin: 0
} as const;

const readoutLabelStyle = {
  color: "#8fd8ff"
} as const;

const readoutValueStyle = {
  minWidth: 0,
  overflowWrap: "anywhere",
  fontWeight: 600
} as const;
