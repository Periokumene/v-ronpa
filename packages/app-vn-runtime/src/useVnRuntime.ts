import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetResolver } from "@v-ronpa/asset-registry";
import {
  advanceDialogReveal,
  advanceUiRuntimeTransitions,
  clearMovieOverlay,
  completeDialogReveal,
  countDialogRevealUnits,
  createDialogLinePacingPlan,
  createDialogPlaybackSchedulePlan,
  createDialogRevealState,
  createInitialMediaRuntimeState,
  createInitialUiRuntimeState,
  createVnMediaCheckpoint,
  createVnUiCheckpoint,
  createVnRuntimePresentationTransaction,
  deriveUiRuntimeLifecycleState,
  dismissToast,
  hasActiveUiRuntimeTransitions,
  isUiPresentationWait,
  isUiPresentationWaitComplete,
  planDialogueLineAudio,
  reduceDialogueAudioLifecycle,
  selectDialogPlaybackAdvanceGate,
  selectDialogPlaybackAdvanceRequest,
  selectVisibleRevealRichText,
  selectVisibleRevealText,
  shouldDriveDialogReveal,
  startMovieOverlay,
  settleUiRuntimePresentationWait,
  settleUiRuntimeTransitions,
  type DialogPlaybackScheduleSource,
  type DialogRevealEvent,
  type DialogRevealState,
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
import { selectCurrentStoryLine, type StoryStepperDiagnostic, type StoryStepperResult } from "@v-ronpa/story-engine";
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
import { collectVnSaveCheckpoint, validateVnRestoreIdentity } from "./checkpoint";
import type {
  VnDialogRevealRuntime,
  VnInteractionFacts,
  VnMediaRuntime,
  PresentationTaskObservation,
  VnPixiStageRuntime,
  VnRuntimeDialogueBleepSettings,
  VnRuntimeDialogRevealSettings,
  VnRuntimeEntry,
  VnRestoreResult,
  RestoreVnRuntimeStateInput,
  VnSaveCheckpointResult,
  StartVnStoryOptions,
  UseVnRuntimeResult,
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
const DEFAULT_DIALOG_REVEAL_SETTINGS: VnRuntimeDialogRevealSettings = {
  textSpeed: createDefaultSettingsSnapshot().display.textSpeed
};
const MAX_DIALOG_REVEAL_EVENTS = 50;

export interface UseVnRuntimeOptions {
  gameId: string;
  entry: VnRuntimeEntry;
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
  dialogRevealSettings?: VnRuntimeDialogRevealSettings;
  onGameplayEvents?: (events: GameplayEvent[]) => void;
  onRuntimeStatus?: (status: { action: string; outcome: string }) => void;
  onStoryEnd?: (action: "story:end") => void;
}

interface CommitVnSessionStepInput {
  active: boolean;
  forcePixiCommit?: boolean;
  pacing?: StoryPlayPacing;
  previousPixiStage: PixiStageSnapshot;
  session: VnSessionState;
  source: StoryPlayAdvanceSource;
  storyDiagnostics?: StoryStepperDiagnostic[];
  runtimeCommands: RuntimeCommand[];
}

interface CommitDialogRevealResult {
  diagnostics: VnRuntimeDiagnostic[];
  effects: MediaRuntimeEffect[];
  hasVoiceBoundary: boolean;
}

export function useVnRuntime({
  assetResolver,
  audioPort: configuredAudioPort,
  dialogRevealSettings = DEFAULT_DIALOG_REVEAL_SETTINGS,
  dialogueBleepConfig,
  dialogueBleepSettings = DEFAULT_DIALOGUE_BLEEP_SETTINGS,
  entry,
  gameId,
  onGameplayEvents,
  onRuntimeStatus,
  onStoryEnd,
  profile,
  routeTable,
  storyPlayTiming,
  videoPort: configuredVideoPort,
  voiceSettings = DEFAULT_VOICE_SETTINGS
}: UseVnRuntimeOptions): UseVnRuntimeResult {
  const bootStep = useMemo(
    () =>
      createVnSession({
        scriptPath: entry.scriptPath,
        sourceText: entry.sourceText,
        ...(entry.startLabel ? { startLabel: entry.startLabel } : {})
      }),
    [entry.scriptPath, entry.sourceText, entry.startLabel]
  );
  const bootSession = bootStep.session;
  const startLabelDiagnostics = useMemo(
    () => createVnRuntimeStartLabelDiagnostics(bootSession.script, entry.startLabel),
    [bootSession.script, entry.startLabel]
  );
  const hasInvalidStartLabel = startLabelDiagnostics.some((diagnostic) => diagnostic.severity === "error");
  const runtimeProfile = profile ?? entry.profile ?? "vn2d";
  const audioPort = useMemo(() => configuredAudioPort ?? createHowlerAudioPort(), [configuredAudioPort]);
  const videoPort = useMemo(() => configuredVideoPort ?? createHtmlVideoPort(), [configuredVideoPort]);
  const initialRuntimeDiagnostics = useMemo(
    () =>
      limitVnRuntimeDiagnostics([
        ...createInitialVnRuntimeDiagnostics(bootSession.diagnostics.parser, bootSession.diagnostics.compiler),
        ...startLabelDiagnostics
      ]),
    [bootSession.diagnostics.compiler, bootSession.diagnostics.parser, startLabelDiagnostics]
  );
  const [session, setSession] = useState<VnSessionState>(() => ({ ...bootSession, active: false }));
  const [pixiStageRuntime, setPixiStageRuntime] = useState<VnPixiStageRuntime>(() => createInitialVnPixiStageRuntime());
  const [mediaRuntime, setMediaRuntime] = useState<VnMediaRuntime>(() => ({ state: createInitialMediaRuntimeState() }));
  const [uiRuntime, setUiRuntime] = useState<VnUiRuntime>(() => ({ state: createInitialUiRuntimeState() }));
  const [dialogRevealRuntime, setDialogRevealRuntime] = useState<VnDialogRevealRuntime>(() => ({
    events: [],
    eventSequence: 0
  }));
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<VnRuntimeDiagnostic[]>(() => initialRuntimeDiagnostics);
  const [lastRuntimeCommandCount, setLastRuntimeCommandCount] = useState(0);
  const [storySession, setStorySession] = useState(0);

  const sessionRef = useRef(session);
  const pixiStageRuntimeRef = useRef(pixiStageRuntime);
  const mediaRuntimeRef = useRef(mediaRuntime);
  const uiRuntimeRef = useRef(uiRuntime);
  const dialogRevealRuntimeRef = useRef(dialogRevealRuntime);
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

  const storyRuntime: VnStoryRuntime = useMemo(
    () => ({ active: session.active, state: session.story }),
    [session.active, session.story]
  );
  const storyPlay = session.play;
  const storyPlaySchedule = useMemo(
    () =>
      selectStoryPlaySchedule(session.play, session.story, {
        active: session.active,
        hostReadyForAuto: true,
        ...(storyPlayTiming ? { timing: storyPlayTiming } : {})
      }),
    [session.active, session.play, session.story, storyPlayTiming]
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
    dialogRevealRuntimeRef.current = dialogRevealRuntime;
  }, [dialogRevealRuntime]);

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
    const plan = createDialogPlaybackSchedulePlan({
      schedule: storyPlaySchedule,
      reveal: dialogRevealRuntimeRef.current.state,
      nowMs: readVnRuntimeNowMs()
    });
    if (plan.type === "idle") return;
    storyPlayHostRef.current = { active: session.active, schedule: storyPlaySchedule };
    const scheduled = storyPlaySchedule;
    const source = plan.source;
    const timeout = window.setTimeout(() => {
      const currentHost = storyPlayHostRef.current;
      if (!currentHost.active || currentHost.schedule !== scheduled) return;
      requestDialogPlaybackScheduleAdvance(source);
    }, plan.delayMs);
    return () => window.clearTimeout(timeout);
  }, [dialogRevealRuntime.state?.lineKey, dialogRevealRuntime.state?.status, session.active, storyPlaySchedule]);

  const shouldDriveVisualRuntime =
    shouldDriveDialogReveal({ active: session.active, reveal: dialogRevealRuntime.state }) ||
    hasActiveUiRuntimeTransitions(uiRuntime.state);

  useEffect(() => {
    if (!shouldDriveVisualRuntime) return;
    let frame = 0;
    const tick = () => {
      const nowMs = readVnRuntimeNowMs();
      advanceActiveDialogReveal(nowMs);
      advanceActiveUiRuntimeTransitions(nowMs);
      if (
        shouldDriveDialogReveal({ active: sessionRef.current.active, reveal: dialogRevealRuntimeRef.current.state }) ||
        hasActiveUiRuntimeTransitions(uiRuntimeRef.current.state)
      ) {
        frame = window.requestAnimationFrame(tick);
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [shouldDriveVisualRuntime]);

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

  function setDialogRevealRuntimeNow(next: VnDialogRevealRuntime | ((current: VnDialogRevealRuntime) => VnDialogRevealRuntime)) {
    const resolved = typeof next === "function" ? next(dialogRevealRuntimeRef.current) : next;
    dialogRevealRuntimeRef.current = resolved;
    setDialogRevealRuntime(resolved);
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

  function requestDialogPlaybackScheduleAdvance(source: DialogPlaybackScheduleSource): boolean {
    const revealGate = selectDialogPlaybackAdvanceGate({ source, reveal: dialogRevealRuntimeRef.current.state });
    const voiceReady = revealGate.ready ? getVoiceAutoAdvanceGateController().request(source) : false;
    const request = selectDialogPlaybackAdvanceRequest({ revealGate, voiceReady });
    if (request.type === "blocked") return false;
    advanceStory(request.source);
    return true;
  }

  function appendDialogRevealEvents(state: DialogRevealState, events: DialogRevealEvent[]) {
    const richText = selectCurrentStoryLine(sessionRef.current.story)?.richText;
    setDialogRevealRuntimeNow((current) => ({
      state,
      events: events.length > 0 ? [...current.events, ...events].slice(-MAX_DIALOG_REVEAL_EVENTS) : current.events,
      eventSequence: current.eventSequence + events.length,
      visibleText: selectVisibleRevealText(state) ?? state.text,
      visibleRichText: selectVisibleRevealRichText(richText, state)
    }));
    if (events.some((event) => event.type === "reveal-finish")) {
      applyDialogueAudioLifecycleSignal({ type: "line-finish", lineKey: state.lineKey });
    }
  }

  function advanceActiveDialogReveal(nowMs = readVnRuntimeNowMs()) {
    const reveal = dialogRevealRuntimeRef.current.state;
    if (!reveal || reveal.status === "complete") return;
    const step = advanceDialogReveal(reveal, nowMs);
    if (
      step.events.length === 0 &&
      step.state.status === reveal.status &&
      step.state.visibleUnitCount === reveal.visibleUnitCount
    ) {
      return;
    }
    appendDialogRevealEvents(step.state, step.events);
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

  function completeActiveDialogReveal(): boolean {
    const reveal = dialogRevealRuntimeRef.current.state;
    if (!reveal || reveal.status === "complete") return false;
    const step = completeDialogReveal(reveal, readVnRuntimeNowMs());
    appendDialogRevealEvents(step.state, step.events);
    return true;
  }

  function clearDialogRevealRuntime(reason = "dialog-reveal:clear") {
    applyDialogueAudioLifecycleSignal({ type: "clear", reason });
    setDialogRevealRuntimeNow({ events: [], eventSequence: 0 });
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
    cancelStoryPlayHostSchedule();
    clearDialogRevealRuntime();
    observedWaitTasksRef.current = undefined;
    completingWaitKeyRef.current = undefined;
    const nextBoot = createVnSession({
      scriptPath: entry.scriptPath,
      sourceText: entry.sourceText,
      ...(entry.startLabel ? { startLabel: entry.startLabel } : {})
    }).session;
    setSessionNow({ ...nextBoot, active: false });
    disposeRuntimeMedia();
    setMediaRuntimeNow({ state: createInitialMediaRuntimeState() });
    setUiRuntimeNow({ state: createInitialUiRuntimeState() });
    setRuntimeDiagnostics(initialRuntimeDiagnostics);
    setPixiStageRuntimeNow((current) => ({
      ...createInitialVnPixiStageRuntime(),
      hintSequence: current.hintSequence + 1
    }));
    setLastRuntimeCommandCount(0);
    setStorySession((current) => current + 1);
  }

  function startStory(_options: StartVnStoryOptions = {}) {
    if (hasInvalidStartLabel) {
      resetRuntime();
      onRuntimeStatus?.({ action: "story:start", outcome: "invalid-start-label" });
      return;
    }
    resetRuntime();
    const nextBoot = createVnSession({
      scriptPath: entry.scriptPath,
      sourceText: entry.sourceText,
      ...(entry.startLabel ? { startLabel: entry.startLabel } : {})
    }).session;
    const resetPixi = createInitialVnPixiStageRuntime().snapshot;
    const firstStep = advanceVnSession(nextBoot, "start");
    setStorySession((current) => current + 1);
    commitVnSessionStep({
      active: !firstStep.session.story.ended,
      forcePixiCommit: true,
      pacing: firstStep.playStep.intent.pacing,
      previousPixiStage: resetPixi,
      runtimeCommands: firstStep.emittedRuntimeCommands,
      session: firstStep.session,
      source: firstStep.playStep.intent.source,
      storyDiagnostics: firstStep.playStep.story.diagnostics
    });
    onRuntimeStatus?.({
      action: "story:start",
      outcome: firstStep.session.story.presentationWait
        ? "presentation-wait"
        : firstStep.session.story.pendingChoices.length > 0
          ? "choices"
          : "line"
    });
  }

  function advanceStory(source: StoryPlayAdvanceSource = "manual") {
    const current = sessionRef.current;
    if (!current.active) return;

    if (dialogRevealRuntimeRef.current.state?.status === "revealing") {
      if (source === "manual") {
        cancelStoryPlayHostSchedule();
        setSessionNow((latest) => stopVnSessionAutomation(latest, "manual-takeover"));
        completeActiveDialogReveal();
        onRuntimeStatus?.({ action: "dialog:reveal-complete", outcome: "line-complete" });
      } else if (source === "skip") {
        cancelStoryPlayHostSchedule();
        clearVoiceAutoAdvanceGate({ stopVoice: true });
        completeActiveDialogReveal();
        onRuntimeStatus?.({ action: "story:skip", outcome: "line-complete" });
      }
      return;
    }

    if (source === "manual" || source === "skip") {
      cancelStoryPlayHostSchedule();
      if (canAdvanceVnStoryFromSource({ active: current.active, state: current.story }, source)) {
        clearVoiceAutoAdvanceGate({ stopVoice: true });
      }
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
    commitVnSessionStep({
      active: !step.session.story.ended,
      pacing: step.playStep.intent.pacing,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      runtimeCommands: step.emittedRuntimeCommands,
      session: step.session,
      source,
      storyDiagnostics: step.playStep.story.diagnostics
    });
    if (step.session.story.ended) {
      onStoryEnd?.("story:end");
    } else {
      onRuntimeStatus?.({
        action: source === "manual" ? "story:advance" : `story:${source}`,
        outcome: step.session.story.presentationWait
          ? "presentation-wait"
          : step.session.story.pendingChoices.length > 0
            ? "choices"
            : "line"
      });
    }
  }
  advanceStoryRef.current = advanceStory;

  function chooseStory(index: number) {
    cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate({ stopVoice: true });
    const current = sessionRef.current;
    if (!current.active) return;
    const step = chooseVnSessionOption(current, index);
    commitVnSessionStep({
      active: !step.session.story.ended,
      pacing: step.playStep.intent.pacing,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      runtimeCommands: step.emittedRuntimeCommands,
      session: step.session,
      source: "choice",
      storyDiagnostics: step.playStep.story.diagnostics
    });
    if (step.session.story.ended) {
      onStoryEnd?.("story:end");
    } else {
      onRuntimeStatus?.({
        action: `choice:${index}`,
        outcome: step.session.story.presentationWait
          ? "presentation-wait"
          : step.session.story.variables.route
            ? `route:${String(step.session.story.variables.route)}`
            : "choice"
      });
    }
  }

  function submitStoryInput(value: string | number | boolean) {
    cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate({ stopVoice: true });
    const current = sessionRef.current;
    if (!current.active || current.story.runtimeWait?.kind !== "input") return;
    const step = submitVnSessionInput(current, value);
    commitVnSessionStep({
      active: !step.session.story.ended,
      pacing: step.playStep.intent.pacing,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      runtimeCommands: step.emittedRuntimeCommands,
      session: step.session,
      source: "manual",
      storyDiagnostics: step.playStep.story.diagnostics
    });
    if (step.session.story.ended) onStoryEnd?.("story:end");
    else onRuntimeStatus?.({ action: "input:submit", outcome: "input-submitted" });
  }

  function toggleStoryAuto() {
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
    if (!canToggleVnStoryAutomation({ active: sessionRef.current.active, state: sessionRef.current.story })) return;
    const wasSkip = sessionRef.current.play.mode === "skip";
    if (wasSkip) cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate({ stopVoice: true });
    if (!wasSkip && dialogRevealRuntimeRef.current.state?.status === "revealing") {
      completeActiveDialogReveal();
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

  function restoreVnState({ gameId: savedGameId, state }: RestoreVnRuntimeStateInput): VnRestoreResult {
    const rejection = validateVnRestoreIdentity({
      expectedEntryId: entry.id,
      expectedGameId: gameId,
      expectedScriptRevision: entry.scriptRevision,
      savedEntryId: state.entryId,
      savedGameId,
      savedScriptRevision: state.scriptRevision
    });
    if (rejection) {
      appendRuntimeDiagnostics([
        { source: "story", severity: "error", code: rejection.code, message: rejection.message }
      ]);
      return rejection;
    }
    cancelStoryPlayHostSchedule();
    clearDialogRevealRuntime();
    observedWaitTasksRef.current = undefined;
    completingWaitKeyRef.current = undefined;
    const plan = createVnRuntimeRestorePlan({
      active: !state.story.ended,
      media: state.media,
      pixiStage: state.pixiStage,
      script: bootSession.script,
      story: state.story,
      ui: state.ui
    });
    disposeRuntimeMedia();
    setSessionNow(
      restoreVnSession({
        active: plan.storyRuntime.active,
        script: bootSession.script,
        snapshot: { story: plan.storyRuntime.state, play: plan.storyPlay }
      })
    );
    setMediaRuntimeNow({ state: plan.mediaRuntime });
    setUiRuntimeNow({ state: plan.uiRuntime });
    setRuntimeDiagnostics((current) => limitVnRuntimeDiagnostics([...current, ...plan.diagnostics]));
    setPixiStageRuntimeNow((current) => ({
      ...plan.pixiStageRuntime,
      hintSequence: current.hintSequence + 1
    }));
    setStorySession((current) => current + 1);
    setLastRuntimeCommandCount(0);
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
    previousPixiStage,
    runtimeCommands,
    session: nextSession,
    source,
    storyDiagnostics = []
  }: CommitVnSessionStepInput) {
    const nowMs = readVnRuntimeNowMs();
    const transaction = createVnRuntimePresentationTransaction({
      nowMs,
      runtimeCommands,
      previousMediaState: mediaRuntimeRef.current.state,
      previousPixiStage,
      previousUiState: uiRuntimeRef.current.state,
      profile: runtimeProfile,
      ...(routeTable ? { routeTable } : {})
    });
    setLastRuntimeCommandCount(runtimeCommands.length);
    if (transaction.gameplayEvents.length > 0) onGameplayEvents?.(transaction.gameplayEvents);
    const animatePixi = shouldAnimateVnStoryPlayPacing(pacing);
    const nextStoryState = nextSession.story.presentationWait?.channel === "pixi"
      ? {
          ...nextSession.story,
          presentationWait: {
            ...nextSession.story.presentationWait,
            stageRevision: transaction.pixiStage.revision,
            expectedTasks: animatePixi ? transaction.pixiWaitTasks : []
          }
        }
      : nextSession.story;
    const sessionForCommit = {
      ...nextSession,
      active,
      story: nextStoryState
    };
    const dialogueAudio = commitDialogRevealForStoryStep({
      active,
      dialogVisible: transaction.uiState.surfaces.dialog.targetVisible,
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
    }, transaction.uiState);
    if (sawMovieEffect) pendingMoviePlaybackRef.current = pendingMoviePlayback;
    appendRuntimeDiagnostics(
      collectVnRuntimeDiagnostics({
        storyDiagnostics,
        transactionDiagnostics: transaction.diagnostics,
        mediaDiagnostics: transaction.mediaDiagnostics,
        uiDiagnostics: transaction.uiDiagnostics
      }).concat(movieDiagnostics, dialogueAudio.diagnostics)
    );
    setMediaRuntimeNow({ state: transaction.mediaState });
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
    if (forcePixiCommit || transaction.pixiStage !== previousPixiStage || transaction.pixiHints.length > 0) {
      setPixiStageRuntimeNow((current) => ({
        snapshot: transaction.pixiStage,
        hints: transaction.pixiHints,
        hintSequence: current.hintSequence + 1,
        animate: animatePixi,
        presentationTasks: animatePixi ? current.presentationTasks : []
      }));
    }
    setSessionNow(sessionForCommit);
    void source;
  }

  function commitDialogRevealForStoryStep({
    active,
    dialogVisible,
    pacing,
    runtimeCommands,
    storyPlayState,
    storyState
  }: {
    active: boolean;
    dialogVisible: boolean;
    pacing: StoryPlayPacing;
    runtimeCommands: RuntimeCommand[];
    storyPlayState: StoryPlayState;
    storyState: StoryRuntimeSnapshot;
  }): CommitDialogRevealResult {
    const print = latestPrintCommand(runtimeCommands);
    if (!active || !print) {
      const reveal = dialogRevealRuntimeRef.current.state;
      const currentLine = selectCurrentStoryLine(storyState);
      if (runtimeCommands.length > 0 || (reveal && currentLine?.text !== reveal.text)) clearDialogRevealRuntime();
      return { diagnostics: [], effects: [], hasVoiceBoundary: false };
    }

    const currentLine = selectCurrentStoryLine(storyState);
    const text = currentLine?.text ?? stringRuntimeParam(print, "text") ?? "";
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
    const scriptSpeed = numberRuntimeParam(print, "speed");
    const plan = createDialogLinePacingPlan({
      unitCount: countDialogRevealUnits(text),
      textSpeed: dialogRevealSettings.textSpeed,
      ...(scriptSpeed !== undefined ? { scriptSpeed } : {}),
      ...(totalDelayMs !== undefined ? { totalDelayMs } : {})
    });
    const created = createDialogRevealState({
      lineKey: createDialogRevealLineKey(storyState, print),
      text,
      startedAtMs: nowMs,
      durationMs: pacing === "skip" || !dialogVisible ? 0 : plan.revealDurationMs
    });
    const step = advanceDialogReveal(created, nowMs);
    const speakerId = currentLine?.speaker ?? stringRuntimeParam(print, "speaker");
    setDialogRevealRuntimeNow((current) => ({
      state: step.state,
      events: [...current.events, ...step.events].slice(-MAX_DIALOG_REVEAL_EVENTS),
      eventSequence: current.eventSequence + step.events.length,
      visibleText: selectVisibleRevealText(step.state) ?? step.state.text,
      visibleRichText: selectVisibleRevealRichText(currentLine?.richText, step.state)
    }));
    const textId = stringRuntimeParam(print, "textId");
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
      dialogVisible,
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
    if (options.settleUi && isUiPresentationWait(wait)) {
      setUiRuntimeNow((currentUi) => ({ state: settleUiRuntimePresentationWait(currentUi.state, wait) }));
    }

    const completed = completeVnSessionPresentationWait(current);
    appendRuntimeDiagnostics(collectVnRuntimeDiagnostics({ storyDiagnostics: completed.storyStep.diagnostics }));
    if (completed.storyStep.diagnostics.length > 0) return;
    const step = advanceVnSession(completed.session, advanceSource);
    commitVnSessionStep({
      active: !step.session.story.ended,
      pacing: step.playStep.intent.pacing,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      runtimeCommands: step.emittedRuntimeCommands,
      session: step.session,
      source: advanceSource,
      storyDiagnostics: step.playStep.story.diagnostics
    });
    if (step.session.story.ended) {
      onStoryEnd?.("story:end");
    } else {
      onRuntimeStatus?.({
        action: advanceSource === "manual" ? "story:advance" : `story:${advanceSource}`,
        outcome: step.session.story.presentationWait
          ? "presentation-wait"
          : step.session.story.pendingChoices.length > 0
            ? "choices"
            : "line"
      });
    }
  }

  function completeRuntimeWaitAndAdvance(source: StoryPlayAdvanceSource, kind: "pause" | "movie") {
    const current = sessionRef.current;
    const wait = current.story.runtimeWait;
    if (!current.active || !wait || wait.kind !== kind) return;
    if (kind === "pause" && wait.kind === "pause" && !canCompleteVnPauseRuntimeWaitFromSource(wait, source)) return;
    if (kind === "movie") {
      pendingMoviePlaybackRef.current = undefined;
      videoPort.stop();
      setUiRuntimeNow((currentUi) => ({ state: clearMovieOverlay(currentUi.state) }));
    }
    const completed = completeVnSessionRuntimeWait(current, kind);
    appendRuntimeDiagnostics(collectVnRuntimeDiagnostics({ storyDiagnostics: completed.storyStep.diagnostics }));
    if (completed.storyStep.diagnostics.length > 0) return;
    const step = advanceVnSession(completed.session, source);
    commitVnSessionStep({
      active: !step.session.story.ended,
      pacing: step.playStep.intent.pacing,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      runtimeCommands: step.emittedRuntimeCommands,
      session: step.session,
      source,
      storyDiagnostics: step.playStep.story.diagnostics
    });
    if (step.session.story.ended) {
      onStoryEnd?.("story:end");
    } else {
      onRuntimeStatus?.({
        action: source === "manual" ? "story:advance" : `story:${source}`,
        outcome: step.session.story.runtimeWait
          ? "runtime-wait"
          : step.session.story.pendingChoices.length > 0
            ? "choices"
            : "line"
      });
    }
  }

  function createVnSaveCheckpoint({ allowInactive = false }: { allowInactive?: boolean } = {}): VnSaveCheckpointResult {
    const current = sessionRef.current;
    return collectVnSaveCheckpoint({
      active: current.active,
      allowInactive,
      entry,
      story: current.story,
      pixiStage: pixiStageRuntimeRef.current.snapshot,
      media: createVnMediaCheckpoint(mediaRuntimeRef.current.state),
      ui: createVnUiCheckpoint(uiRuntimeRef.current.state)
    });
  }

  const interactionFacts = useMemo<VnInteractionFacts>(
    () => ({
      inputLock: session.active ? "dialog" : "none",
      hasActiveStory: session.active,
      storyHasChoices: session.story.pendingChoices.length > 0,
      storyEnded: session.story.ended,
      isAtStableStop: session.active && !session.story.presentationWait && !session.story.runtimeWait
    }),
    [
      session.active,
      session.story.ended,
      session.story.pendingChoices.length,
      session.story.presentationWait,
      session.story.runtimeWait
    ]
  );

  return {
    shell: {
      advanceStory,
      attachMovieElement,
      chooseStory,
      completeMoviePlayback,
      dialogRevealRuntime,
      dismissRuntimeToast,
      interactionFacts,
      storyPlayActiveActions,
      storyRuntime,
      submitStoryInput,
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
    },
    debug: {
      lastRuntimeCommandCount,
      mediaRuntime,
      stopStoryAutomation,
      storyPlay,
      storyPlaySchedule,
      storySessionState: session,
      toggleStoryAuto,
      toggleStorySkip
    }
  };
}

function latestPrintCommand(commands: RuntimeCommand[]): RuntimeCommand | undefined {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index];
    if (command?.commandId === "print") return command;
  }
  return undefined;
}

function createDialogRevealLineKey(storyState: StoryRuntimeSnapshot, command: RuntimeCommand): string {
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
