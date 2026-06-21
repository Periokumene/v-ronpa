import { useCallback, useMemo, useState } from "react";
import type {
  GameInteractionContext,
  NaviInteractionSensorReport,
  NaviRuntimeState,
  PlayerPose,
  PixiStageSnapshot,
  RuntimeCommand,
  SaveData,
  GameplayEvent,
  WorldMapDef
} from "@v-ronpa/contracts";
import { applyGameplayEvent, createGameplayState, type ExplorationOutcome, type GameplayState } from "@v-ronpa/gameplay";
import { parseScenario, type Diagnostic as ParserDiagnostic } from "@v-ronpa/nani-parser";
import { compileRuntimeScript, type RuntimeCompilerDiagnostic } from "@v-ronpa/nani-runtime-compiler";
import {
  confirmFocusedNaviInteraction,
  createInitialNaviState,
  createNaviInteractionView,
  focusNaviInteractionFromSensorReport,
  naviReducer
} from "@v-ronpa/navi-director";
import { createInitialPixiStageSnapshot, type PixiStageRenderHint } from "@v-ronpa/pixi-presenter";
import type { FirstPersonInteractRequest } from "@v-ronpa/r3f-adapter";
import {
  advanceToNextStop,
  chooseStoryOption,
  createInitialStoryState,
  type StoryStepperDiagnostic,
  type StoryRuntimeState
} from "@v-ronpa/story-engine";
import { verticalSliceMaps, verticalSliceScript } from "../harness/fixtures/verticalSlice";
import { defaultHarnessInputBindings, useKeyboardInputActions } from "../harness/inputActions";
import { useFirstPersonExplorationBridge } from "../harness/useFirstPersonExplorationBridge";
import {
  createVnRuntimePresentationTransaction,
  type VnRuntimeTransactionDiagnostic,
  type VnRuntimePresentationTransaction
} from "../vnRuntimeTransaction";
import type { VnOutputRouteTable, VnRuntimeProfile } from "../vnOutputRoutes";

export type PosePresetId = "spawn" | "notebook" | "keycard" | "door" | "hall-door" | "witness" | "empty";

export interface PosePreset {
  id: PosePresetId;
  label: string;
  mapId: string;
  pose: PlayerPose;
}

export interface StoryRuntime {
  state: StoryRuntimeState;
  active: boolean;
}

export interface PixiStageRuntime {
  snapshot: PixiStageSnapshot;
  hints: PixiStageRenderHint[];
  hintSequence: number;
  animate: boolean;
}

export type VerticalSliceDiagnosticSource = "parser" | "compiler" | "story" | "transaction";

export interface VerticalSliceRuntimeDiagnostic {
  source: VerticalSliceDiagnosticSource;
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  loc?: string;
  commandId?: string;
}

export interface VerticalSliceRuntimeRestorePlan {
  gameplay: GameplayState;
  navi?: NaviRuntimeState;
  playerPose?: PlayerPose;
  storyRuntime: StoryRuntime;
  pixiStageRuntime: PixiStageRuntime;
}

export interface VerticalSliceRuntimeAdapterOptions {
  profile?: VnRuntimeProfile;
  routeTable?: VnOutputRouteTable;
}

export interface VerticalSlicePresentationTransactionInput {
  runtimeCommands: RuntimeCommand[];
  previousPixiStage: PixiStageSnapshot;
  options?: VerticalSliceRuntimeAdapterOptions;
}

export const verticalSlicePosePresets: PosePreset[] = [
  { id: "spawn", label: "出生点", mapId: "map:academy-hall", pose: { position: [0, 1.7, 4], yaw: 0, pitch: 0 } },
  { id: "notebook", label: "笔记本", mapId: "map:academy-hall", pose: { position: [1.2, 1.7, -0.8], yaw: -0.25, pitch: 0 } },
  { id: "keycard", label: "门禁卡", mapId: "map:academy-hall", pose: { position: [2, 1.7, -1.7], yaw: -0.35, pitch: 0 } },
  { id: "door", label: "教室门", mapId: "map:academy-hall", pose: { position: [0, 1.7, -3.7], yaw: 3.14, pitch: 0 } },
  { id: "hall-door", label: "走廊门", mapId: "map:classroom", pose: { position: [0, 1.7, 3.1], yaw: 0, pitch: 0 } },
  { id: "witness", label: "证人", mapId: "map:academy-hall", pose: { position: [-1.7, 1.7, -1.5], yaw: 0.45, pitch: 0 } },
  { id: "empty", label: "空位", mapId: "map:academy-hall", pose: { position: [3.4, 1.7, 3.8], yaw: 0, pitch: 0 } }
];

const initialMap = verticalSliceMaps[0] ?? createFallbackMap();
const MAX_RUNTIME_DIAGNOSTICS = 50;

export function useVerticalSliceRuntimeAdapter(
  flowMode: GameInteractionContext["mode"],
  options: VerticalSliceRuntimeAdapterOptions = {}
) {
  const parsed = useMemo(
    () => parseScenario({ sourceText: verticalSliceScript, scriptPath: "harness/vertical-slice.nani" }),
    []
  );
  const compiled = useMemo(() => compileRuntimeScript(parsed.scenario), [parsed]);
  const initialRuntimeDiagnostics = useMemo(
    () => createInitialVerticalSliceDiagnostics(parsed.diagnostics, compiled.diagnostics),
    [parsed, compiled]
  );
  const runtimeProfile = options.profile ?? "vn2d";
  const runtimeRouteTable = options.routeTable;
  const [navi, setNavi] = useState<NaviRuntimeState>(() => ({
    ...createInitialNaviState(initialMap.id),
    playerPose: { position: initialMap.spawn, yaw: 0, pitch: 0 }
  }));
  const [gameplay, setGameplay] = useState<GameplayState>(() => createGameplayState());
  const [storyRuntime, setStoryRuntime] = useState<StoryRuntime>(() => ({
    state: createInitialStoryState(compiled.script),
    active: false
  }));
  const [pixiStageRuntime, setPixiStageRuntime] = useState<PixiStageRuntime>(() => createInitialPixiStageRuntime());
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<VerticalSliceRuntimeDiagnostic[]>(() => initialRuntimeDiagnostics);
  const [lastRuntimeCommandCount, setLastRuntimeCommandCount] = useState(0);
  const [lastOutcome, setLastOutcome] = useState("spawn");
  const [lastAction, setLastAction] = useState("boot");
  const [storySession, setStorySession] = useState(0);
  const activeMap = getActiveMap(navi);
  const currentCameraMode = navi.inputLock === "none" && flowMode !== "title" ? "first-person" : "locked";
  const inputActionsRef = useKeyboardInputActions(defaultHarnessInputBindings, "navi", navi.inputLock === "none" && flowMode !== "title");
  const interactionView = createNaviInteractionView(navi);

  function resetSlice() {
    const spawnPose: PlayerPose = { position: initialMap.spawn, yaw: 0, pitch: 0 };
    setNavi({
      ...createInitialNaviState(initialMap.id),
      playerPose: spawnPose
    });
    setGameplay(createGameplayState());
    setStoryRuntime({ state: createInitialStoryState(compiled.script), active: false });
    setRuntimeDiagnostics(initialRuntimeDiagnostics);
    setPixiStageRuntime((current) => ({
      ...createInitialPixiStageRuntime(),
      hintSequence: current.hintSequence + 1
    }));
    setLastRuntimeCommandCount(0);
    setLastOutcome("reset");
    setLastAction("reset");
    firstPersonBridge.issuePoseCommand(spawnPose);
    setStorySession((session) => session + 1);
  }

  function moveToPreset(id: PosePresetId) {
    const preset = verticalSlicePosePresets.find((candidate) => candidate.id === id);
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
    [activeMap, gameplay, navi, runtimeProfile, runtimeRouteTable]
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
    const initial = createInitialStoryState(compiled.script);
    const advanced = advanceToNextStop(initial, compiled.script);
    const initialPixiStage = createInitialPixiStageSnapshot();
    setStorySession((session) => session + 1);
    commitStoryTransaction({
      nextStory: advanced.state,
      runtimeCommands: advanced.emittedRuntimeCommands,
      previousPixiStage: initialPixiStage,
      storyDiagnostics: advanced.diagnostics,
      active: true,
      forcePixiCommit: true
    });
  }

  function advanceStory() {
    const current = storyRuntime.state;
    const advanced = advanceToNextStop(current, compiled.script);
    const nextStory = advanced.state;
    commitStoryTransaction({
      nextStory,
      runtimeCommands: advanced.emittedRuntimeCommands,
      previousPixiStage: pixiStageRuntime.snapshot,
      storyDiagnostics: advanced.diagnostics,
      active: !nextStory.ended
    });
    if (nextStory.ended) {
      closeStoryOverlay("story:end");
    } else {
      setLastAction("story:advance");
      setLastOutcome(nextStory.pendingChoices.length > 0 ? "choices" : "line");
    }
  }

  function chooseStory(index: number) {
    const current = storyRuntime.state;
    const chosen = chooseStoryOption(current, compiled.script, index);
    const advanced = advanceToNextStop(chosen.state, compiled.script);
    const nextStory = advanced.state;
    commitStoryTransaction({
      nextStory,
      runtimeCommands: advanced.emittedRuntimeCommands,
      previousPixiStage: pixiStageRuntime.snapshot,
      storyDiagnostics: [...chosen.diagnostics, ...advanced.diagnostics],
      active: true
    });
    setLastAction(`choice:${index}`);
    setLastOutcome(nextStory.variables.route ? `route:${String(nextStory.variables.route)}` : "choice");
  }

  function closeStoryOverlay(action = "dialog:cancel") {
    setNavi((currentNavi) => naviReducer(currentNavi, { type: "CLOSE_OVERLAY" }));
    setStoryRuntime((current) => ({ ...current, active: false }));
    setLastRuntimeCommandCount(0);
    setLastAction(action);
    setLastOutcome("overlay-closed");
  }

  function restoreFromSave(save: Pick<SaveData, "navi" | "story" | "pixiStage" | "inventory" | "evidence" | "characters">) {
    const plan = createVerticalSliceRuntimeRestorePlan(save, compiled.script);
    if (plan.navi) setNavi(plan.navi);
    if (plan.playerPose) firstPersonBridge.issuePoseCommand(plan.playerPose);
    setGameplay(plan.gameplay);
    setStoryRuntime(plan.storyRuntime);
    setRuntimeDiagnostics(initialRuntimeDiagnostics);
    setPixiStageRuntime((current) => ({
      ...plan.pixiStageRuntime,
      hintSequence: current.hintSequence + 1
    }));
    setStorySession((session) => session + 1);
    setLastRuntimeCommandCount(0);
    setLastAction("load:slot");
    setLastOutcome("loaded");
  }

  function commitStoryTransaction({
    nextStory,
    runtimeCommands,
    previousPixiStage,
    storyDiagnostics = [],
    active,
    forcePixiCommit = false
  }: {
    nextStory: StoryRuntimeState;
    runtimeCommands: RuntimeCommand[];
    previousPixiStage: PixiStageSnapshot;
    storyDiagnostics?: StoryStepperDiagnostic[];
    active: boolean;
    forcePixiCommit?: boolean;
  }) {
    const transaction = createVerticalSlicePresentationTransaction({
      runtimeCommands,
      previousPixiStage,
      options: {
        profile: runtimeProfile,
        ...(runtimeRouteTable ? { routeTable: runtimeRouteTable } : {})
      }
    });
    appendRuntimeDiagnostics(
      collectVerticalSliceRuntimeDiagnostics({
        storyDiagnostics,
        transactionDiagnostics: transaction.diagnostics
      })
    );
    setLastRuntimeCommandCount(runtimeCommands.length);
    if (transaction.gameplayEvents.length > 0) {
      setGameplay((currentGameplay) => applyGameplayEvents(currentGameplay, transaction.gameplayEvents));
    }
    if (
      forcePixiCommit ||
      transaction.pixiStage !== previousPixiStage ||
      transaction.pixiHints.length > 0
    ) {
      setPixiStageRuntime((current) => ({
        snapshot: transaction.pixiStage,
        hints: transaction.pixiHints,
        hintSequence: current.hintSequence + 1,
        animate: true
      }));
    }
    setStoryRuntime({ state: nextStory, active });
  }

  const interactionContext: GameInteractionContext = useMemo(
    () => createVerticalSliceInteractionContext({ flowMode, navi, storyRuntime }),
    [
      flowMode,
      navi.inputLock,
      navi.substate,
      storyRuntime.active,
      storyRuntime.state.ended,
      storyRuntime.state.pendingChoices.length
    ]
  );

  return {
    activeMap,
    advanceStory,
    chooseStory,
    closeStoryOverlay,
    firstPersonBridge,
    gameplay,
    interactionContext,
    interactionView,
    lastAction,
    lastOutcome,
    lastRuntimeCommandCount,
    moveToPreset,
    navi,
    parsed,
    pixiStageRuntime,
    resetSlice,
    restoreFromSave,
    runtimeDiagnostics,
    storyRuntime,
    storySession
  };

  function appendRuntimeDiagnostics(diagnostics: VerticalSliceRuntimeDiagnostic[]) {
    if (diagnostics.length === 0) return;
    setRuntimeDiagnostics((current) => limitRuntimeDiagnostics([...current, ...diagnostics]));
  }
}

export function createInitialVerticalSliceDiagnostics(
  parserDiagnostics: ParserDiagnostic[],
  compilerDiagnostics: RuntimeCompilerDiagnostic[]
): VerticalSliceRuntimeDiagnostic[] {
  return limitRuntimeDiagnostics([
    ...parserDiagnostics.map(toVerticalSliceParserDiagnostic),
    ...compilerDiagnostics.map(toVerticalSliceCompilerDiagnostic)
  ]);
}

export function collectVerticalSliceRuntimeDiagnostics({
  storyDiagnostics = [],
  transactionDiagnostics = []
}: {
  storyDiagnostics?: StoryStepperDiagnostic[];
  transactionDiagnostics?: VnRuntimeTransactionDiagnostic[];
}): VerticalSliceRuntimeDiagnostic[] {
  return [
    ...storyDiagnostics.map(toVerticalSliceStoryDiagnostic),
    ...transactionDiagnostics.map(toVerticalSliceTransactionDiagnostic)
  ];
}

export function createVerticalSliceInteractionContext({
  flowMode,
  navi,
  storyRuntime
}: {
  flowMode: GameInteractionContext["mode"];
  navi: Pick<NaviRuntimeState, "inputLock" | "substate">;
  storyRuntime: StoryRuntime;
}): GameInteractionContext {
  return {
    mode: flowMode,
    overlayStack: [],
    naviSubstate: navi.substate,
    inputLock: navi.inputLock,
    hasActiveStory: storyRuntime.active,
    storyHasChoices: storyRuntime.state.pendingChoices.length > 0,
    storyEnded: storyRuntime.state.ended,
    isAtStableStop: flowMode === "navi" && (navi.substate === "walk" || navi.substate === "vn2d-overlay")
  };
}

export function createVerticalSliceRuntimeRestorePlan(
  save: Pick<SaveData, "navi" | "story" | "pixiStage" | "inventory" | "evidence" | "characters">,
  script: { scriptPath: string }
): VerticalSliceRuntimeRestorePlan {
  const storyRuntime = {
    active: save.navi?.substate === "vn2d-overlay" && !save.story.ended,
    state: {
      ...createInitialStoryState(script),
      ...save.story
    }
  };
  return {
    gameplay: { inventory: save.inventory, evidence: save.evidence, characters: save.characters },
    ...(save.navi ? { navi: save.navi } : {}),
    ...(save.navi?.playerPose ? { playerPose: save.navi.playerPose } : {}),
    storyRuntime,
    pixiStageRuntime: {
      snapshot: save.pixiStage,
      hints: [],
      hintSequence: 0,
      animate: false
    }
  };
}

export function createInitialPixiStageRuntime(): PixiStageRuntime {
  return {
    snapshot: createInitialPixiStageSnapshot(),
    hints: [],
    hintSequence: 0,
    animate: false
  };
}

export function createVerticalSlicePresentationTransaction({
  runtimeCommands,
  previousPixiStage,
  options = {}
}: VerticalSlicePresentationTransactionInput): VnRuntimePresentationTransaction {
  return createVnRuntimePresentationTransaction({
    runtimeCommands,
    previousPixiStage,
    profile: options.profile ?? "vn2d",
    ...(options.routeTable ? { routeTable: options.routeTable } : {})
  });
}

function applyGameplayEvents(gameplay: GameplayState, events: GameplayEvent[]): GameplayState {
  return events.reduce((current, event) => {
    return applyGameplayEvent(current, event).state;
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

function toVerticalSliceParserDiagnostic(diagnostic: ParserDiagnostic): VerticalSliceRuntimeDiagnostic {
  return {
    source: "parser",
    code: "parser-diagnostic",
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.loc ? { loc: formatDiagnosticLocation(diagnostic.loc) } : {})
  };
}

function toVerticalSliceCompilerDiagnostic(diagnostic: RuntimeCompilerDiagnostic): VerticalSliceRuntimeDiagnostic {
  return {
    source: "compiler",
    code: diagnostic.code,
    severity: diagnostic.severity ?? "warning",
    message: diagnostic.message
  };
}

function toVerticalSliceStoryDiagnostic(diagnostic: StoryStepperDiagnostic): VerticalSliceRuntimeDiagnostic {
  return {
    source: "story",
    code: diagnostic.code,
    severity: diagnostic.severity ?? "warning",
    message: diagnostic.message
  };
}

function toVerticalSliceTransactionDiagnostic(
  diagnostic: VnRuntimeTransactionDiagnostic
): VerticalSliceRuntimeDiagnostic {
  return {
    source: "transaction",
    code: diagnostic.code,
    severity: "error",
    message: diagnostic.message,
    commandId: diagnostic.commandId
  };
}

function formatDiagnosticLocation(loc: NonNullable<ParserDiagnostic["loc"]>): string {
  return `${loc.scriptPath}:${loc.line}:${loc.column}`;
}

function limitRuntimeDiagnostics(diagnostics: VerticalSliceRuntimeDiagnostic[]): VerticalSliceRuntimeDiagnostic[] {
  return diagnostics.slice(-MAX_RUNTIME_DIAGNOSTICS);
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
