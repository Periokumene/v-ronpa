import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GameInteractionContext,
  GameUiAction,
  NaviInteractionSensorReport,
  NaviRuntimeState,
  PlayerPose,
  PixiStageSnapshot,
  RuntimeCommand,
  SaveData,
  GameplayEvent,
  TrialDefinition,
  TrialRuntimeState,
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
  createInitialStoryState,
  type StoryStepperDiagnostic,
  type StoryStepperResult,
  type StoryRuntimeState
} from "@v-ronpa/story-engine";
import {
  advanceStoryPlay,
  chooseStoryPlayOption,
  createInitialStoryPlayState,
  selectStoryPlaySchedule,
  stopStoryPlayAutomation,
  toggleAutoStoryPlay,
  toggleSkipStoryPlay,
  type StoryPlayAdvanceSource,
  type StoryPlayPacing,
  type StoryPlaySchedule,
  type StoryPlayStopReason,
  type StoryPlayState,
  type StoryPlayTimingPolicy
} from "@v-ronpa/story-play";
import {
  verticalSliceEvidence,
  verticalSliceMaps,
  verticalSliceScript,
  verticalSliceTrial
} from "../harness/fixtures/verticalSlice";
import { defaultHarnessInputBindings, useKeyboardInputActions } from "../harness/inputActions";
import { useFirstPersonExplorationBridge } from "../harness/useFirstPersonExplorationBridge";
import {
  createInitialTrialState,
  trialReducer,
  validateTrialDefinition,
  type TrialDefinitionDiagnostic,
  type TrialDirectorOutcome,
  type TrialEvent
} from "@v-ronpa/trial-director";
import {
  createVnRuntimePresentationTransaction,
  type VnRuntimeTransactionDiagnostic,
  type VnRuntimePresentationTransaction
} from "../vnRuntimeTransaction";
import type { VnOutputRouteTable, VnRuntimeProfile } from "../vnOutputRoutes";

export type PosePresetId = "spawn" | "notebook" | "keycard" | "door" | "hall-door" | "witness" | "trial-stand" | "empty";

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

export interface TrialRuntime {
  definition: TrialDefinition;
  active: boolean;
  state?: TrialRuntimeState;
  lastOutcome: string;
}

export type VerticalSliceDiagnosticSource = "parser" | "compiler" | "story" | "transaction" | "trial";

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
  storyPlay: StoryPlayState;
  trialRuntime: TrialRuntime;
  pixiStageRuntime: PixiStageRuntime;
}

export interface VerticalSliceRuntimeAdapterOptions {
  profile?: VnRuntimeProfile;
  routeTable?: VnOutputRouteTable;
  storyPlayTiming?: StoryPlayTimingPolicy;
  onEnterTrial?: () => void;
  onEnterNavi?: () => void;
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
  { id: "trial-stand", label: "审判入口", mapId: "map:academy-hall", pose: { position: [-2.7, 1.7, 1.2], yaw: 1.2, pitch: 0 } },
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
  const trialDefinitionDiagnostics = useMemo(() => validateTrialDefinition(verticalSliceTrial), []);
  const initialRuntimeDiagnostics = useMemo(
    () => createInitialVerticalSliceDiagnostics(parsed.diagnostics, compiled.diagnostics, trialDefinitionDiagnostics),
    [parsed, compiled, trialDefinitionDiagnostics]
  );
  const runtimeProfile = options.profile ?? "vn2d";
  const runtimeRouteTable = options.routeTable;
  const storyPlayTiming = options.storyPlayTiming;
  const onEnterTrial = options.onEnterTrial;
  const onEnterNavi = options.onEnterNavi;
  const [navi, setNavi] = useState<NaviRuntimeState>(() => ({
    ...createInitialNaviState(initialMap.id),
    playerPose: { position: initialMap.spawn, yaw: 0, pitch: 0 }
  }));
  const [gameplay, setGameplay] = useState<GameplayState>(() => createGameplayState());
  const [storyRuntime, setStoryRuntime] = useState<StoryRuntime>(() => ({
    state: createInitialStoryState(compiled.script),
    active: false
  }));
  const [storyPlay, setStoryPlay] = useState<StoryPlayState>(() => createInitialStoryPlayState());
  const [trialRuntime, setTrialRuntime] = useState<TrialRuntime>(() => createInitialVerticalSliceTrialRuntime());
  const [pixiStageRuntime, setPixiStageRuntime] = useState<PixiStageRuntime>(() => createInitialPixiStageRuntime());
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<VerticalSliceRuntimeDiagnostic[]>(() => initialRuntimeDiagnostics);
  const [lastRuntimeCommandCount, setLastRuntimeCommandCount] = useState(0);
  const [lastOutcome, setLastOutcome] = useState("spawn");
  const [lastAction, setLastAction] = useState("boot");
  const [storySession, setStorySession] = useState(0);
  const activeMap = getActiveMap(navi);
  const currentCameraMode = navi.inputLock === "none" && flowMode === "navi" ? "first-person" : "locked";
  const inputActionsRef = useKeyboardInputActions(defaultHarnessInputBindings, "navi", navi.inputLock === "none" && flowMode === "navi");
  const interactionView = createNaviInteractionView(navi);
  const storyPlayHostRef = useRef<{ active: boolean; schedule: StoryPlaySchedule }>({
    active: false,
    schedule: { type: "idle" }
  });
  const storyPlaySchedule = useMemo(
    () =>
      selectStoryPlaySchedule(storyPlay, storyRuntime.state, {
        active: storyRuntime.active,
        hostReadyForAuto: true,
        ...(storyPlayTiming ? { timing: storyPlayTiming } : {})
      }),
    [storyPlay, storyPlayTiming, storyRuntime.active, storyRuntime.state]
  );
  const storyPlayActiveActions: Partial<Record<GameUiAction, boolean>> = useMemo(
    () => ({
      "toggle-auto": storyPlay.mode === "auto",
      "toggle-skip": storyPlay.mode === "skip"
    }),
    [storyPlay.mode]
  );

  useEffect(() => {
    storyPlayHostRef.current = { active: storyRuntime.active, schedule: storyPlaySchedule };
  }, [storyPlaySchedule, storyRuntime.active]);

  useEffect(() => {
    if (!storyRuntime.active) return;
    if (storyPlaySchedule.type === "idle") return;
    const delayMs = storyPlaySchedule.type === "wait" ? storyPlaySchedule.delayMs : 0;
    const scheduled = storyPlaySchedule;
    const timeout = window.setTimeout(() => {
      const currentHost = storyPlayHostRef.current;
      if (!currentHost.active || currentHost.schedule !== scheduled) return;
      advanceStory(scheduled.source);
    }, delayMs);
    return () => window.clearTimeout(timeout);
  }, [storyPlaySchedule, storyRuntime.active]);

  function resetSlice() {
    cancelStoryPlayHostSchedule();
    const spawnPose: PlayerPose = { position: initialMap.spawn, yaw: 0, pitch: 0 };
    setNavi({
      ...createInitialNaviState(initialMap.id),
      playerPose: spawnPose
    });
    setGameplay(createGameplayState());
    setStoryRuntime({ state: createInitialStoryState(compiled.script), active: false });
    setStoryPlay(createInitialStoryPlayState());
    setTrialRuntime(createInitialVerticalSliceTrialRuntime());
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
    if (flowMode === "trial") onEnterNavi?.();
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
      const reportMap = report ? verticalSliceMaps.find((candidate) => candidate.id === report.mapId) ?? activeMap : activeMap;
      const reportFocus = report ? focusNaviInteractionFromSensorReport(navi, reportMap, report) : undefined;
      const reportMatchesNaviFocus =
        !navi.activeInteractableId || reportFocus?.view.activeInteractableId === navi.activeInteractableId;
      const confirmationNavi = reportFocus && reportMatchesNaviFocus ? reportFocus.navi : navi;
      const confirmationMap = verticalSliceMaps.find((candidate) => candidate.id === confirmationNavi.activeMapId) ?? reportMap;
      const resolution = confirmFocusedNaviInteraction(confirmationNavi, confirmationMap, gameplay, verticalSliceMaps);

      setNavi(resolution.navi);
      setGameplay(resolution.gameplay);
      setLastAction(`confirm:${confirmationNavi.activeInteractableId ?? "none"}`);
      setLastOutcome(formatOutcome(resolution.outcome));
      if (resolution.outcome.type === "change-map" && resolution.navi.playerPose) {
        firstPersonBridge.issuePoseCommand(resolution.navi.playerPose);
      }
      if (resolution.outcome.type === "start-script") startStoryOverlay();
      if (resolution.outcome.type === "start-trial") startTrial(resolution.outcome);
    },
    [activeMap, gameplay, navi, onEnterTrial, runtimeProfile, runtimeRouteTable]
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

  function confirmFocusedInteraction() {
    confirmInteraction();
  }

  function startStoryOverlay() {
    setTrialRuntime(createInitialVerticalSliceTrialRuntime());
    const initial = createInitialStoryState(compiled.script);
    const step = advanceStoryPlay(createInitialStoryPlayState(), {
      state: initial,
      script: compiled.script,
      source: "start"
    });
    const initialPixiStage = createInitialPixiStageSnapshot();
    setStorySession((session) => session + 1);
    setStoryPlay(step.play);
    commitStoryTransaction({
      storyStep: step.story,
      previousPixiStage: initialPixiStage,
      active: true,
      pacing: step.intent.pacing,
      forcePixiCommit: true
    });
  }

  function advanceStory(source: StoryPlayAdvanceSource = "manual") {
    if (source === "manual") cancelStoryPlayHostSchedule();
    const step = advanceStoryPlay(storyPlay, {
      state: storyRuntime.state,
      script: compiled.script,
      source
    });
    const nextStory = step.story.state;
    setStoryPlay(step.play);
    commitStoryTransaction({
      storyStep: step.story,
      previousPixiStage: pixiStageRuntime.snapshot,
      active: !nextStory.ended,
      pacing: step.intent.pacing
    });
    if (nextStory.ended) {
      closeStoryOverlay("story:end");
    } else {
      setLastAction(source === "manual" ? "story:advance" : `story:${source}`);
      setLastOutcome(nextStory.pendingChoices.length > 0 ? "choices" : "line");
    }
  }

  function chooseStory(index: number) {
    cancelStoryPlayHostSchedule();
    const step = chooseStoryPlayOption(storyPlay, {
      state: storyRuntime.state,
      script: compiled.script,
      index
    });
    const nextStory = step.story.state;
    setStoryPlay(step.play);
    commitStoryTransaction({
      storyStep: step.story,
      previousPixiStage: pixiStageRuntime.snapshot,
      active: !nextStory.ended,
      pacing: step.intent.pacing
    });
    if (nextStory.ended) {
      closeStoryOverlay("story:end");
    } else {
      setLastAction(`choice:${index}`);
      setLastOutcome(nextStory.variables.route ? `route:${String(nextStory.variables.route)}` : "choice");
    }
  }

  function toggleStoryAuto() {
    if (!canToggleStoryAutomation(storyRuntime)) return;
    if (storyPlay.mode === "auto") cancelStoryPlayHostSchedule();
    setStoryPlay((current) => toggleAutoStoryPlay(current));
    setLastAction("story:auto");
    setLastOutcome(storyPlay.mode === "auto" ? "manual" : "auto");
  }

  function toggleStorySkip() {
    if (!canToggleStoryAutomation(storyRuntime)) return;
    if (storyPlay.mode === "skip") cancelStoryPlayHostSchedule();
    setStoryPlay((current) => toggleSkipStoryPlay(current));
    setLastAction("story:skip");
    setLastOutcome(storyPlay.mode === "skip" ? "manual" : "skip");
  }

  function stopStoryAutomation(reason: StoryPlayStopReason) {
    cancelStoryPlayHostSchedule();
    setStoryPlay((current) => stopStoryPlayAutomation(current, reason));
  }

  function startTrial(outcome: Extract<ExplorationOutcome, { type: "start-trial" }>) {
    cancelStoryPlayHostSchedule();
    setStoryRuntime((current) => ({ ...current, active: false }));
    setStoryPlay(createInitialStoryPlayState());

    const definition = findVerticalSliceTrialDefinition(outcome.trialId);
    if (!definition) {
      appendRuntimeDiagnostics([
        {
          source: "trial",
          code: "missing-trial-definition",
          severity: "error",
          message: `Trial definition '${outcome.trialId}' does not exist.`
        }
      ]);
      setLastAction("trial:start");
      setLastOutcome(`start-trial-missing:${outcome.trialId}`);
      return;
    }

    const initial = createInitialTrialState(definition);
    const entered = outcome.segmentId
      ? trialReducer(definition, initial, { type: "ENTER_SEGMENT", segmentId: outcome.segmentId })
      : { trial: initial, outcome: { type: "segment" as const, segmentId: initial.currentSegmentId } };

    setTrialRuntime({
      definition,
      active: true,
      state: entered.trial,
      lastOutcome: formatTrialOutcome(entered.outcome)
    });
    setLastRuntimeCommandCount(0);
    setLastAction(`trial:start:${definition.id}`);
    setLastOutcome(formatOutcome(outcome));
    onEnterTrial?.();
  }

  function resolveTrialKeywordWithEvidence(evidenceId = verticalSliceEvidence.id) {
    applyTrialEvent({ type: "BREAK_KEYWORD", keywordId: "kw:door-lock", evidenceId }, `trial:keyword:${evidenceId}`);
  }

  function resolveTrialTimeout() {
    applyTrialEvent({ type: "TIMEOUT" }, "trial:timeout");
  }

  function exitTrial() {
    setTrialRuntime(createInitialVerticalSliceTrialRuntime());
    setNavi((current) => naviReducer(current, { type: "ENTER_WALK" }));
    setLastAction("trial:exit");
    setLastOutcome("trial-exit");
    onEnterNavi?.();
  }

  function applyTrialEvent(event: TrialEvent, action: string) {
    let nextOutcome = "none";
    setTrialRuntime((current) => {
      if (!current.active || !current.state) return current;
      const resolution = trialReducer(current.definition, current.state, event);
      nextOutcome = formatTrialOutcome(resolution.outcome);
      return {
        ...current,
        state: resolution.trial,
        lastOutcome: nextOutcome
      };
    });
    setLastAction(action);
    setLastOutcome(nextOutcome);
  }

  function closeStoryOverlay(action = "dialog:cancel") {
    cancelStoryPlayHostSchedule();
    setNavi((currentNavi) => naviReducer(currentNavi, { type: "CLOSE_OVERLAY" }));
    setStoryRuntime((current) => ({ ...current, active: false }));
    setStoryPlay(createInitialStoryPlayState());
    setLastRuntimeCommandCount(0);
    setLastAction(action);
    setLastOutcome("overlay-closed");
  }

  function restoreFromSave(save: Pick<SaveData, "mode" | "navi" | "story" | "pixiStage" | "inventory" | "evidence" | "characters" | "trial">) {
    cancelStoryPlayHostSchedule();
    const plan = createVerticalSliceRuntimeRestorePlan(save, compiled.script);
    if (plan.navi) setNavi(plan.navi);
    if (plan.playerPose) firstPersonBridge.issuePoseCommand(plan.playerPose);
    setGameplay(plan.gameplay);
    setStoryRuntime(plan.storyRuntime);
    setStoryPlay(plan.storyPlay);
    setTrialRuntime(plan.trialRuntime);
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
    storyStep,
    previousPixiStage,
    active,
    pacing = "normal",
    forcePixiCommit = false
  }: {
    storyStep: StoryStepperResult;
    previousPixiStage: PixiStageSnapshot;
    active: boolean;
    pacing?: StoryPlayPacing;
    forcePixiCommit?: boolean;
  }) {
    const transaction = createVerticalSlicePresentationTransaction({
      runtimeCommands: storyStep.emittedRuntimeCommands,
      previousPixiStage,
      options: {
        profile: runtimeProfile,
        ...(runtimeRouteTable ? { routeTable: runtimeRouteTable } : {})
      }
    });
    appendRuntimeDiagnostics(
      collectVerticalSliceRuntimeDiagnostics({
        storyDiagnostics: storyStep.diagnostics,
        transactionDiagnostics: transaction.diagnostics
      })
    );
    setLastRuntimeCommandCount(storyStep.emittedRuntimeCommands.length);
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
        animate: shouldAnimateStoryPlayPacing(pacing)
      }));
    }
    setStoryRuntime({ state: storyStep.state, active });
  }

  const interactionContext: GameInteractionContext = useMemo(
    () => createVerticalSliceInteractionContext({ flowMode, navi, storyRuntime, trialRuntime }),
    [
      flowMode,
      navi.inputLock,
      navi.substate,
      storyRuntime.active,
      storyRuntime.state.ended,
      storyRuntime.state.pendingChoices.length,
      trialRuntime.active,
      trialRuntime.state?.currentSegmentId,
      trialRuntime.state?.inputLock,
      trialRuntime.state?.presentation
    ]
  );

  return {
    activeMap,
    advanceStory,
    chooseStory,
    closeStoryOverlay,
    confirmFocusedInteraction,
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
    resolveTrialKeywordWithEvidence,
    resolveTrialTimeout,
    stopStoryAutomation,
    storyPlay,
    storyPlayActiveActions,
    storyPlaySchedule,
    storyRuntime,
    storySession,
    trialRuntime,
    toggleStoryAuto,
    toggleStorySkip,
    exitTrial
  };

  function appendRuntimeDiagnostics(diagnostics: VerticalSliceRuntimeDiagnostic[]) {
    if (diagnostics.length === 0) return;
    setRuntimeDiagnostics((current) => limitRuntimeDiagnostics([...current, ...diagnostics]));
  }

  function cancelStoryPlayHostSchedule() {
    storyPlayHostRef.current = { active: storyRuntime.active, schedule: { type: "idle" } };
  }
}

export function createInitialVerticalSliceDiagnostics(
  parserDiagnostics: ParserDiagnostic[],
  compilerDiagnostics: RuntimeCompilerDiagnostic[],
  trialDiagnostics: TrialDefinitionDiagnostic[] = []
): VerticalSliceRuntimeDiagnostic[] {
  return limitRuntimeDiagnostics([
    ...parserDiagnostics.map(toVerticalSliceParserDiagnostic),
    ...compilerDiagnostics.map(toVerticalSliceCompilerDiagnostic),
    ...trialDiagnostics.map(toVerticalSliceTrialDiagnostic)
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
  storyRuntime,
  trialRuntime = createInitialVerticalSliceTrialRuntime()
}: {
  flowMode: GameInteractionContext["mode"];
  navi: Pick<NaviRuntimeState, "inputLock" | "substate">;
  storyRuntime: StoryRuntime;
  trialRuntime?: TrialRuntime;
}): GameInteractionContext {
  if (flowMode === "trial" && trialRuntime.active && trialRuntime.state) {
    return {
      mode: flowMode,
      overlayStack: [],
      naviSubstate: navi.substate,
      trialPresentation: trialRuntime.state.presentation,
      inputLock: trialRuntime.state.inputLock,
      hasActiveStory: false,
      storyHasChoices: false,
      storyEnded: false,
      isAtStableStop: false
    };
  }

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

export function canToggleStoryAutomation(storyRuntime: StoryRuntime): boolean {
  return storyRuntime.active && !storyRuntime.state.ended && storyRuntime.state.pendingChoices.length === 0;
}

export function createVerticalSliceRuntimeRestorePlan(
  save: Pick<SaveData, "mode" | "navi" | "story" | "pixiStage" | "inventory" | "evidence" | "characters" | "trial">,
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
    storyPlay: createInitialStoryPlayState(),
    trialRuntime:
      save.mode === "trial" && save.trial
        ? {
            definition: verticalSliceTrial,
            active: true,
            state: save.trial,
            lastOutcome: "restored"
          }
        : createInitialVerticalSliceTrialRuntime(),
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

export function createInitialVerticalSliceTrialRuntime(): TrialRuntime {
  return {
    definition: verticalSliceTrial,
    active: false,
    lastOutcome: "none"
  };
}

export function shouldAnimateStoryPlayPacing(pacing: StoryPlayPacing): boolean {
  return pacing !== "skip";
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
  if (outcome.type === "start-trial") return `start-trial:${outcome.trialId}`;
  if (outcome.type === "change-map") return `change-map:${outcome.mapId}`;
  return `character-state:${outcome.characterId}:${outcome.affinityDelta}`;
}

function formatTrialOutcome(outcome: TrialDirectorOutcome): string {
  if (outcome.type === "none") return "none";
  if (outcome.type === "segment") return `segment:${outcome.segmentId}`;
  if (outcome.type === "correct") return outcome.nextSegmentId ? `correct:${outcome.nextSegmentId}` : "correct";
  if (outcome.type === "miss") return outcome.nextSegmentId ? `miss:${outcome.nextSegmentId}` : "miss";
  if (outcome.type === "timeout") return outcome.nextSegmentId ? `timeout:${outcome.nextSegmentId}` : "timeout";
  if (outcome.type === "evidence") {
    const result = outcome.accepted ? "accepted" : "rejected";
    return outcome.nextSegmentId ? `evidence:${result}:${outcome.nextSegmentId}` : `evidence:${result}`;
  }
  if (outcome.type === "minigame") {
    return outcome.nextSegmentId ? `minigame:${outcome.success}:${outcome.nextSegmentId}` : `minigame:${outcome.success}`;
  }
  if (outcome.type === "invalid-segment") return `invalid-segment:${outcome.segmentId}`;
  return `${outcome.type}:${outcome.keywordId}:${outcome.evidenceId}`;
}

function findVerticalSliceTrialDefinition(trialId: string): TrialDefinition | undefined {
  return verticalSliceTrial.id === trialId ? verticalSliceTrial : undefined;
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

function toVerticalSliceTrialDiagnostic(diagnostic: TrialDefinitionDiagnostic): VerticalSliceRuntimeDiagnostic {
  const details = [diagnostic.segmentId, diagnostic.ref].filter(Boolean).join(" ");
  return {
    source: "trial",
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: details ? `${diagnostic.message} (${details})` : diagnostic.message
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
