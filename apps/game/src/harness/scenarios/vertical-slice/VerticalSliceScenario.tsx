import { useCallback, useMemo, useState, type ButtonHTMLAttributes } from "react";
import type {
  NaviInteractionSensorReport,
  NaviRuntimeState,
  PlayerPose,
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
import { advanceToNextStop, chooseStoryOption, createInitialStoryState } from "@v-ronpa/story-engine";
import { InspectorLite } from "@v-ronpa/ui-kit";
import { VnRuntimeDispatcher, selectVnNewEffectsForTarget } from "../../../VnRuntimeDispatcher";
import { verticalSliceEvidence, verticalSliceItem, verticalSliceMaps, verticalSliceScript } from "../../fixtures/verticalSlice";
import { defaultHarnessInputBindings, useKeyboardInputActions } from "../../inputActions";
import { useFirstPersonExplorationBridge } from "../../useFirstPersonExplorationBridge";

type PosePresetId = "spawn" | "notebook" | "keycard" | "door" | "hall-door" | "witness" | "empty";
type DebugTabId = "runtime" | "inspector";

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
  { id: "spawn", label: "出生点", mapId: "map:academy-hall", pose: { position: [0, 1.7, 4], yaw: 0, pitch: 0 } },
  { id: "notebook", label: "笔记本", mapId: "map:academy-hall", pose: { position: [1.2, 1.7, -0.8], yaw: -0.25, pitch: 0 } },
  { id: "keycard", label: "门禁卡", mapId: "map:academy-hall", pose: { position: [2, 1.7, -1.7], yaw: -0.35, pitch: 0 } },
  { id: "door", label: "教室门", mapId: "map:academy-hall", pose: { position: [0, 1.7, -3.7], yaw: 3.14, pitch: 0 } },
  { id: "hall-door", label: "走廊门", mapId: "map:classroom", pose: { position: [0, 1.7, 3.1], yaw: 0, pitch: 0 } },
  { id: "witness", label: "证人", mapId: "map:academy-hall", pose: { position: [-1.7, 1.7, -1.5], yaw: 0.45, pitch: 0 } },
  { id: "empty", label: "空位", mapId: "map:academy-hall", pose: { position: [3.4, 1.7, 3.8], yaw: 0, pitch: 0 } }
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
  const [activeDebugTab, setActiveDebugTab] = useState<DebugTabId>("runtime");
  const activeMap = getActiveMap(navi);
  const currentCameraMode = navi.inputLock === "none" ? "first-person" : "locked";
  const inputActionsRef = useKeyboardInputActions(defaultHarnessInputBindings, "navi", navi.inputLock === "none");
  const interactionView = createNaviInteractionView(navi);

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
    const gameplayEffects = selectVnNewEffectsForTarget(nextStory, previousStory, "gameplay");
    if (gameplayEffects.length > 0) {
      setGameplay((currentGameplay) => applyGameplayEffects(currentGameplay, gameplayEffects));
    }
    return nextStory;
  }

  return (
    <main className="app-shell app-shell-harness">
      <section className="playfield" data-testid="playfield">
        <div className="scene-stack" data-testid="vertical-slice-shell">
          <ExplorationStage3D {...firstPersonBridge.explorationStageProps} />
          <VnRuntimeDispatcher
            active={storyRuntime.active}
            story={storyRuntime.state}
            storySession={storySession}
            formatSpeaker={displayStorySpeaker}
            onAdvance={advanceStory}
            onChoice={chooseStory}
            onCancel={() => {
              setNavi((currentNavi) => naviReducer(currentNavi, { type: "CLOSE_OVERLAY" }));
              setStoryRuntime((current) => ({ ...current, active: false }));
              setLastAction("dialog:cancel");
              setLastOutcome("overlay-closed");
            }}
          />
        </div>
        <div className="hud harness-hud vertical-slice-hud">
          <div className="objective-chip">
            <span data-testid="harness-scenario-id">vertical-slice</span>
            <strong data-testid="harness-scenario-title">Navi To VN Vertical Slice</strong>
            <small data-testid="harness-status">{storyRuntime.active ? "视觉小说覆盖层" : "Navi 探索"}</small>
          </div>
        </div>
      </section>
      <aside className="vertical-slice-sidebar" aria-label="Vertical slice debug sidebar" data-testid="vertical-slice-debug-sidebar">
        <div aria-label="Vertical slice debug panels" className="vertical-slice-debug-tabs" role="tablist">
          <DebugTabButton
            active={activeDebugTab === "runtime"}
            controls="vertical-slice-runtime-panel"
            id="vertical-slice-runtime-tab"
            label="Runtime"
            onSelect={() => setActiveDebugTab("runtime")}
            testId="vertical-slice-debug-tab-runtime"
          />
          <DebugTabButton
            active={activeDebugTab === "inspector"}
            controls="vertical-slice-inspector-panel"
            id="vertical-slice-inspector-tab"
            label="Inspector"
            onSelect={() => setActiveDebugTab("inspector")}
            testId="vertical-slice-debug-tab-inspector"
          />
        </div>
        <div className="vertical-slice-debug-panels">
          {activeDebugTab === "runtime" ? (
            <div
              aria-labelledby="vertical-slice-runtime-tab"
              className="vertical-slice-debug-panel vertical-slice-runtime-panel"
              data-testid="vertical-slice-debug-panel-runtime"
              id="vertical-slice-runtime-panel"
              role="tabpanel"
            >
              <VerticalSliceReadout
                activeInteractableId={navi.activeInteractableId ?? "none"}
                blockedReason={interactionView.blockedReason ?? "none"}
                canConfirm={String(interactionView.canConfirm)}
                evidence={formatEvidence(gameplay)}
                inputLock={navi.inputLock}
                inventory={formatInventory(gameplay)}
                lastAction={lastAction}
                lastOutcome={lastOutcome}
                mapId={navi.activeMapId ?? "none"}
                pointerLockStatus={firstPersonBridge.pointerLockStatus}
                route={String(storyRuntime.state.variables.route ?? "none")}
                substate={navi.substate}
              />
              <VerticalSliceRuntimeControls
                advanceDisabled={!storyRuntime.active}
                onAdvanceStory={advanceStory}
                onMoveToPreset={moveToPreset}
                onRequestInteract={firstPersonBridge.requestInteract}
                onReset={resetSlice}
                pointerLockTriggerProps={firstPersonBridge.pointerLockTriggerProps}
              />
            </div>
          ) : null}
          {activeDebugTab === "inspector" ? (
            <div
              aria-labelledby="vertical-slice-inspector-tab"
              className="vertical-slice-debug-panel"
              data-testid="vertical-slice-debug-panel-inspector"
              id="vertical-slice-inspector-panel"
              role="tabpanel"
            >
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
            </div>
          ) : null}
        </div>
      </aside>
    </main>
  );
}

function DebugTabButton({
  active,
  controls,
  id,
  label,
  onSelect,
  testId
}: {
  active: boolean;
  controls: string;
  id: string;
  label: string;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      aria-controls={controls}
      aria-selected={active}
      className="vertical-slice-debug-tab"
      data-testid={testId}
      id={id}
      onClick={onSelect}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}

function VerticalSliceRuntimeControls({
  advanceDisabled,
  onAdvanceStory,
  onMoveToPreset,
  onRequestInteract,
  onReset,
  pointerLockTriggerProps
}: {
  advanceDisabled: boolean;
  onAdvanceStory: () => void;
  onMoveToPreset: (id: PosePresetId) => void;
  onRequestInteract: () => void;
  onReset: () => void;
  pointerLockTriggerProps: ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <section aria-label="Runtime debug controls" className="vertical-slice-runtime-controls" data-testid="harness-commands">
      <header>
        <span>Runtime Controls</span>
        <strong>debug</strong>
      </header>
      <div className="vertical-slice-runtime-controls-grid">
        {posePresets.map((preset) => (
          <button
            key={preset.id}
            data-testid={`vertical-slice-move-${preset.id}`}
            type="button"
            onClick={() => onMoveToPreset(preset.id)}
          >
            移至：{preset.label}
          </button>
        ))}
        <button {...pointerLockTriggerProps} data-testid="vertical-slice-pointer-lock" type="button">
          鼠标视角
        </button>
        <button data-testid="vertical-slice-confirm" type="button" onClick={onRequestInteract}>
          确认交互
        </button>
        <button data-testid="vertical-slice-advance" type="button" onClick={onAdvanceStory} disabled={advanceDisabled}>
          推进剧情
        </button>
        <button data-testid="vertical-slice-reset" type="button" onClick={onReset}>
          重置
        </button>
      </div>
    </section>
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

function displayStorySpeaker(speaker: string): string {
  const labels: Record<string, string> = {
    Felix: "菲利克斯",
    Mira: "米拉",
    Ren: "莲",
    Narrator: "旁白"
  };
  return labels[speaker] ?? speaker;
}

function VerticalSliceReadout({
  activeInteractableId,
  blockedReason,
  canConfirm,
  evidence,
  inputLock,
  inventory,
  lastAction,
  lastOutcome,
  mapId,
  pointerLockStatus,
  route,
  substate
}: {
  activeInteractableId: string;
  blockedReason: string;
  canConfirm: string;
  evidence: string;
  inputLock: string;
  inventory: string;
  lastAction: string;
  lastOutcome: string;
  mapId: string;
  pointerLockStatus: string;
  route: string;
  substate: string;
}) {
  return (
    <section aria-label="Vertical slice readout" className="vertical-slice-readout">
      <header>
        <span>Runtime Readout</span>
        <strong>{substate}</strong>
      </header>
      <div className="vertical-slice-readout-grid">
        <Readout label="Map" testId="vertical-slice-map" value={mapId} />
        <Readout label="Substate" testId="vertical-slice-substate" value={substate} />
        <Readout label="Input" testId="vertical-slice-input-lock" value={inputLock} />
        <Readout label="Pointer Lock" testId="vertical-slice-pointer-lock-status" value={pointerLockStatus} />
        <Readout label="Active" testId="vertical-slice-active-interactable" value={activeInteractableId} />
        <Readout label="Can" testId="vertical-slice-can-confirm" value={canConfirm} />
        <Readout label="Block" testId="vertical-slice-blocked-reason" value={blockedReason} />
        <Readout label="Inventory" testId="vertical-slice-inventory" value={inventory} />
        <Readout label="Evidence" testId="vertical-slice-evidence" value={evidence} />
        <Readout label="Route" testId="vertical-slice-route" value={route} />
        <Readout label="Outcome" testId="vertical-slice-last-outcome" value={lastOutcome} wide />
        <Readout label="Action" testId="vertical-slice-last-action" value={lastAction} wide />
      </div>
    </section>
  );
}

function Readout({ label, testId, value, wide = false }: { label: string; testId: string; value: string; wide?: boolean }) {
  return (
    <p className={wide ? "vertical-slice-readout-row vertical-slice-readout-row-wide" : "vertical-slice-readout-row"}>
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
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
