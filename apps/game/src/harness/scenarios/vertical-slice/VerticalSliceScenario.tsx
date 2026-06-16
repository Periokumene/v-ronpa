import { useCallback, useMemo, useState, type CSSProperties } from "react";
import type {
  NaviInteractionSensorReport,
  NaviRuntimeState,
  PlayerPose,
  PresentationCommand,
  StoryEffect,
  WorldMapDef
} from "@v-ronpa/contracts";
import { createGameplayState, applyGameplayEvent, type ExplorationOutcome, type GameplayState } from "@v-ronpa/gameplay";
import { parseScenario } from "@v-ronpa/nani-parser";
import {
  confirmFocusedNaviInteraction,
  createInitialNaviState,
  createNaviInteractionView,
  focusNaviInteractionFromSensorReport,
  naviReducer
} from "@v-ronpa/navi-director";
import { ExplorationStage3D, type FirstPersonInteractRequest } from "@v-ronpa/r3f-adapter";
import { advanceToNextStop, chooseStoryOption, createInitialStoryState, selectCurrentStoryLine } from "@v-ronpa/story-engine";
import { InspectorLite, VnDialogSurface } from "@v-ronpa/ui-kit";
import { PixiLayer } from "../../../PixiLayer";
import { verticalSliceEvidence, verticalSliceItem, verticalSliceMaps, verticalSliceScript } from "../../fixtures/verticalSlice";
import { defaultHarnessInputBindings, useKeyboardInputActions } from "../../inputActions";
import { useFirstPersonExplorationBridge } from "../../useFirstPersonExplorationBridge";

type PosePresetId = "spawn" | "notebook" | "keycard" | "door" | "hall-door" | "witness" | "empty";

interface PosePreset {
  id: PosePresetId;
  label: string;
  mapId: string;
  pose: PlayerPose;
}

interface StoryRuntime {
  state: ReturnType<typeof createInitialStoryState>;
  active: boolean;
}

const posePresets: PosePreset[] = [
  { id: "spawn", label: "Spawn", mapId: "map:academy-hall", pose: { position: [0, 1.7, 4], yaw: 0, pitch: 0 } },
  { id: "notebook", label: "Notebook", mapId: "map:academy-hall", pose: { position: [1.2, 1.7, -0.8], yaw: -0.25, pitch: 0 } },
  { id: "keycard", label: "Keycard", mapId: "map:academy-hall", pose: { position: [2, 1.7, -1.7], yaw: -0.35, pitch: 0 } },
  { id: "door", label: "Classroom Door", mapId: "map:academy-hall", pose: { position: [0, 1.7, -3.7], yaw: 3.14, pitch: 0 } },
  { id: "hall-door", label: "Hall Door", mapId: "map:classroom", pose: { position: [0, 1.7, 3.1], yaw: 0, pitch: 0 } },
  { id: "witness", label: "Witness", mapId: "map:academy-hall", pose: { position: [-1.7, 1.7, -1.5], yaw: 0.45, pitch: 0 } },
  { id: "empty", label: "Empty", mapId: "map:academy-hall", pose: { position: [3.4, 1.7, 3.8], yaw: 0, pitch: 0 } }
];

const initialMap = verticalSliceMaps[0] ?? createFallbackMap();

export function VerticalSliceScenario() {
  const parsed = useMemo(
    () => parseScenario({ sourceText: verticalSliceScript, scriptPath: "harness/vertical-slice.nani" }),
    []
  );
  const [navi, setNavi] = useState<NaviRuntimeState>(() => ({
    ...createInitialNaviState(initialMap.id),
    playerPose: { position: initialMap.spawn, yaw: 0, pitch: 0 }
  }));
  const [gameplay, setGameplay] = useState<GameplayState>(() => createGameplayState());
  const [storyRuntime, setStoryRuntime] = useState<StoryRuntime>(() => ({
    state: createInitialStoryState(parsed.scenario),
    active: false
  }));
  const [lastOutcome, setLastOutcome] = useState("spawn");
  const [lastAction, setLastAction] = useState("boot");
  const [storySession, setStorySession] = useState(0);
  const activeMap = getActiveMap(navi);
  const currentCameraMode = navi.inputLock === "none" ? "first-person" : "locked";
  const inputActionsRef = useKeyboardInputActions(defaultHarnessInputBindings, "navi", navi.inputLock === "none");
  const interactionView = createNaviInteractionView(navi);
  const currentLine = storyRuntime.active ? selectCurrentStoryLine(storyRuntime.state) : undefined;
  const pixiCommands = storyRuntime.state.presentationCommands.filter((command) => command.type !== "print");

  function resetSlice() {
    const spawnPose: PlayerPose = { position: initialMap.spawn, yaw: 0, pitch: 0 };
    setNavi({
      ...createInitialNaviState(initialMap.id),
      playerPose: spawnPose
    });
    setGameplay(createGameplayState());
    setStoryRuntime({ state: createInitialStoryState(parsed.scenario), active: false });
    setLastOutcome("reset");
    setLastAction("reset");
    firstPersonBridge.issuePoseCommand(spawnPose);
    setStorySession((session) => session + 1);
  }

  function moveToPreset(id: PosePresetId) {
    const preset = posePresets.find((candidate) => candidate.id === id);
    if (!preset) return;
    const map = verticalSliceMaps.find((candidate) => candidate.id === preset.mapId) ?? activeMap;
    const seeded = navi.activeMapId === preset.mapId ? navi : naviReducer(navi, { type: "ENTER_WALK", mapId: preset.mapId });
    const focused = focusNaviInteractionFromSensorReport(seeded, map, {
      mapId: preset.mapId,
      pose: preset.pose
    });
    setNavi(focused.navi);
    firstPersonBridge.issuePoseCommand(preset.pose);
    setLastAction(`move:${id}`);
    setLastOutcome(focused.view.activeInteractableId ? `focused:${focused.view.activeInteractableId}` : focused.view.blockedReason ?? "none");
  }

  const recordSensorReport = useCallback((report: NaviInteractionSensorReport) => {
    setNavi((current) => {
      const map = verticalSliceMaps.find((candidate) => candidate.id === report.mapId) ?? getActiveMap(current);
      return focusNaviInteractionFromSensorReport(current, map, report).navi;
    });
  }, []);

  const confirmInteraction = useCallback(
    (request?: FirstPersonInteractRequest) => {
      const report = createSensorReportFromRequest(request);
      const confirmationMap = report
        ? verticalSliceMaps.find((candidate) => candidate.id === report.mapId) ?? activeMap
        : activeMap;
      const confirmationNavi = report
        ? focusNaviInteractionFromSensorReport(navi, confirmationMap, report).navi
        : navi;
      const resolution = confirmFocusedNaviInteraction(confirmationNavi, confirmationMap, gameplay, verticalSliceMaps);

      setNavi(resolution.navi);
      setGameplay(resolution.gameplay);
      setLastAction(`confirm:${confirmationNavi.activeInteractableId ?? "none"}`);
      setLastOutcome(formatOutcome(resolution.outcome));
      if (resolution.outcome.type === "change-map" && resolution.navi.playerPose) {
        firstPersonBridge.issuePoseCommand(resolution.navi.playerPose);
      }
      if (resolution.outcome.type === "start-script") startStoryOverlay();
    },
    [activeMap, gameplay, navi]
  );
  const firstPersonBridge = useFirstPersonExplorationBridge({
    map: activeMap,
    cameraMode: currentCameraMode,
    inputLock: navi.inputLock,
    inputActionsRef,
    ...(navi.activeInteractableId ? { activeInteractableId: navi.activeInteractableId } : {}),
    onSensorReport: recordSensorReport,
    onInteractRequest: confirmInteraction
  });

  function startStoryOverlay() {
    const initial = createInitialStoryState(parsed.scenario);
    const advanced = advanceToNextStop(initial, parsed.scenario);
    setStorySession((session) => session + 1);
    setStoryRuntime({ state: applyStoryEffects(advanced.state, initial), active: true });
  }

  function advanceStory() {
    const current = storyRuntime.state;
    const advanced = advanceToNextStop(current, parsed.scenario);
    const nextStory = applyStoryEffects(advanced.state, current);
    setStoryRuntime({ state: nextStory, active: !nextStory.ended });
    if (nextStory.ended) {
      setNavi((currentNavi) => naviReducer(currentNavi, { type: "CLOSE_OVERLAY" }));
      setLastAction("story:end");
      setLastOutcome("overlay-closed");
    } else {
      setLastAction("story:advance");
      setLastOutcome(nextStory.pendingChoices.length > 0 ? "choices" : "line");
    }
  }

  function chooseStory(index: number) {
    const current = storyRuntime.state;
    const chosen = chooseStoryOption(current, parsed.scenario, index);
    const advanced = advanceToNextStop(chosen.state, parsed.scenario);
    const nextStory = applyStoryEffects(advanced.state, current);
    setStoryRuntime({ state: nextStory, active: true });
    setLastAction(`choice:${index}`);
    setLastOutcome(nextStory.variables.route ? `route:${String(nextStory.variables.route)}` : "choice");
  }

  function applyStoryEffects(nextStory: StoryRuntime["state"], previousStory: StoryRuntime["state"]) {
    const newEffects = nextStory.effects.slice(previousStory.effects.length);
    if (newEffects.length > 0) {
      setGameplay((currentGameplay) => applyGameplayEffects(currentGameplay, newEffects));
    }
    return nextStory;
  }

  return (
    <main className="app-shell app-shell-harness">
      <section className="playfield" data-testid="playfield">
        <div className="scene-stack" data-testid="vertical-slice-shell">
          <ExplorationStage3D {...firstPersonBridge.explorationStageProps} />
          <PixiLayer key={storySession} commands={pixiCommands} visible={storyRuntime.active} />
          {storyRuntime.active && currentLine ? (
            <VnDialogSurface
              {...(currentLine.speaker ? { speaker: currentLine.speaker } : {})}
              text={currentLine.text}
              choices={storyRuntime.state.pendingChoices}
              ended={storyRuntime.state.ended}
              onAdvance={advanceStory}
              onChoice={chooseStory}
              onCancel={() => {
                setNavi((currentNavi) => naviReducer(currentNavi, { type: "CLOSE_OVERLAY" }));
                setStoryRuntime((current) => ({ ...current, active: false }));
                setLastAction("dialog:cancel");
                setLastOutcome("overlay-closed");
              }}
            />
          ) : null}
        </div>
        <div className="hud harness-hud">
          <div className="objective-chip">
            <span data-testid="harness-scenario-id">vertical-slice</span>
            <strong data-testid="harness-scenario-title">Navi To VN Vertical Slice</strong>
            <small data-testid="harness-status">{storyRuntime.active ? "VN overlay" : "Navi walk"}</small>
          </div>
          <div className="command-strip" data-testid="harness-commands">
            {posePresets.map((preset) => (
              <button
                key={preset.id}
                data-testid={`vertical-slice-move-${preset.id}`}
                type="button"
                onClick={() => moveToPreset(preset.id)}
              >
                Move: {preset.label}
              </button>
            ))}
            <button {...firstPersonBridge.pointerLockTriggerProps} data-testid="vertical-slice-pointer-lock">
              Mouse look
            </button>
            <button data-testid="vertical-slice-confirm" type="button" onClick={firstPersonBridge.requestInteract}>
              Confirm
            </button>
            <button data-testid="vertical-slice-advance" type="button" onClick={advanceStory} disabled={!storyRuntime.active}>
              Advance
            </button>
            <button data-testid="vertical-slice-reset" type="button" onClick={resetSlice}>
              Reset
            </button>
          </div>
        </div>
        <section aria-label="Vertical slice readout" style={readoutStyle}>
          <Readout label="Map" testId="vertical-slice-map" value={navi.activeMapId ?? "none"} />
          <Readout label="Substate" testId="vertical-slice-substate" value={navi.substate} />
          <Readout label="Input" testId="vertical-slice-input-lock" value={navi.inputLock} />
          <Readout label="Pointer" testId="vertical-slice-pointer-lock-status" value={firstPersonBridge.pointerLockStatus} />
          <Readout label="Active" testId="vertical-slice-active-interactable" value={navi.activeInteractableId ?? "none"} />
          <Readout label="Can" testId="vertical-slice-can-confirm" value={String(interactionView.canConfirm)} />
          <Readout label="Block" testId="vertical-slice-blocked-reason" value={interactionView.blockedReason ?? "none"} />
          <Readout label="Inventory" testId="vertical-slice-inventory" value={formatInventory(gameplay)} />
          <Readout label="Evidence" testId="vertical-slice-evidence" value={formatEvidence(gameplay)} />
          <Readout label="Route" testId="vertical-slice-route" value={String(storyRuntime.state.variables.route ?? "none")} />
          <Readout label="Outcome" testId="vertical-slice-last-outcome" value={lastOutcome} />
          <Readout label="Action" testId="vertical-slice-last-action" value={lastAction} />
        </section>
      </section>
      <InspectorLite
        mode="navi"
        {...(navi.activeMapId ? { detail: navi.activeMapId } : {})}
        inputLock={navi.inputLock}
        naviSubstate={navi.substate}
        scriptPointer={storyRuntime.state.instructionPointer}
        variables={storyRuntime.state.variables}
        inventoryItems={gameplay.inventory.items}
        evidenceIds={gameplay.evidence.ownedEvidenceIds}
        presentationCommands={storyRuntime.state.presentationCommands}
      />
    </main>
  );
}

function applyGameplayEffects(gameplay: GameplayState, effects: StoryEffect[]): GameplayState {
  return effects.reduce((current, effect) => {
    if (effect.type !== "gameplay-event") return current;
    return applyGameplayEvent(current, effect.event).state;
  }, gameplay);
}

function createSensorReportFromRequest(request: FirstPersonInteractRequest | undefined): NaviInteractionSensorReport | undefined {
  if (!request?.mapId) return undefined;
  return {
    mapId: request.mapId,
    pose: request.pose,
    ...(request.facing ? { facing: request.facing } : {})
  };
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

function formatInventory(gameplay: GameplayState): string {
  const entries = Object.entries(gameplay.inventory.items);
  return entries.length > 0 ? entries.map(([id, quantity]) => `${id}:${quantity}`).join(", ") : "empty";
}

function formatEvidence(gameplay: GameplayState): string {
  return gameplay.evidence.ownedEvidenceIds.length > 0 ? gameplay.evidence.ownedEvidenceIds.join(", ") : "empty";
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

function createFallbackMap(): WorldMapDef {
  return {
    id: "map:missing",
    name: "Missing",
    spawn: [0, 1.7, 4],
    collisionProxyIds: [],
    interactables: [],
    assetRefs: []
  };
}

const readoutStyle = {
  position: "absolute",
  left: 16,
  bottom: 16,
  zIndex: 6,
  width: "min(430px, calc(100vw - 32px))",
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
} satisfies CSSProperties;

const readoutRowStyle = {
  display: "grid",
  gridTemplateColumns: "82px minmax(0, 1fr)",
  gap: 8,
  margin: 0
} satisfies CSSProperties;

const readoutLabelStyle = {
  color: "#8fd8ff"
} satisfies CSSProperties;

const readoutValueStyle = {
  minWidth: 0,
  overflowWrap: "anywhere",
  fontWeight: 600
} satisfies CSSProperties;
