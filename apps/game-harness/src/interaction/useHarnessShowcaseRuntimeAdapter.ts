import { useCallback, useMemo, useRef, useState } from "react";
import type { AssetResolver } from "@v-ronpa/asset-registry";
import type { UseVnRuntimeOptions } from "@v-ronpa/app-vn-runtime";
import {
  limitVnRuntimeDiagnostics,
  useVnRuntimeWithDebug,
  type VnRuntimeDiagnostic
} from "@v-ronpa/app-vn-runtime/debug";
import type {
  DialogueBleepConfig,
  GameplayEvent,
  NaviInteractionSensorReport,
  NaviRuntimeState,
  PlayerPose,
  SaveData,
  TrialDefinition,
  TrialRuntimeState,
  WorldMapDef
} from "@v-ronpa/contracts";
import type { GameMode } from "@v-ronpa/contracts";
import { applyGameplayEvent, createGameplayState, type ExplorationOutcome, type GameplayState } from "@v-ronpa/gameplay";
import {
  confirmFocusedNaviInteraction,
  createInitialNaviState,
  createNaviInteractionView,
  focusNaviInteractionFromSensorReport,
  naviReducer
} from "@v-ronpa/navi-director";
import type { FirstPersonInteractRequest } from "@v-ronpa/r3f-adapter";
import {
  createInitialTrialState,
  trialReducer,
  validateTrialDefinition,
  type TrialDefinitionDiagnostic,
  type TrialDirectorOutcome,
  type TrialEvent
} from "@v-ronpa/trial-director";
import {
  harnessShowcaseEvidence,
  harnessShowcaseMaps,
  harnessShowcaseScript,
  harnessShowcaseTrial
} from "../harness/showcase";
import { harnessShowcaseVnEntry } from "../harness/contentManifest";
import { defaultHarnessInputBindings, useKeyboardInputActions } from "../harness/inputActions";
import { useFirstPersonExplorationBridge } from "../harness/useFirstPersonExplorationBridge";
import type { AudioPort, VideoPort } from "@v-ronpa/media-save";

export type PosePresetId = "spawn" | "notebook" | "keycard" | "door" | "hall-door" | "witness" | "trial-stand" | "empty";

export interface PosePreset {
  id: PosePresetId;
  label: string;
  mapId: string;
  pose: PlayerPose;
}

export interface TrialRuntime {
  definition: TrialDefinition;
  active: boolean;
  state?: TrialRuntimeState;
  lastOutcome: string;
}

export type HarnessShowcaseDiagnosticSource = VnRuntimeDiagnostic["source"] | "trial";

export interface HarnessShowcaseRuntimeDiagnostic extends Omit<VnRuntimeDiagnostic, "source"> {
  source: HarnessShowcaseDiagnosticSource;
}

export interface HarnessShowcaseRuntimeAdapterOptions {
  profile?: UseVnRuntimeOptions["profile"];
  routeTable?: UseVnRuntimeOptions["routeTable"];
  audioPort?: AudioPort;
  videoPort?: VideoPort;
  storyPlayTiming?: UseVnRuntimeOptions["storyPlayTiming"];
  voiceSettings?: UseVnRuntimeOptions["voiceSettings"];
  dialogueBleepConfig?: DialogueBleepConfig;
  dialogueBleepSettings?: UseVnRuntimeOptions["dialogueBleepSettings"];
  dialogRevealSettings?: UseVnRuntimeOptions["dialogRevealSettings"];
  assetResolver?: AssetResolver;
  onEnterTrial?: () => void;
  onEnterNavi?: () => void;
  ensureVnPresentationReady: () => Promise<boolean>;
}

export const harnessShowcasePosePresets: PosePreset[] = [
  { id: "spawn", label: "出生点", mapId: "map:academy-hall", pose: { position: [0, 1.7, 4], yaw: 0, pitch: 0 } },
  { id: "notebook", label: "笔记本", mapId: "map:academy-hall", pose: { position: [1.2, 1.7, -0.8], yaw: -0.25, pitch: 0 } },
  { id: "keycard", label: "门禁卡", mapId: "map:academy-hall", pose: { position: [2, 1.7, -1.7], yaw: -0.35, pitch: 0 } },
  { id: "door", label: "教室门", mapId: "map:academy-hall", pose: { position: [0, 1.7, -3.7], yaw: 3.14, pitch: 0 } },
  { id: "hall-door", label: "走廊门", mapId: "map:classroom", pose: { position: [0, 1.7, 3.1], yaw: 0, pitch: 0 } },
  { id: "witness", label: "证人", mapId: "map:academy-hall", pose: { position: [-1.7, 1.7, -1.5], yaw: 0.45, pitch: 0 } },
  { id: "trial-stand", label: "审判入口", mapId: "map:academy-hall", pose: { position: [-2.7, 1.7, 1.2], yaw: 1.2, pitch: 0 } },
  { id: "empty", label: "空位", mapId: "map:academy-hall", pose: { position: [3.4, 1.7, 3.8], yaw: 0, pitch: 0 } }
];

const initialMap = harnessShowcaseMaps[0] ?? createFallbackMap();

export function useHarnessShowcaseRuntimeAdapter(
  flowMode: GameMode,
  options: HarnessShowcaseRuntimeAdapterOptions
) {
  const trialDefinitionDiagnostics = useMemo(() => validateTrialDefinition(harnessShowcaseTrial), []);
  const trialRuntimeDiagnostics = useMemo(
    () => trialDefinitionDiagnostics.map(toHarnessShowcaseTrialDiagnostic),
    [trialDefinitionDiagnostics]
  );
  const assetResolver = options.assetResolver;
  const onEnterTrial = options.onEnterTrial;
  const onEnterNavi = options.onEnterNavi;
  const [navi, setNavi] = useState<NaviRuntimeState>(() => ({
    ...createInitialNaviState(initialMap.id),
    playerPose: { position: initialMap.spawn, yaw: 0, pitch: 0 }
  }));
  const [gameplay, setGameplay] = useState<GameplayState>(() => createGameplayState());
  const [trialRuntime, setTrialRuntime] = useState<TrialRuntime>(() => createInitialHarnessShowcaseTrialRuntime());
  const [lastOutcome, setLastOutcome] = useState("spawn");
  const [lastAction, setLastAction] = useState("boot");
  const startStoryPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const activeMap = getActiveMap(navi);
  const currentCameraMode = navi.inputLock === "none" && flowMode === "navi" ? "first-person" : "locked";
  const inputActionsRef = useKeyboardInputActions(defaultHarnessInputBindings, "navi", navi.inputLock === "none" && flowMode === "navi");
  const interactionView = createNaviInteractionView(navi);
  const applyRuntimeGameplayEvents = useCallback((events: GameplayEvent[]) => {
    setGameplay((currentGameplay) => applyGameplayEvents(currentGameplay, events));
  }, []);
  const recordRuntimeStatus = useCallback(({ action, outcome }: { action: string; outcome: string }) => {
    setLastAction(action);
    setLastOutcome(outcome);
  }, []);
  const runtime = useVnRuntimeWithDebug({
    ...(assetResolver ? { assetResolver } : {}),
    ...(options.audioPort ? { audioPort: options.audioPort } : {}),
    ...(options.dialogRevealSettings ? { dialogRevealSettings: options.dialogRevealSettings } : {}),
    ...(options.dialogueBleepConfig ? { dialogueBleepConfig: options.dialogueBleepConfig } : {}),
    ...(options.dialogueBleepSettings ? { dialogueBleepSettings: options.dialogueBleepSettings } : {}),
    entry: {
      id: harnessShowcaseVnEntry.id,
      scriptRevision: harnessShowcaseVnEntry.scriptRevision,
      profile: options.profile ?? "vn2d",
      scriptPath: harnessShowcaseVnEntry.scriptPath,
      sourceText: harnessShowcaseScript,
      startLabel: "Start"
    },
    gameId: "game-harness",
    onGameplayEvents: applyRuntimeGameplayEvents,
    onRuntimeStatus: recordRuntimeStatus,
    onStoryEnd: () => closeStoryOverlay("story:end"),
    ...(options.profile ? { profile: options.profile } : {}),
    ...(options.routeTable ? { routeTable: options.routeTable } : {}),
    ...(options.storyPlayTiming ? { storyPlayTiming: options.storyPlayTiming } : {}),
    ...(options.videoPort ? { videoPort: options.videoPort } : {}),
    ...(options.voiceSettings ? { voiceSettings: options.voiceSettings } : {})
  });
  const runtimeDiagnostics: HarnessShowcaseRuntimeDiagnostic[] = useMemo(
    () => limitHarnessShowcaseDiagnostics([...runtime.diagnostics.runtimeDiagnostics, ...trialRuntimeDiagnostics]),
    [runtime.diagnostics.runtimeDiagnostics, trialRuntimeDiagnostics]
  );
  const observeAssetDiagnostic = useCallback(
    (diagnostic: { code?: string; severity?: "info" | "warning" | "error"; message: string; assetId?: string; kind?: string }) => {
      runtime.diagnostics.observeAssetDiagnostic(diagnostic);
    },
    [runtime]
  );

  const recordSensorReport = useCallback((report: NaviInteractionSensorReport) => {
    setNavi((current) => {
      const map = harnessShowcaseMaps.find((candidate) => candidate.id === report.mapId) ?? getActiveMap(current);
      return focusNaviInteractionFromSensorReport(current, map, report).navi;
    });
  }, []);

  const confirmInteraction = useCallback(
    (request?: FirstPersonInteractRequest) => {
      const report = createSensorReportFromRequest(request);
      const reportMap = report ? harnessShowcaseMaps.find((candidate) => candidate.id === report.mapId) ?? activeMap : activeMap;
      const reportFocus = report ? focusNaviInteractionFromSensorReport(navi, reportMap, report) : undefined;
      const reportMatchesNaviFocus =
        !navi.activeInteractableId || reportFocus?.view.activeInteractableId === navi.activeInteractableId;
      const confirmationNavi = reportFocus && reportMatchesNaviFocus ? reportFocus.navi : navi;
      const confirmationMap = harnessShowcaseMaps.find((candidate) => candidate.id === confirmationNavi.activeMapId) ?? reportMap;
      const resolution = confirmFocusedNaviInteraction(confirmationNavi, confirmationMap, gameplay, harnessShowcaseMaps);

      setNavi(resolution.navi);
      setGameplay(resolution.gameplay);
      setLastAction(`confirm:${confirmationNavi.activeInteractableId ?? "none"}`);
      setLastOutcome(formatOutcome(resolution.outcome));
      if (resolution.outcome.type === "change-map" && resolution.navi.playerPose) {
        firstPersonBridge.issuePoseCommand(resolution.navi.playerPose);
      }
      if (resolution.outcome.type === "start-script") void startStoryOverlay();
      if (resolution.outcome.type === "start-trial") startTrial(resolution.outcome);
    },
    [activeMap, gameplay, navi, onEnterTrial, options.ensureVnPresentationReady, runtime]
  );

  const firstPersonBridge = useFirstPersonExplorationBridge({
    renderActive: flowMode === "navi" && navi.inputLock === "none",
    map: activeMap,
    ...(assetResolver ? { assetResolver } : {}),
    cameraMode: currentCameraMode,
    inputLock: navi.inputLock,
    inputActionsRef,
    ...(navi.activeInteractableId ? { activeInteractableId: navi.activeInteractableId } : {}),
    onAssetDiagnostic: observeAssetDiagnostic,
    onSensorReport: recordSensorReport,
    onInteractRequest: confirmInteraction
  });

  function confirmFocusedInteraction() {
    confirmInteraction();
  }

  function resetShowcase() {
    runtime.lifecycle.resetRuntime();
    const spawnPose: PlayerPose = { position: initialMap.spawn, yaw: 0, pitch: 0 };
    setNavi({
      ...createInitialNaviState(initialMap.id),
      playerPose: spawnPose
    });
    setGameplay(createGameplayState());
    setTrialRuntime(createInitialHarnessShowcaseTrialRuntime());
    setLastOutcome("reset");
    setLastAction("reset");
    firstPersonBridge.issuePoseCommand(spawnPose);
    if (flowMode === "trial") onEnterNavi?.();
  }

  function moveToPreset(id: PosePresetId) {
    const preset = harnessShowcasePosePresets.find((candidate) => candidate.id === id);
    if (!preset) return;
    const map = harnessShowcaseMaps.find((candidate) => candidate.id === preset.mapId) ?? activeMap;
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

  function startStoryOverlay(): Promise<void> {
    if (startStoryPromiseRef.current) return startStoryPromiseRef.current;
    const promise = (async () => {
      try {
        setLastAction("story:prepare");
        setLastOutcome("preparing");
        if (!(await options.ensureVnPresentationReady())) return;
        setTrialRuntime(createInitialHarnessShowcaseTrialRuntime());
        runtime.lifecycle.startStory();
      } finally {
        startStoryPromiseRef.current = undefined;
      }
    })();
    startStoryPromiseRef.current = promise;
    return promise;
  }

  function startTrial(outcome: Extract<ExplorationOutcome, { type: "start-trial" }>) {
    runtime.lifecycle.resetRuntime();
    const definition = findHarnessShowcaseTrialDefinition(outcome.trialId);
    if (!definition) {
      runtime.diagnostics.observeAssetDiagnostic({
        code: "missing-trial-definition",
        severity: "error",
        message: `Trial definition '${outcome.trialId}' does not exist.`,
        assetId: outcome.trialId,
        kind: "trial"
      });
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
    setLastAction(`trial:start:${definition.id}`);
    setLastOutcome(formatOutcome(outcome));
    onEnterTrial?.();
  }

  function resolveTrialKeywordWithEvidence(evidenceId = harnessShowcaseEvidence.id) {
    applyTrialEvent({ type: "BREAK_KEYWORD", keywordId: "kw:door-lock", evidenceId }, `trial:keyword:${evidenceId}`);
  }

  function resolveTrialTimeout() {
    applyTrialEvent({ type: "TIMEOUT" }, "trial:timeout");
  }

  function exitTrial() {
    setTrialRuntime(createInitialHarnessShowcaseTrialRuntime());
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
    runtime.lifecycle.resetRuntime();
    setNavi((currentNavi) => naviReducer(currentNavi, { type: "CLOSE_OVERLAY" }));
    setLastAction(action);
    setLastOutcome("overlay-closed");
  }

  function restoreFromSave(save: SaveData) {
    if (save.vn) {
      const restored = runtime.lifecycle.restoreVnState({ gameId: save.gameId, state: save.vn });
      if (!restored.ok) return restored;
    }
    if (save.navi) setNavi(save.navi);
    if (save.navi?.playerPose) firstPersonBridge.issuePoseCommand(save.navi.playerPose);
    setGameplay({ inventory: save.inventory, evidence: save.evidence, characters: save.characters });
    if (!save.vn) runtime.lifecycle.resetRuntime();
    setTrialRuntime(
      save.mode === "trial" && save.trial
        ? {
            definition: harnessShowcaseTrial,
            active: true,
            state: save.trial,
            lastOutcome: "restored"
          }
        : createInitialHarnessShowcaseTrialRuntime()
    );
    setLastAction("load:slot");
    setLastOutcome("loaded");
    return { ok: true as const };
  }

  const hostInteractionFacts = useMemo(
    () => ({
      inputLock:
        flowMode === "trial" && trialRuntime.active && trialRuntime.state
          ? trialRuntime.state.inputLock
          : runtime.shell.storyRuntime.active
            ? runtime.shell.interactionFacts.inputLock
            : navi.inputLock,
      naviSubstate: navi.substate,
      isAtStableStop:
        flowMode === "trial"
          ? Boolean(trialRuntime.active && trialRuntime.state && trialRuntime.state.inputLock !== "cutscene")
          : !runtime.shell.storyRuntime.state.presentationWait &&
            !runtime.shell.storyRuntime.state.runtimeWait &&
            (navi.substate === "walk" || navi.substate === "vn2d-overlay"),
      ...(trialRuntime.state?.presentation ? { trialPresentation: trialRuntime.state.presentation } : {})
    }),
    [flowMode, navi.inputLock, navi.substate, runtime.shell.interactionFacts.inputLock, runtime.shell.storyRuntime.active, runtime.shell.storyRuntime.state.presentationWait, runtime.shell.storyRuntime.state.runtimeWait, trialRuntime.active, trialRuntime.state]
  );

  return {
    activeMap,
    closeStoryOverlay,
    confirmFocusedInteraction,
    debug: runtime.debug,
    diagnostics: runtime.diagnostics,
    firstPersonBridge,
    gameplay,
    hostInteractionFacts,
    interactionView,
    lastAction,
    lastOutcome,
    lifecycle: runtime.lifecycle,
    moveToPreset,
    navi,
    presentation: runtime.presentation,
    resetShowcase,
    restoreFromSave,
    runtimeDiagnostics,
    resolveTrialKeywordWithEvidence,
    resolveTrialTimeout,
    shell: runtime.shell,
    trialRuntime,
    exitTrial
  };
}

export function createInitialHarnessShowcaseTrialRuntime(): TrialRuntime {
  return {
    definition: harnessShowcaseTrial,
    active: false,
    lastOutcome: "none"
  };
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
  return harnessShowcaseMaps.find((map) => map.id === navi.activeMapId) ?? initialMap;
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

function findHarnessShowcaseTrialDefinition(trialId: string): TrialDefinition | undefined {
  return harnessShowcaseTrial.id === trialId ? harnessShowcaseTrial : undefined;
}

function toHarnessShowcaseTrialDiagnostic(diagnostic: TrialDefinitionDiagnostic): HarnessShowcaseRuntimeDiagnostic {
  const details = [diagnostic.segmentId, diagnostic.ref].filter(Boolean).join(" ");
  return {
    source: "trial",
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: details ? `${diagnostic.message} (${details})` : diagnostic.message
  };
}

function limitHarnessShowcaseDiagnostics(diagnostics: HarnessShowcaseRuntimeDiagnostic[]): HarnessShowcaseRuntimeDiagnostic[] {
  return limitVnRuntimeDiagnostics(diagnostics as VnRuntimeDiagnostic[]) as HarnessShowcaseRuntimeDiagnostic[];
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
