import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetResolver } from "@v-ronpa/asset-registry";
import {
  advanceStoryTextReveal,
  advanceUiRuntimeTransitions,
  clearMovieOverlay,
  completeStoryTextReveal,
  countStoryTextRevealUnits,
  createStoryTextPacingPlan,
  createStoryTextPlaybackSchedulePlan,
  createStoryTextRevealState,
  createInitialMediaRuntimeState,
  createInitialUiRuntimeState,
  createVnMediaCheckpoint,
  createVnUiCheckpoint,
  deriveUiRuntimeLifecycleState,
  dismissToast,
  hasActiveUiRuntimeTransitions,
  isUiPresentationWait,
  isUiPresentationWaitComplete,
  planDialogueLineAudio,
  reduceDialogueAudioLifecycle,
  selectStoryTextPlaybackAdvanceGate,
  selectStoryTextPlaybackAdvanceRequest,
  selectVisibleRevealRichText,
  selectVisibleRevealText,
  shouldDriveStoryTextReveal,
  startMovieOverlay,
  settleUiRuntimePresentationWait,
  settleUiRuntimeTransitions,
  type StoryTextPlaybackScheduleSource,
  type StoryTextRevealEvent,
  type StoryTextRevealState,
  type DialogueAudioLifecycleSignal,
  type DialogueAudioRuntimeState,
  type MediaRuntimeEffect,
  type MediaRuntimeState,
  type UiRuntimeState,
  type VnOutputRouteTable,
  type VnRuntimeProfile
} from "@v-ronpa/app-vn-dispatch";
import {
  advanceVnSession,
  chooseVnSessionOption,
  completeVnSessionPresentationWait,
  completeVnSessionRuntimeWait,
  createVnSession,
  restoreVnSession,
  stopVnSessionAutomation,
  submitVnSessionInput,
  toggleVnSessionAuto,
  toggleVnSessionSkip,
  type VnSessionPlayStep,
  type VnSessionState
} from "@v-ronpa/app-vn-session";
import {
  createDefaultSettingsSnapshot,
  type DialogueBleepConfig,
  type GameUiAction,
  type GameplayEvent,
  type PixiStageSnapshot,
  type RichTextDocument,
  type RuntimeCommand,
  type RuntimeValue,
  type SaveableVnState,
  type StoryRuntimeSnapshot
} from "@v-ronpa/contracts";
import {
  createHowlerAudioPort,
  createHtmlVideoPort,
  type AudioPort,
  type VideoPort
} from "@v-ronpa/media-save";
import {
  isStoryTextCommand,
  selectCurrentStoryLine,
  type StoryStepperDiagnostic,
  type StoryStepperResult
} from "@v-ronpa/story-engine";
import {
  selectStoryPlaySchedule,
  type StoryPlayAdvanceSource,
  type StoryPlayPacing,
  type StoryPlaySchedule,
  type StoryPlayState,
  type StoryPlayStopReason,
  type StoryPlayTimingPolicy
} from "@v-ronpa/story-play";
import {
  collectVnRuntimeDiagnostics,
  createInitialVnRuntimeDiagnostics,
  createVnMediaPortErrorDiagnostic,
  createVnRuntimeAssetDiagnostic,
  createVnRuntimeStartLabelDiagnostics,
  limitVnRuntimeDiagnostics,
  type VnRuntimeDiagnostic
} from "./runtimeDiagnostics";
import {
  applyVnRuntimeMediaEffects,
  createInitialVnRuntimeMediaHandleStore,
  disposeVnRuntimeMedia,
  resolveVnDialogueVoiceAssetAvailability,
  resolveVnRuntimeMediaSource,
  type VnRuntimeMediaHandleStore
} from "./runtimeMedia";
import { createVnRuntimeRestorePlan } from "./runtimeRestore";
import { compileVnRuntimeCatalog, type CompiledVnRuntimeCatalog } from "./runtimeCatalog";
import { projectVnRuntimeStep } from "./runtimeProjection";
import { collectVnSaveCheckpoint, validateVnRestoreIdentity } from "./checkpoint";
import { coordinateVnScriptNavigation } from "./runtimeNavigationCoordinator";
import {
  createVnRuntimeOperationCoordinator,
  type VnRuntimeOperation
} from "./runtimeOperations";
import type {
  VnStoryTextRevealRuntime,
  VnInteractionFacts,
  VnMediaRuntime,
  PresentationTaskObservation,
  VnPixiStageRuntime,
  VnRuntimeDialogueBleepSettings,
  VnRuntimeStoryTextRevealSettings,
  PrepareVnScriptPresentation,
  VnRestoreResult,
  RestoreVnRuntimeStateInput,
  VnSaveCheckpointResult,
  VnStartResult,
  StartVnStoryOptions,
  UseVnRuntimeResult,
  VnRuntimeDefinition,
  VnRuntimeVoiceSettings,
  VnStoryRuntime,
  VnUiRuntime
} from "./runtimeTypes";
import {
  canAdvanceVnStoryFromSource,
  canCompleteVnPauseRuntimeWaitFromSource,
  canToggleVnStoryAutomation,
  createInitialVnPixiStageRuntime,
  readVnRuntimeNowMs,
  resolveVnPresentationWaitAdvanceSource,
  shouldAnimateVnStoryPlayPacing,
  syncVnRuntimeToastDismissalTimers,
  vnVisualRuntimeDriverKey,
  vnPixiPresentationTaskKey,
  vnPresentationWaitKey,
  vnPresentationWaitTaskKey
} from "./runtimeUtils";
import {
  createVnVoiceAutoAdvanceGateController,
  type VnVoiceAutoAdvanceGateController
} from "./voiceGate";

const DEFAULT_VOICE_SETTINGS: VnRuntimeVoiceSettings = { locale: "zh", volume: 1 };
const DEFAULT_DIALOGUE_BLEEP_SETTINGS: VnRuntimeDialogueBleepSettings = { volume: 1 };
const DEFAULT_STORY_TEXT_REVEAL_SETTINGS: VnRuntimeStoryTextRevealSettings = {
  textSpeed: createDefaultSettingsSnapshot().display.textSpeed
};
const MAX_STORY_TEXT_REVEAL_EVENTS = 50;

export interface UseVnRuntimeOptions extends VnRuntimeDefinition {
  gameId: string;
  prepareScriptPresentation?: PrepareVnScriptPresentation;
  assetResolver?: AssetResolver;
  /** The VN runtime takes exclusive ownership of this port and stops it on reset, restore, and unmount. */
  audioPort?: AudioPort;
  videoPort?: VideoPort;
  routeTable?: VnOutputRouteTable;
  profile?: VnRuntimeProfile;
  storyPlayTiming?: Partial<StoryPlayTimingPolicy>;
  voiceSettings?: VnRuntimeVoiceSettings;
  dialogueBleepConfig?: DialogueBleepConfig;
  dialogueBleepSettings?: VnRuntimeDialogueBleepSettings;
  storyTextRevealSettings?: VnRuntimeStoryTextRevealSettings;
  onGameplayEvents?: (events: GameplayEvent[]) => void;
  onRuntimeStatus?: (status: { action: string; outcome: string }) => void;
  onStoryEnd?: (action: "story:end") => void;
}

interface CommitVnSessionStepInput {
  active: boolean;
  forcePixiCommit?: boolean;
  pacing?: StoryPlayPacing;
  previousMediaState?: MediaRuntimeState;
  previousPixiStage: PixiStageSnapshot;
  previousUiState?: UiRuntimeState;
  session: VnSessionState;
  source: StoryPlayAdvanceSource;
  storyDiagnostics?: StoryStepperDiagnostic[];
  runtimeCommands: RuntimeCommand[];
}

interface CoordinateVnSessionStepInput {
  beforeCommit?: () => void;
  operation?: VnRuntimeOperation<CompiledVnRuntimeCatalog>;
  pacing?: StoryPlayPacing;
  resetExecutedScriptPaths?: boolean;
  previousMediaState?: MediaRuntimeState;
  previousPixiStage: PixiStageSnapshot;
  previousUiState?: UiRuntimeState;
  source: StoryPlayAdvanceSource;
  step: VnSessionPlayStep;
}

type CoordinateVnSessionStepResult =
  | { ok: true; session: VnSessionState }
  | { ok: false; cancelled: boolean; code: string; message: string };

interface CommitStoryTextRevealResult {
  diagnostics: VnRuntimeDiagnostic[];
  effects: MediaRuntimeEffect[];
  hasVoiceBoundary: boolean;
}

export function useVnRuntime({
  assetResolver,
  audioPort: configuredAudioPort,
  storyTextRevealSettings = DEFAULT_STORY_TEXT_REVEAL_SETTINGS,
  dialogueBleepConfig,
  dialogueBleepSettings = DEFAULT_DIALOGUE_BLEEP_SETTINGS,
  catalog,
  entry,
  gameId,
  onGameplayEvents,
  onRuntimeStatus,
  onStoryEnd,
  profile,
  prepareScriptPresentation,
  routeTable,
  storyPlayTiming,
  videoPort: configuredVideoPort,
  voiceSettings = DEFAULT_VOICE_SETTINGS
}: UseVnRuntimeOptions): UseVnRuntimeResult {
  const compiledCatalog = useMemo(
    () => compileVnRuntimeCatalog(entry, catalog),
    [catalog, entry.initialScriptPath, entry.startLabel]
  );
  const bootSession = useMemo(
    () =>
      compiledCatalog.recordsByPath.get(entry.initialScriptPath)?.bootSession ??
      createVnSession({ scriptPath: entry.initialScriptPath, sourceText: "" }).session,
    [compiledCatalog, entry.initialScriptPath]
  );
  const startLabelDiagnostics = useMemo(
    () => createVnRuntimeStartLabelDiagnostics(bootSession.script, entry.startLabel),
    [bootSession.script, entry.startLabel]
  );
  const hasInvalidStartLabel = startLabelDiagnostics.some((diagnostic) => diagnostic.severity === "error");
  const runtimeProfile = profile ?? entry.profile;
  const audioPort = useMemo(() => configuredAudioPort ?? createHowlerAudioPort(), [configuredAudioPort]);
  const videoPort = useMemo(() => configuredVideoPort ?? createHtmlVideoPort(), [configuredVideoPort]);
  const initialRuntimeDiagnostics = useMemo(
    () =>
      limitVnRuntimeDiagnostics([
        ...compiledCatalog.records.flatMap((record) =>
          createInitialVnRuntimeDiagnostics(record.bootSession.diagnostics.parser, record.bootSession.diagnostics.compiler)
        ),
        ...compiledCatalog.diagnostics.map((diagnostic) => ({
          source: "story" as const,
          code: diagnostic.code,
          severity: diagnostic.severity,
          message: diagnostic.message
        })),
        ...startLabelDiagnostics
      ]),
    [compiledCatalog, startLabelDiagnostics]
  );
  const [session, setSession] = useState<VnSessionState>(() => ({ ...bootSession, active: false }));
  const [pixiStageRuntime, setPixiStageRuntime] = useState<VnPixiStageRuntime>(() => createInitialVnPixiStageRuntime());
  const [mediaRuntime, setMediaRuntime] = useState<VnMediaRuntime>(() => ({ state: createInitialMediaRuntimeState() }));
  const [uiRuntime, setUiRuntime] = useState<VnUiRuntime>(() => ({ state: createInitialUiRuntimeState() }));
  const [storyTextRevealRuntime, setStoryTextRevealRuntime] = useState<VnStoryTextRevealRuntime>(() => ({
    events: [],
    eventSequence: 0
  }));
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<VnRuntimeDiagnostic[]>(() => initialRuntimeDiagnostics);
  const [storySession, setStorySession] = useState(0);
  const [executedScriptPaths, setExecutedScriptPaths] = useState<readonly string[]>([]);

  const sessionRef = useRef(session);
  const executedScriptPathsRef = useRef(executedScriptPaths);
  const pixiStageRuntimeRef = useRef(pixiStageRuntime);
  const mediaRuntimeRef = useRef(mediaRuntime);
  const uiRuntimeRef = useRef(uiRuntime);
  const storyTextRevealRuntimeRef = useRef(storyTextRevealRuntime);
  const dialogueAudioRuntimeRef = useRef<DialogueAudioRuntimeState>({});
  const mediaHandlesRef = useRef<VnRuntimeMediaHandleStore>(createInitialVnRuntimeMediaHandleStore());
  const pendingMoviePlaybackRef = useRef<{ sourceRef: string; uri: string } | undefined>(undefined);
  const toastTimeoutsRef = useRef<Record<string, number>>({});
  const observedWaitTasksRef = useRef<{ waitKey: string; observed: Set<string> } | undefined>(undefined);
  const completingWaitKeyRef = useRef<string | undefined>(undefined);
  const storyPlayHostRef = useRef<{ active: boolean; schedule: StoryPlaySchedule }>({
    active: false,
    schedule: { type: "idle" }
  });
  const advanceStoryRef = useRef<(source?: StoryPlayAdvanceSource) => void>(() => undefined);
  const voiceAutoAdvanceGateControllerRef = useRef<VnVoiceAutoAdvanceGateController | undefined>(undefined);
  const voiceEffectTokenRef = useRef(0);
  const compiledCatalogRef = useRef<CompiledVnRuntimeCatalog>(compiledCatalog);
  if (compiledCatalogRef.current !== compiledCatalog) compiledCatalogRef.current = compiledCatalog;
  const runtimeOperationsRef = useRef(createVnRuntimeOperationCoordinator<CompiledVnRuntimeCatalog>());
  const navigationActiveRef = useRef(false);
  const [navigationActive, setNavigationActive] = useState(false);

  useEffect(() => {
    const operation = runtimeOperationsRef.current.current();
    if (operation && operation.catalog !== compiledCatalog) invalidateRuntimeOperation();
  }, [compiledCatalog]);

  const storyRuntime: VnStoryRuntime = useMemo(
    () => ({ active: session.active, executedScriptPaths, state: session.story }),
    [executedScriptPaths, session.active, session.story]
  );
  const storyPlay = session.play;
  const storyPlaySchedule = useMemo(
    () =>
      selectStoryPlaySchedule(session.play, session.story, {
        active: session.active,
        hostReadyForAuto: true,
        hostBlocked: navigationActive,
        ...(storyPlayTiming ? { timing: storyPlayTiming } : {})
      }),
    [navigationActive, session.active, session.play, session.story, storyPlayTiming]
  );
  const storyPlayActiveActions: Partial<Record<GameUiAction, boolean>> = useMemo(
    () => ({
      "toggle-auto": session.play.mode === "auto",
      "toggle-skip": session.play.mode === "skip"
    }),
    [session.play.mode]
  );

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    pixiStageRuntimeRef.current = pixiStageRuntime;
  }, [pixiStageRuntime]);

  useEffect(() => {
    mediaRuntimeRef.current = mediaRuntime;
  }, [mediaRuntime]);

  useEffect(() => {
    uiRuntimeRef.current = uiRuntime;
  }, [uiRuntime]);

  useEffect(() => {
    storyTextRevealRuntimeRef.current = storyTextRevealRuntime;
  }, [storyTextRevealRuntime]);

  useEffect(() => {
    storyPlayHostRef.current = { active: session.active, schedule: storyPlaySchedule };
  }, [session.active, storyPlaySchedule]);

  useEffect(() => {
    const key = session.story.presentationWait ? vnPresentationWaitKey(session.story.presentationWait) : undefined;
    if (key !== completingWaitKeyRef.current) completingWaitKeyRef.current = undefined;
  }, [session.story.presentationWait]);

  const appendRuntimeDiagnostics = useCallback((diagnostics: VnRuntimeDiagnostic[]) => {
    if (diagnostics.length === 0) return;
    setRuntimeDiagnostics((current) => limitVnRuntimeDiagnostics([...current, ...diagnostics]));
  }, []);

  const observeAssetDiagnostic = useCallback(
    (diagnostic: { code?: string; severity?: "info" | "warning" | "error"; message: string; assetId?: string; kind?: string }) => {
      appendRuntimeDiagnostics([createVnRuntimeAssetDiagnostic(diagnostic)]);
    },
    [appendRuntimeDiagnostics]
  );

  const attachMovieElement = useCallback(
    (element: HTMLVideoElement | null) => {
      if (!element) {
        videoPort.stop();
        return;
      }
      videoPort.attach(element);
      const playback = pendingMoviePlaybackRef.current;
      if (!playback) return;
      void videoPort.play(playback.uri).catch((error) => {
        appendRuntimeDiagnostics([createVnMediaPortErrorDiagnostic(error instanceof Error ? error.message : String(error))]);
      });
    },
    [appendRuntimeDiagnostics, videoPort]
  );

  const dismissRuntimeToast = useCallback((toastId: string) => {
    setUiRuntimeNow((current) => ({ state: dismissToast(current.state, toastId) }));
  }, []);

  useEffect(() => {
    if (!session.active) return;
    const plan = createStoryTextPlaybackSchedulePlan({
      schedule: storyPlaySchedule,
      reveal: storyTextRevealRuntimeRef.current.state,
      nowMs: readVnRuntimeNowMs()
    });
    if (plan.type === "idle") return;
    storyPlayHostRef.current = { active: session.active, schedule: storyPlaySchedule };
    const scheduled = storyPlaySchedule;
    const source = plan.source;
    const timeout = window.setTimeout(() => {
      const currentHost = storyPlayHostRef.current;
      if (!currentHost.active || currentHost.schedule !== scheduled) return;
      requestStoryTextPlaybackScheduleAdvance(source);
    }, plan.delayMs);
    return () => window.clearTimeout(timeout);
  }, [storyTextRevealRuntime.state?.lineKey, storyTextRevealRuntime.state?.status, session.active, storyPlaySchedule]);

  const shouldDriveVisualRuntime =
    shouldDriveStoryTextReveal({ active: session.active, reveal: storyTextRevealRuntime.state }) ||
    hasActiveUiRuntimeTransitions(uiRuntime.state);
  const visualRuntimeDriverKey = vnVisualRuntimeDriverKey(storyTextRevealRuntime.state, uiRuntime.state);

  useEffect(() => {
    if (!shouldDriveVisualRuntime) return;
    let frame = 0;
    const tick = () => {
      const nowMs = readVnRuntimeNowMs();
      advanceActiveStoryTextReveal(nowMs);
      advanceActiveUiRuntimeTransitions(nowMs);
      if (
        shouldDriveStoryTextReveal({ active: sessionRef.current.active, reveal: storyTextRevealRuntimeRef.current.state }) ||
        hasActiveUiRuntimeTransitions(uiRuntimeRef.current.state)
      ) {
        frame = window.requestAnimationFrame(tick);
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [shouldDriveVisualRuntime, visualRuntimeDriverKey]);

  useEffect(() => {
    const wait = session.story.presentationWait;
    if (!session.active || !wait) return;
    if (isUiPresentationWait(wait)) {
      completeUiPresentationWaitIfReady("system");
      return;
    }
    const expectedTasks = wait.expectedTasks ?? [];
    if (expectedTasks.length === 0) {
      const timeout = window.setTimeout(() => completePresentationWaitAndAdvance("system"), 0);
      return () => window.clearTimeout(timeout);
    }
    const timeout = window.setTimeout(() => {
      appendRuntimeDiagnostics([
        {
          source: "story",
          code: "presentation-wait-timeout",
          severity: "warning",
          message: `Presentation wait for @${wait.commandId} exceeded its Pixi task duration fallback; completing the wait.`
        }
      ]);
      completePresentationWaitAndAdvance("system", { settlePixi: true });
    }, Math.max(1000, wait.durationMs + 1000));
    return () => window.clearTimeout(timeout);
  }, [appendRuntimeDiagnostics, session.active, session.story.presentationWait]);

  useEffect(() => {
    const wait = session.story.runtimeWait;
    if (!session.active || wait?.kind !== "pause") return;
    if (wait.mode === "confirm" || wait.durationMs === undefined) return;
    const timeout = window.setTimeout(() => completeRuntimeWaitAndAdvance("system", "pause"), wait.durationMs);
    return () => window.clearTimeout(timeout);
  }, [session.active, session.story.runtimeWait]);

  useEffect(() => {
    syncVnRuntimeToastDismissalTimers({
      state: uiRuntime.state,
      timeouts: toastTimeoutsRef.current,
      setTimeoutFn: window.setTimeout.bind(window),
      clearTimeoutFn: window.clearTimeout.bind(window),
      dismissToastId: (toastId) => setUiRuntimeNow((current) => ({ state: dismissToast(current.state, toastId) }))
    });
  }, [uiRuntime.state.toasts]);

  useEffect(() => {
    return () => {
      runtimeOperationsRef.current.invalidate();
      for (const timeout of Object.values(toastTimeoutsRef.current)) window.clearTimeout(timeout);
      toastTimeoutsRef.current = {};
      disposeRuntimeMedia();
    };
  }, [audioPort, videoPort]);

  function setSessionNow(next: VnSessionState | ((current: VnSessionState) => VnSessionState)) {
    const resolved = typeof next === "function" ? next(sessionRef.current) : next;
    sessionRef.current = resolved;
    setSession(resolved);
  }

  function setExecutedScriptPathsNow(next: readonly string[]) {
    const resolved = [...new Set(next)];
    executedScriptPathsRef.current = resolved;
    setExecutedScriptPaths(resolved);
  }

  function beginRuntimeOperation(): VnRuntimeOperation<CompiledVnRuntimeCatalog> {
    return runtimeOperationsRef.current.begin(compiledCatalogRef.current);
  }

  function invalidateRuntimeOperation() {
    runtimeOperationsRef.current.invalidate();
    navigationActiveRef.current = false;
    setNavigationActive(false);
  }

  function isCurrentRuntimeOperation(operation: VnRuntimeOperation<CompiledVnRuntimeCatalog>): boolean {
    return runtimeOperationsRef.current.isCurrent(operation)
      && operation.catalog === compiledCatalogRef.current
      && !operation.controller.signal.aborted;
  }

  function setNavigationActiveNow(active: boolean) {
    navigationActiveRef.current = active;
    setNavigationActive(active);
  }

  function setPixiStageRuntimeNow(next: VnPixiStageRuntime | ((current: VnPixiStageRuntime) => VnPixiStageRuntime)) {
    const resolved = typeof next === "function" ? next(pixiStageRuntimeRef.current) : next;
    pixiStageRuntimeRef.current = resolved;
    setPixiStageRuntime(resolved);
  }

  function setMediaRuntimeNow(next: VnMediaRuntime | ((current: VnMediaRuntime) => VnMediaRuntime)) {
    const resolved = typeof next === "function" ? next(mediaRuntimeRef.current) : next;
    mediaRuntimeRef.current = resolved;
    setMediaRuntime(resolved);
  }

  function setUiRuntimeNow(next: VnUiRuntime | ((current: VnUiRuntime) => VnUiRuntime)) {
    const resolved = typeof next === "function" ? next(uiRuntimeRef.current) : next;
    uiRuntimeRef.current = resolved;
    setUiRuntime(resolved);
  }

  function setStoryTextRevealRuntimeNow(next: VnStoryTextRevealRuntime | ((current: VnStoryTextRevealRuntime) => VnStoryTextRevealRuntime)) {
    const resolved = typeof next === "function" ? next(storyTextRevealRuntimeRef.current) : next;
    storyTextRevealRuntimeRef.current = resolved;
    setStoryTextRevealRuntime(resolved);
  }

  function getVoiceAutoAdvanceGateController(): VnVoiceAutoAdvanceGateController {
    if (!voiceAutoAdvanceGateControllerRef.current) {
      voiceAutoAdvanceGateControllerRef.current = createVnVoiceAutoAdvanceGateController({
        advance: (source) => {
          if (!storyPlayHostRef.current.active) return;
          advanceStoryRef.current(source);
        },
        clearTimeoutFn: window.clearTimeout.bind(window),
        setTimeoutFn: window.setTimeout.bind(window),
        stopVoice: stopActiveVoiceHandle
      });
    }
    return voiceAutoAdvanceGateControllerRef.current;
  }

  function stopActiveVoiceHandle() {
    mediaHandlesRef.current.voice?.stop();
    delete mediaHandlesRef.current.voice;
  }

  function beginVoiceBoundary(): number {
    voiceEffectTokenRef.current += 1;
    getVoiceAutoAdvanceGateController().clear();
    return voiceEffectTokenRef.current;
  }

  function clearVoiceAutoAdvanceGate(options: { stopVoice?: boolean } = {}) {
    voiceEffectTokenRef.current += 1;
    getVoiceAutoAdvanceGateController().clear(options);
  }

  function disposeRuntimeMedia() {
    voiceEffectTokenRef.current += 1;
    voiceAutoAdvanceGateControllerRef.current?.clear();
    mediaHandlesRef.current = disposeVnRuntimeMedia(mediaHandlesRef.current, audioPort, videoPort);
    pendingMoviePlaybackRef.current = undefined;
    dialogueAudioRuntimeRef.current = {};
  }

  function requestStoryTextPlaybackScheduleAdvance(source: StoryTextPlaybackScheduleSource): boolean {
    const revealGate = selectStoryTextPlaybackAdvanceGate({ source, reveal: storyTextRevealRuntimeRef.current.state });
    const voiceReady = revealGate.ready ? getVoiceAutoAdvanceGateController().request(source) : false;
    const request = selectStoryTextPlaybackAdvanceRequest({ revealGate, voiceReady });
    if (request.type === "blocked") return false;
    advanceStory(request.source);
    return true;
  }

  function appendStoryTextRevealEvents(state: StoryTextRevealState, events: StoryTextRevealEvent[]) {
    const richText = selectCurrentStoryLine(sessionRef.current.story)?.richText;
    setStoryTextRevealRuntimeNow((current) => ({
      state,
      events: events.length > 0 ? [...current.events, ...events].slice(-MAX_STORY_TEXT_REVEAL_EVENTS) : current.events,
      eventSequence: current.eventSequence + events.length,
      visibleText: selectVisibleRevealText(state) ?? state.text,
      visibleRichText: selectVisibleRevealRichText(richText, state)
    }));
    if (events.some((event) => event.type === "reveal-finish")) {
      applyDialogueAudioLifecycleSignal({ type: "line-finish", lineKey: state.lineKey });
    }
  }

  function advanceActiveStoryTextReveal(nowMs = readVnRuntimeNowMs()) {
    const reveal = storyTextRevealRuntimeRef.current.state;
    if (!reveal || reveal.status === "complete") return;
    const step = advanceStoryTextReveal(reveal, nowMs);
    if (
      step.events.length === 0 &&
      step.state.status === reveal.status &&
      step.state.visibleUnitCount === reveal.visibleUnitCount
    ) {
      return;
    }
    appendStoryTextRevealEvents(step.state, step.events);
  }

  function advanceActiveUiRuntimeTransitions(nowMs: number) {
    if (!hasActiveUiRuntimeTransitions(uiRuntimeRef.current.state)) return;
    setUiRuntimeNow((current) => {
      const state = advanceUiRuntimeTransitions(current.state, nowMs);
      return state === current.state ? current : { state };
    });
    completeUiPresentationWaitIfReady("system");
  }

  function completeUiPresentationWaitIfReady(source: StoryPlayAdvanceSource) {
    const wait = sessionRef.current.story.presentationWait;
    if (!isUiPresentationWait(wait)) return;
    if (isUiPresentationWaitComplete(uiRuntimeRef.current.state, wait)) completePresentationWaitAndAdvance(source);
  }

  function completeActiveStoryTextReveal(): boolean {
    const reveal = storyTextRevealRuntimeRef.current.state;
    if (!reveal || reveal.status === "complete") return false;
    const step = completeStoryTextReveal(reveal, readVnRuntimeNowMs());
    appendStoryTextRevealEvents(step.state, step.events);
    return true;
  }

  function clearStoryTextRevealRuntime(reason = "story-text-reveal:clear") {
    applyDialogueAudioLifecycleSignal({ type: "clear", reason });
    setStoryTextRevealRuntimeNow({ events: [], eventSequence: 0 });
  }

  function applyDialogueAudioLifecycleSignal(signal: DialogueAudioLifecycleSignal) {
    const step = reduceDialogueAudioLifecycle(dialogueAudioRuntimeRef.current, signal);
    dialogueAudioRuntimeRef.current = step.state;
    if (step.effects.length === 0) return;
    void applyVnRuntimeMediaEffects({
      audioPort,
      effects: step.effects,
      handles: mediaHandlesRef.current,
      resolver: ({ kind, sourceRef }) =>
        resolveVnRuntimeMediaSource({
          kind,
          sourceRef,
          ...(assetResolver ? { assetResolver } : {})
        })
    }).then((result) => appendRuntimeDiagnostics(result.diagnostics));
  }

  function cancelStoryPlayHostSchedule() {
    storyPlayHostRef.current = { active: sessionRef.current.active, schedule: { type: "idle" } };
  }

  function resetRuntime() {
    invalidateRuntimeOperation();
    resetRuntimeState();
  }

  function resetRuntimeState() {
    cancelStoryPlayHostSchedule();
    clearStoryTextRevealRuntime();
    observedWaitTasksRef.current = undefined;
    completingWaitKeyRef.current = undefined;
    const nextBoot = compiledCatalogRef.current.recordsByPath.get(entry.initialScriptPath)?.bootSession ?? bootSession;
    setSessionNow({ ...nextBoot, active: false });
    setExecutedScriptPathsNow([]);
    disposeRuntimeMedia();
    setMediaRuntimeNow({ state: createInitialMediaRuntimeState() });
    setUiRuntimeNow({ state: createInitialUiRuntimeState() });
    setRuntimeDiagnostics(initialRuntimeDiagnostics);
    setPixiStageRuntimeNow((current) => ({
      ...createInitialVnPixiStageRuntime(),
      hintSequence: current.hintSequence + 1
    }));
    setStorySession((current) => current + 1);
  }

  async function startStory(_options: StartVnStoryOptions = {}): Promise<VnStartResult> {
    const currentCatalog = compiledCatalogRef.current;
    const nextBoot = currentCatalog.recordsByPath.get(entry.initialScriptPath)?.bootSession;
    const catalogInvalid =
      hasInvalidStartLabel ||
      currentCatalog.diagnostics.length > 0 ||
      currentCatalog.records.some((record) =>
        [...record.bootSession.diagnostics.parser, ...record.bootSession.diagnostics.compiler].some(
          (diagnostic) => diagnostic.severity === "error"
        )
      );
    if (catalogInvalid || !nextBoot) {
      onRuntimeStatus?.({ action: "story:start", outcome: "catalog-invalid" });
      return { ok: false, code: "catalog-invalid", message: "The VN runtime catalog is not linkable." };
    }
    const operation = beginRuntimeOperation();
    setNavigationActiveNow(true);
    const prepared = await prepareRuntimeScript(nextBoot.script.scriptPath, undefined, operation);
    if (!isCurrentRuntimeOperation(operation)) {
      return { ok: false, code: "operation-cancelled", message: "VN start was cancelled." };
    }
    if (!prepared.ok) {
      setNavigationActiveNow(false);
      onRuntimeStatus?.({ action: "story:start", outcome: "presentation-prepare-failed" });
      return { ok: false, code: "presentation-prepare-failed", message: prepared.message };
    }
    const resetPixi = createInitialVnPixiStageRuntime().snapshot;
    const firstStep = advanceVnSession(nextBoot, "start");
    const coordinated = await coordinateVnSessionStep({
      beforeCommit: () => {
        cancelStoryPlayHostSchedule();
        clearStoryTextRevealRuntime();
        observedWaitTasksRef.current = undefined;
        completingWaitKeyRef.current = undefined;
        disposeRuntimeMedia();
        setRuntimeDiagnostics(initialRuntimeDiagnostics);
        setStorySession((current) => current + 1);
      },
      operation,
      pacing: firstStep.playStep.intent.pacing,
      resetExecutedScriptPaths: true,
      previousMediaState: createInitialMediaRuntimeState(),
      previousPixiStage: resetPixi,
      previousUiState: createInitialUiRuntimeState(),
      source: firstStep.playStep.intent.source,
      step: firstStep
    });
    if (!coordinated.ok) {
      return coordinated.cancelled
        ? { ok: false, code: "operation-cancelled", message: coordinated.message }
        : {
            ok: false,
            code: coordinated.code === "presentation-prepare-failed" ? "presentation-prepare-failed" : "script-navigation-failed",
            message: coordinated.message
          };
    }
    onRuntimeStatus?.({
      action: "story:start",
      outcome: coordinated.session.story.presentationWait
        ? "presentation-wait"
        : coordinated.session.story.pendingChoices.length > 0
          ? "choices"
          : "line"
    });
    return { ok: true };
  }

  async function prepareRuntimeScript(
    scriptPath: string,
    pixiStage: PixiStageSnapshot | undefined,
    operation: VnRuntimeOperation<CompiledVnRuntimeCatalog>
  ) {
    if (!prepareScriptPresentation) return { ok: true as const };
    try {
      return await prepareScriptPresentation({
        scriptPath,
        ...(pixiStage ? { pixiStage } : {}),
        signal: operation.controller.signal
      });
    } catch (error) {
      return {
        ok: false as const,
        code: "presentation-prepare-failed",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async function coordinateVnSessionStep({
    beforeCommit,
    operation: requestedOperation,
    pacing = "normal",
    previousMediaState,
    previousPixiStage,
    previousUiState,
    resetExecutedScriptPaths = false,
    source,
    step
  }: CoordinateVnSessionStepInput): Promise<CoordinateVnSessionStepResult> {
    const navigationRequest = step.playStep.story.navigationRequest;
    let operation = requestedOperation;

    if (navigationRequest && !operation) {
      operation = beginRuntimeOperation();
      setNavigationActiveNow(true);
    }

    const fail = (code: string, message: string, cancelled = false): CoordinateVnSessionStepResult => {
      if (operation && isCurrentRuntimeOperation(operation)) setNavigationActiveNow(false);
      if (!cancelled) {
        appendRuntimeDiagnostics([{ source: "story", code, severity: "error", message }]);
      }
      return { ok: false, cancelled, code, message };
    };

    const coordinated = await coordinateVnScriptNavigation({
      catalog: operation?.catalog ?? compiledCatalogRef.current,
      isCancelled: () => Boolean(operation && !isCurrentRuntimeOperation(operation)),
      prepareScript: (scriptPath) => operation
        ? prepareRuntimeScript(scriptPath, undefined, operation)
        : Promise.resolve({
            ok: false as const,
            code: "script-navigation-operation-missing",
            message: "Script navigation has no active operation."
          }),
      source,
      step
    });
    if (!coordinated.ok) return fail(coordinated.code, coordinated.message, coordinated.cancelled);
    const nextSession = coordinated.session;
    beforeCommit?.();
    setExecutedScriptPathsNow(resetExecutedScriptPaths
      ? coordinated.executedScriptPaths
      : [...executedScriptPathsRef.current, ...coordinated.executedScriptPaths]);
    commitVnSessionStep({
      active: !nextSession.story.ended,
      forcePixiCommit: Boolean(requestedOperation && source === "start"),
      pacing,
      ...(previousMediaState ? { previousMediaState } : {}),
      previousPixiStage,
      ...(previousUiState ? { previousUiState } : {}),
      runtimeCommands: coordinated.runtimeCommands,
      session: nextSession,
      source,
      storyDiagnostics: coordinated.storyDiagnostics
    });
    if (operation && isCurrentRuntimeOperation(operation)) setNavigationActiveNow(false);
    if (nextSession.story.ended) onStoryEnd?.("story:end");
    return { ok: true, session: nextSession };
  }

  function advanceStory(source: StoryPlayAdvanceSource = "manual") {
    if (navigationActiveRef.current) return;
    const current = sessionRef.current;
    if (!current.active) return;

    if (storyTextRevealRuntimeRef.current.state?.status === "revealing") {
      if (source === "manual") {
        cancelStoryPlayHostSchedule();
        setSessionNow((latest) => stopVnSessionAutomation(latest, "manual-takeover"));
        completeActiveStoryTextReveal();
        onRuntimeStatus?.({ action: "story-text:reveal-complete", outcome: "line-complete" });
      } else if (source === "skip") {
        cancelStoryPlayHostSchedule();
        clearVoiceAutoAdvanceGate({ stopVoice: true });
        completeActiveStoryTextReveal();
        onRuntimeStatus?.({ action: "story:skip", outcome: "line-complete" });
      }
      return;
    }

    if (source === "manual" || source === "skip") {
      cancelStoryPlayHostSchedule();
    }

    if (current.story.presentationWait) {
      completePresentationWaitAndAdvance(source, { settlePixi: true, settleUi: true });
      return;
    }

    if (current.story.runtimeWait) {
      if (current.story.runtimeWait.kind === "pause") {
        if (!canCompleteVnPauseRuntimeWaitFromSource(current.story.runtimeWait, source)) {
          onRuntimeStatus?.({ action: source === "manual" ? "story:advance" : `story:${source}`, outcome: "timer-wait" });
          return;
        }
        completeRuntimeWaitAndAdvance(source, "pause");
        return;
      }
      if (current.story.runtimeWait.kind === "movie") {
        completeRuntimeWaitAndAdvance(source, "movie");
        return;
      }
      onRuntimeStatus?.({ action: source === "manual" ? "story:advance" : `story:${source}`, outcome: "input-wait" });
      return;
    }

    const step = advanceVnSession(current, source);
    void coordinateVnSessionStep({
      beforeCommit: () => {
        if (
          (source === "manual" || source === "skip")
          && canAdvanceVnStoryFromSource({ active: current.active, state: current.story }, source)
        ) clearVoiceAutoAdvanceGate({ stopVoice: true });
      },
      pacing: step.playStep.intent.pacing,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      source,
      step
    }).then((result) => {
      if (!result.ok || result.session.story.ended) return;
      onRuntimeStatus?.({
        action: source === "manual" ? "story:advance" : `story:${source}`,
        outcome: result.session.story.presentationWait
          ? "presentation-wait"
          : result.session.story.pendingChoices.length > 0
            ? "choices"
            : "line"
      });
    });
  }
  advanceStoryRef.current = advanceStory;

  function chooseStory(index: number) {
    if (navigationActiveRef.current) return;
    cancelStoryPlayHostSchedule();
    const current = sessionRef.current;
    if (!current.active) return;
    const step = chooseVnSessionOption(current, index);
    void coordinateVnSessionStep({
      beforeCommit: () => clearVoiceAutoAdvanceGate({ stopVoice: true }),
      pacing: step.playStep.intent.pacing,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      source: "choice",
      step
    }).then((result) => {
      if (!result.ok || result.session.story.ended) return;
      onRuntimeStatus?.({
        action: `choice:${index}`,
        outcome: result.session.story.presentationWait
          ? "presentation-wait"
          : result.session.story.variables.route
            ? `route:${String(result.session.story.variables.route)}`
            : "choice"
      });
    });
  }

  function submitStoryInput(value: string | number | boolean) {
    if (navigationActiveRef.current) return;
    cancelStoryPlayHostSchedule();
    const current = sessionRef.current;
    if (!current.active || current.story.runtimeWait?.kind !== "input") return;
    const step = submitVnSessionInput(current, value);
    void coordinateVnSessionStep({
      beforeCommit: () => clearVoiceAutoAdvanceGate({ stopVoice: true }),
      pacing: step.playStep.intent.pacing,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      source: "manual",
      step
    }).then((result) => {
      if (result.ok && !result.session.story.ended) {
        onRuntimeStatus?.({ action: "input:submit", outcome: "input-submitted" });
      }
    });
  }

  function toggleStoryAuto() {
    if (navigationActiveRef.current) return;
    if (!canToggleVnStoryAutomation({ active: sessionRef.current.active, state: sessionRef.current.story })) return;
    const wasAuto = sessionRef.current.play.mode === "auto";
    if (wasAuto) {
      cancelStoryPlayHostSchedule();
      clearVoiceAutoAdvanceGate();
    }
    setSessionNow((current) => toggleVnSessionAuto(current));
    onRuntimeStatus?.({ action: "story:auto", outcome: wasAuto ? "manual" : "auto" });
  }

  function toggleStorySkip() {
    if (navigationActiveRef.current) return;
    if (!canToggleVnStoryAutomation({ active: sessionRef.current.active, state: sessionRef.current.story })) return;
    const wasSkip = sessionRef.current.play.mode === "skip";
    if (wasSkip) cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate({ stopVoice: true });
    if (!wasSkip && storyTextRevealRuntimeRef.current.state?.status === "revealing") {
      completeActiveStoryTextReveal();
    }
    setSessionNow((current) => toggleVnSessionSkip(current));
    onRuntimeStatus?.({ action: "story:skip", outcome: wasSkip ? "manual" : "skip" });
  }

  function stopStoryAutomation(reason: StoryPlayStopReason) {
    cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate();
    setSessionNow((current) => stopVnSessionAutomation(current, reason));
  }

  function completeMoviePlayback() {
    if (sessionRef.current.story.runtimeWait?.kind === "movie") {
      completeRuntimeWaitAndAdvance("system", "movie");
      return;
    }
    pendingMoviePlaybackRef.current = undefined;
    videoPort.stop();
    setUiRuntimeNow((current) => ({ state: clearMovieOverlay(current.state) }));
  }

  async function restoreVnState({ gameId: savedGameId, state }: RestoreVnRuntimeStateInput): Promise<VnRestoreResult> {
    const operation = beginRuntimeOperation();
    setNavigationActiveNow(true);
    const target = compiledCatalogRef.current.recordsByPath.get(state.script.scriptPath);
    const rejection = validateVnRestoreIdentity({
      expectedEntryId: entry.id,
      expectedGameId: gameId,
      ...(target ? { expectedScript: target.source } : {}),
      savedEntryId: state.entryId,
      savedGameId,
      savedScript: state.script
    });
    if (rejection) {
      setNavigationActiveNow(false);
      appendRuntimeDiagnostics([
        { source: "story", severity: "error", code: rejection.code, message: rejection.message }
      ]);
      return rejection;
    }
    if (!target) {
      setNavigationActiveNow(false);
      return { ok: false, code: "script-missing", message: `Save script '${state.script.scriptPath}' is not registered.` };
    }
    if (state.story.instructionPointer > target.script.commands.length) {
      const invalidPointer = {
        ok: false as const,
        code: "instruction-pointer-invalid" as const,
        message: `Save instruction pointer ${state.story.instructionPointer} is outside '${target.script.scriptPath}'.`
      };
      setNavigationActiveNow(false);
      appendRuntimeDiagnostics([{ source: "story", severity: "error", code: invalidPointer.code, message: invalidPointer.message }]);
      return invalidPointer;
    }
    const prepared = await prepareRuntimeScript(target.script.scriptPath, state.pixiStage, operation);
    if (!isCurrentRuntimeOperation(operation)) {
      return { ok: false, code: "operation-cancelled", message: "VN restore was cancelled." };
    }
    if (!prepared.ok) {
      setNavigationActiveNow(false);
      appendRuntimeDiagnostics([{ source: "story", severity: "error", code: prepared.code, message: prepared.message }]);
      return { ok: false, code: "presentation-prepare-failed", message: prepared.message };
    }
    cancelStoryPlayHostSchedule();
    clearStoryTextRevealRuntime();
    observedWaitTasksRef.current = undefined;
    completingWaitKeyRef.current = undefined;
    const plan = createVnRuntimeRestorePlan({
      active: !state.story.ended,
      media: state.media,
      pixiStage: state.pixiStage,
      script: target.script,
      story: state.story,
      ui: state.ui
    });
    disposeRuntimeMedia();
    setSessionNow(
      restoreVnSession({
        active: plan.storyRuntime.active,
        script: target.script,
        snapshot: { story: plan.storyRuntime.state, play: plan.storyPlay }
      })
    );
    setExecutedScriptPathsNow([target.script.scriptPath]);
    setMediaRuntimeNow({ state: plan.mediaRuntime });
    setUiRuntimeNow({ state: plan.uiRuntime });
    setRuntimeDiagnostics((current) => limitVnRuntimeDiagnostics([...current, ...plan.diagnostics]));
    setPixiStageRuntimeNow((current) => ({
      ...plan.pixiStageRuntime,
      hintSequence: current.hintSequence + 1
    }));
    setStorySession((current) => current + 1);
    setNavigationActiveNow(false);
    if (plan.mediaEffects.length > 0) {
      void applyVnRuntimeMediaEffects({
        audioPort,
        effects: plan.mediaEffects,
        handles: mediaHandlesRef.current,
        resolver: ({ kind, sourceRef }) =>
          resolveVnRuntimeMediaSource({
            kind,
            sourceRef,
            ...(assetResolver ? { assetResolver } : {})
          })
      }).then((result) => appendRuntimeDiagnostics(result.diagnostics));
    }
    return { ok: true };
  }

  function commitVnSessionStep({
    active,
    forcePixiCommit = false,
    pacing = "normal",
    previousMediaState = mediaRuntimeRef.current.state,
    previousPixiStage,
    previousUiState = uiRuntimeRef.current.state,
    runtimeCommands,
    session: nextSession,
    source,
    storyDiagnostics = []
  }: CommitVnSessionStepInput) {
    const nowMs = readVnRuntimeNowMs();
    const animatePixi = shouldAnimateVnStoryPlayPacing(pacing);
    const projection = projectVnRuntimeStep({
      active,
      animatePixi,
      nowMs,
      previousMediaState,
      previousPixiStage,
      previousUiState,
      profile: runtimeProfile,
      runtimeCommands,
      session: nextSession,
      ...(routeTable ? { routeTable } : {})
    });
    const transaction = projection.transaction;
    if (projection.transient.gameplayEvents.length > 0) onGameplayEvents?.(projection.transient.gameplayEvents);
    const sessionForCommit = projection.session;
    const nextStoryState = sessionForCommit.story;
    const currentStoryText = selectCurrentStoryLine(nextStoryState);
    const storyTextSurface = currentStoryText?.channel === "cue" ? "cue" : "dialog";
    const dialogueAudio = commitStoryTextRevealForStoryStep({
      active,
      textVisible: transaction.uiState.surfaces[storyTextSurface].targetVisible,
      pacing,
      runtimeCommands,
      storyPlayState: sessionForCommit.play,
      storyState: nextStoryState
    });
    let sawMovieEffect = false;
    let pendingMoviePlayback: { sourceRef: string; uri: string } | undefined;
    const movieDiagnostics: VnRuntimeDiagnostic[] = [];
    const nextUiStateFromCommands = transaction.mediaEffects.reduce((current, effect) => {
      if (effect.type !== "play-movie") return current;
      sawMovieEffect = true;
      const resolved = resolveVnRuntimeMediaSource({
        kind: "video",
        sourceRef: effect.sourceRef,
        ...(assetResolver ? { assetResolver } : {})
      });
      if (resolved.diagnostic) movieDiagnostics.push(resolved.diagnostic);
      if (resolved.uri) pendingMoviePlayback = { sourceRef: effect.sourceRef, uri: resolved.uri };
      return startMovieOverlay(current, {
        sourceRef: effect.sourceRef,
        ...(resolved.uri ? { uri: resolved.uri } : {}),
        blocking: effect.block
      });
    }, projection.runtime.uiState);
    if (sawMovieEffect) pendingMoviePlaybackRef.current = pendingMoviePlayback;
    appendRuntimeDiagnostics(
      collectVnRuntimeDiagnostics({
        storyDiagnostics,
        transactionDiagnostics: transaction.diagnostics,
        mediaDiagnostics: transaction.mediaDiagnostics,
        uiDiagnostics: transaction.uiDiagnostics
      }).concat(movieDiagnostics, dialogueAudio.diagnostics)
    );
    setMediaRuntimeNow({ state: projection.stable.mediaState });
    setUiRuntimeNow({ state: deriveUiRuntimeLifecycleState(nextUiStateFromCommands, nextStoryState) });
    const audioMediaEffects = transaction.mediaEffects.filter((effect) => effect.type !== "play-movie");
    const voiceBoundaryToken = dialogueAudio.hasVoiceBoundary ? beginVoiceBoundary() : undefined;
    const audioEffects = [...audioMediaEffects, ...dialogueAudio.effects];
    if (audioEffects.length > 0) {
      void applyVnRuntimeMediaEffects({
        audioPort,
        effects: audioEffects,
        handles: mediaHandlesRef.current,
        resolver: ({ kind, sourceRef }) =>
          resolveVnRuntimeMediaSource({
            kind,
            sourceRef,
            ...(assetResolver ? { assetResolver } : {})
          })
      }).then((result) => {
        appendRuntimeDiagnostics(result.diagnostics);
        if (result.voiceHandle && voiceBoundaryToken === voiceEffectTokenRef.current) {
          getVoiceAutoAdvanceGateController().install(result.voiceHandle);
        }
      });
    }
    if (forcePixiCommit || projection.stable.pixiStage !== previousPixiStage || projection.transient.pixiHints.length > 0) {
      setPixiStageRuntimeNow((current) => ({
        snapshot: projection.stable.pixiStage,
        hints: projection.transient.pixiHints,
        hintSequence: current.hintSequence + 1,
        animate: animatePixi,
        presentationTasks: animatePixi ? current.presentationTasks : []
      }));
    }
    setSessionNow(sessionForCommit);
    void source;
  }

  function commitStoryTextRevealForStoryStep({
    active,
    textVisible,
    pacing,
    runtimeCommands,
    storyPlayState,
    storyState
  }: {
    active: boolean;
    textVisible: boolean;
    pacing: StoryPlayPacing;
    runtimeCommands: RuntimeCommand[];
    storyPlayState: StoryPlayState;
    storyState: StoryRuntimeSnapshot;
  }): CommitStoryTextRevealResult {
    const storyTextCommand = latestStoryTextCommand(runtimeCommands);
    if (!active || !storyTextCommand) {
      const reveal = storyTextRevealRuntimeRef.current.state;
      const currentLine = selectCurrentStoryLine(storyState);
      if (runtimeCommands.length > 0 || (reveal && currentLine?.text !== reveal.text)) clearStoryTextRevealRuntime();
      return { diagnostics: [], effects: [], hasVoiceBoundary: false };
    }

    const currentLine = selectCurrentStoryLine(storyState);
    const text = currentLine?.text ?? stringRuntimeParam(storyTextCommand, "text") ?? "";
    const nowMs = readVnRuntimeNowMs();
    const schedule = selectStoryPlaySchedule(storyPlayState, storyState, {
      active,
      hostReadyForAuto: true,
      ...(storyPlayTiming ? { timing: storyPlayTiming } : {})
    });
    const totalDelayMs =
      schedule.type === "wait" && (schedule.source === "auto" || schedule.source === "auto-next")
        ? schedule.delayMs
        : undefined;
    const scriptSpeed = numberRuntimeParam(storyTextCommand, "speed");
    const plan = createStoryTextPacingPlan({
      unitCount: countStoryTextRevealUnits(text),
      textSpeed: storyTextRevealSettings.textSpeed,
      ...(scriptSpeed !== undefined ? { scriptSpeed } : {}),
      ...(totalDelayMs !== undefined ? { totalDelayMs } : {})
    });
    const created = createStoryTextRevealState({
      lineKey: createStoryTextRevealLineKey(storyState, storyTextCommand),
      text,
      startedAtMs: nowMs,
      durationMs: pacing === "skip" || !textVisible ? 0 : plan.revealDurationMs
    });
    const step = advanceStoryTextReveal(created, nowMs);
    const speakerId = currentLine?.speaker ?? stringRuntimeParam(storyTextCommand, "speaker");
    setStoryTextRevealRuntimeNow((current) => ({
      state: step.state,
      events: [...current.events, ...step.events].slice(-MAX_STORY_TEXT_REVEAL_EVENTS),
      eventSequence: current.eventSequence + step.events.length,
      visibleText: selectVisibleRevealText(step.state) ?? step.state.text,
      visibleRichText: selectVisibleRevealRichText(currentLine?.richText, step.state)
    }));
    const textId = stringRuntimeParam(storyTextCommand, "textId");
    const voiceAvailability = resolveVnDialogueVoiceAssetAvailability({
      ...(textId ? { textId } : {}),
      voiceSettings,
      ...(assetResolver ? { assetResolver } : {})
    });
    const dialogueAudio = planDialogueLineAudio(dialogueAudioRuntimeRef.current, {
      bleep: {
        volume: dialogueBleepSettings.volume,
        ...(dialogueBleepConfig ? { config: dialogueBleepConfig } : {})
      },
      textVisible,
      lineKey: step.state.lineKey,
      pacing,
      revealStatus: step.state.status,
      ...(speakerId ? { speakerId } : {}),
      ...(textId ? { textId } : {}),
      voice: voiceSettings,
      voiceAssetAvailable: voiceAvailability.available
    });
    dialogueAudioRuntimeRef.current = dialogueAudio.state;
    return {
      diagnostics: voiceAvailability.diagnostics,
      effects: dialogueAudio.effects,
      hasVoiceBoundary: dialogueAudio.hasVoiceBoundary
    };
  }

  function updatePixiPresentationTasks(tasks: PresentationTaskObservation[]) {
    setPixiStageRuntimeNow((current) => ({
      ...current,
      presentationTasks: tasks
    }));
    observePixiPresentationTasks(tasks);
  }

  function observePixiPresentationTasks(tasks: PresentationTaskObservation[]) {
    const currentSession = sessionRef.current;
    const wait = currentSession.story.presentationWait;
    if (!currentSession.active || !wait) return;
    if (wait.channel !== "pixi") return;
    const expectedTasks = wait.expectedTasks ?? [];
    if (expectedTasks.length === 0) return;
    const waitKey = vnPresentationWaitKey(wait);
    if (observedWaitTasksRef.current?.waitKey !== waitKey) {
      observedWaitTasksRef.current = { waitKey, observed: new Set() };
    }
    const observed = observedWaitTasksRef.current.observed;
    const activeTaskKeys = new Set(tasks.map(vnPixiPresentationTaskKey));
    const expectedTaskKeys = expectedTasks.map(vnPresentationWaitTaskKey);
    for (const key of expectedTaskKeys) {
      if (activeTaskKeys.has(key)) observed.add(key);
    }
    if (expectedTaskKeys.every((key) => observed.has(key)) && expectedTaskKeys.every((key) => !activeTaskKeys.has(key))) {
      completePresentationWaitAndAdvance("system");
    }
  }

  function completePresentationWaitAndAdvance(
    source: StoryPlayAdvanceSource,
    options: { settlePixi?: boolean; settleUi?: boolean } = {}
  ) {
    const current = sessionRef.current;
    const wait = current.story.presentationWait;
    if (!current.active || !wait) return;
    const advanceSource = resolveVnPresentationWaitAdvanceSource(source, current.play);
    const waitKey = vnPresentationWaitKey(wait);
    if (completingWaitKeyRef.current === waitKey) return;
    completingWaitKeyRef.current = waitKey;
    const previousUiState = options.settleUi && isUiPresentationWait(wait)
      ? settleUiRuntimePresentationWait(uiRuntimeRef.current.state, wait)
      : uiRuntimeRef.current.state;

    const completed = completeVnSessionPresentationWait(current);
    appendRuntimeDiagnostics(collectVnRuntimeDiagnostics({ storyDiagnostics: completed.storyStep.diagnostics }));
    if (completed.storyStep.diagnostics.length > 0) return;
    const step = advanceVnSession(completed.session, advanceSource);
    void coordinateVnSessionStep({
      beforeCommit: () => {
        observedWaitTasksRef.current = undefined;
        if (options.settlePixi && wait.channel === "pixi") {
          setPixiStageRuntimeNow((currentPixi) => ({
            ...currentPixi,
            hints: [],
            hintSequence: currentPixi.hintSequence + 1,
            animate: false,
            presentationTasks: []
          }));
        }
        if (advanceSource === "manual" || advanceSource === "skip") {
          clearVoiceAutoAdvanceGate({ stopVoice: true });
        }
      },
      pacing: step.playStep.intent.pacing,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      previousUiState,
      source: advanceSource,
      step
    }).then((result) => {
      if (!result.ok) {
        completingWaitKeyRef.current = undefined;
        return;
      }
      if (result.session.story.ended) return;
      onRuntimeStatus?.({
        action: advanceSource === "manual" ? "story:advance" : `story:${advanceSource}`,
        outcome: result.session.story.presentationWait
          ? "presentation-wait"
          : result.session.story.pendingChoices.length > 0
            ? "choices"
            : "line"
      });
    });
  }

  function completeRuntimeWaitAndAdvance(source: StoryPlayAdvanceSource, kind: "pause" | "movie") {
    const current = sessionRef.current;
    const wait = current.story.runtimeWait;
    if (!current.active || !wait || wait.kind !== kind) return;
    if (kind === "pause" && wait.kind === "pause" && !canCompleteVnPauseRuntimeWaitFromSource(wait, source)) return;
    const previousUiState = kind === "movie"
      ? clearMovieOverlay(uiRuntimeRef.current.state)
      : uiRuntimeRef.current.state;
    const completed = completeVnSessionRuntimeWait(current, kind);
    appendRuntimeDiagnostics(collectVnRuntimeDiagnostics({ storyDiagnostics: completed.storyStep.diagnostics }));
    if (completed.storyStep.diagnostics.length > 0) return;
    const step = advanceVnSession(completed.session, source);
    void coordinateVnSessionStep({
      beforeCommit: () => {
        if (kind === "movie") {
          pendingMoviePlaybackRef.current = undefined;
          videoPort.stop();
        }
        if (source === "manual" || source === "skip") clearVoiceAutoAdvanceGate({ stopVoice: true });
      },
      pacing: step.playStep.intent.pacing,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      previousUiState,
      source,
      step
    }).then((result) => {
      if (!result.ok || result.session.story.ended) return;
      onRuntimeStatus?.({
        action: source === "manual" ? "story:advance" : `story:${source}`,
        outcome: result.session.story.runtimeWait
          ? "runtime-wait"
          : result.session.story.pendingChoices.length > 0
            ? "choices"
            : "line"
      });
    });
  }

  function createVnSaveCheckpoint({ allowInactive = false }: { allowInactive?: boolean } = {}): VnSaveCheckpointResult {
    const current = sessionRef.current;
    const script = compiledCatalogRef.current.recordsByPath.get(current.story.currentScriptPath)?.source;
    if (!script) {
      return { ok: false, code: "inactive-entry", message: "The active VN script is not registered." };
    }
    return collectVnSaveCheckpoint({
      active: current.active,
      allowInactive,
      entryId: entry.id,
      script: { scriptPath: script.scriptPath, scriptRevision: script.scriptRevision },
      transitionActive: navigationActiveRef.current,
      story: current.story,
      pixiStage: pixiStageRuntimeRef.current.snapshot,
      media: createVnMediaCheckpoint(mediaRuntimeRef.current.state),
      ui: createVnUiCheckpoint(uiRuntimeRef.current.state)
    });
  }

  const interactionFacts = useMemo<VnInteractionFacts>(
    () => ({
      inputLock: navigationActive ? "cutscene" : session.active ? "dialog" : "none",
      hasActiveStory: session.active,
      storyHasChoices: session.story.pendingChoices.length > 0,
      storyEnded: session.story.ended,
      isAtStableStop: session.active && !navigationActive && !session.story.presentationWait && !session.story.runtimeWait
    }),
    [
      session.active,
      session.story.ended,
      session.story.pendingChoices.length,
      session.story.presentationWait,
      session.story.runtimeWait,
      navigationActive
    ]
  );
  return {
    shell: {
      advanceStory,
      attachMovieElement,
      chooseStory,
      completeMoviePlayback,
      storyTextRevealRuntime,
      dismissRuntimeToast,
      interactionFacts,
      storyPlayActiveActions,
      storyRuntime,
      stopStoryAutomation,
      submitStoryInput,
      toggleStoryAuto,
      toggleStorySkip,
      uiRuntime
    },
    presentation: {
      pixiStageRuntime,
      storySession,
      updatePixiPresentationTasks
    },
    lifecycle: {
      createVnSaveCheckpoint,
      resetRuntime,
      restoreVnState,
      startStory
    },
    diagnostics: {
      observeAssetDiagnostic,
      runtimeDiagnostics
    }
  };
}

function latestStoryTextCommand(commands: RuntimeCommand[]): RuntimeCommand | undefined {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index];
    if (isStoryTextCommand(command)) return command;
  }
  return undefined;
}

function createStoryTextRevealLineKey(storyState: StoryRuntimeSnapshot, command: RuntimeCommand): string {
  const loc = command.loc;
  const source = loc ? `${loc.scriptPath}:${loc.line}:${loc.column}` : `${storyState.currentScriptPath}:${storyState.instructionPointer}`;
  return `${source}:${storyState.backlog.length}`;
}

function stringRuntimeParam(command: RuntimeCommand, key: string): string | undefined {
  const value = scalarValue(command.params[key]);
  return value === undefined ? undefined : String(value);
}

function numberRuntimeParam(command: RuntimeCommand, key: string): number | undefined {
  const value = scalarValue(command.params[key]);
  return typeof value === "number" ? value : undefined;
}

function scalarValue(value: RuntimeValue | undefined): string | number | boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.map(scalarValue);
    return items.some((item) => item === undefined) ? undefined : items.map(String).join(",");
  }
  return undefined;
}
