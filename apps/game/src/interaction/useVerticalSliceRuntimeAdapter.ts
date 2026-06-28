import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetRegistryDiagnostic, AssetResolver } from "@v-ronpa/asset-registry";
import {
  createDefaultSettingsSnapshot,
  type DialogueBleepConfig,
  type GameInteractionContext,
  type GameUiAction,
  type NaviInteractionSensorReport,
  type NaviRuntimeState,
  type PlayerPose,
  type PixiStageSnapshot,
  type RuntimeCommand,
  type SaveData,
  type GameplayEvent,
  type TrialDefinition,
  type TrialRuntimeState,
  type WorldMapDef
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
import {
  createInitialPixiStageSnapshot,
  type PixiPresentationTaskSnapshot,
  type PixiStageRenderHint
} from "@v-ronpa/pixi-presenter";
import type { FirstPersonInteractRequest } from "@v-ronpa/r3f-adapter";
import {
  createInitialStoryState,
  selectCurrentStoryLine,
  storyReducer,
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
import { createHowlerAudioPort, createHtmlVideoPort, type AudioHandle, type AudioPort, type VideoPort } from "@v-ronpa/media-save";
import {
  createInitialMediaRuntimeState,
  type MediaRuntimeDiagnostic,
  type MediaRuntimeEffect,
  type MediaRuntimeState
} from "../mediaRuntime";
import {
  clearMovieOverlay,
  createInitialUiRuntimeState,
  deriveUiRuntimeLifecycleState,
  dismissToast,
  startMovieOverlay,
  type UiRuntimeDiagnostic,
  type UiRuntimeState
} from "../uiRuntime";
import {
  advanceDialogReveal,
  completeDialogReveal,
  countDialogRevealUnits,
  createDialogLinePacingPlan,
  createDialogRevealState,
  selectVisibleRevealText,
  type DialogRevealEvent,
  type DialogRevealState
} from "./dialogRevealRuntime";
import {
  createDialogPlaybackSchedulePlan,
  selectDialogPlaybackAdvanceRequest,
  selectDialogPlaybackAdvanceGate,
  shouldDriveDialogReveal,
  type DialogPlaybackScheduleSource
} from "./dialogPlaybackGate";
import {
  createVoiceAssetId,
  planDialogueLineAudio,
  reduceDialogueAudioLifecycle,
  type DialogueAudioLifecycleSignal,
  type DialogueAudioRuntimeState
} from "./dialogueAudioRuntime";

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
  presentationTasks: PixiPresentationTaskSnapshot[];
}

export interface MediaRuntime {
  state: MediaRuntimeState;
}

export interface UiRuntime {
  state: UiRuntimeState;
}

export interface DialogRevealRuntime {
  state?: DialogRevealState;
  visibleText?: string;
  events: DialogRevealEvent[];
  eventSequence: number;
}

export interface TrialRuntime {
  definition: TrialDefinition;
  active: boolean;
  state?: TrialRuntimeState;
  lastOutcome: string;
}

export type VerticalSliceDiagnosticSource = "parser" | "compiler" | "story" | "transaction" | "media" | "ui" | "trial" | "asset";

export interface VerticalSliceRuntimeDiagnostic {
  source: VerticalSliceDiagnosticSource;
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  loc?: string;
  commandId?: string;
}

export interface VerticalSliceRuntimeRestorePlan {
  diagnostics: VerticalSliceRuntimeDiagnostic[];
  gameplay: GameplayState;
  navi?: NaviRuntimeState;
  playerPose?: PlayerPose;
  storyRuntime: StoryRuntime;
  storyPlay: StoryPlayState;
  trialRuntime: TrialRuntime;
  pixiStageRuntime: PixiStageRuntime;
}

export type AdapterMediaKind = "bgm" | "sfx" | "bleep" | "voice" | "video";

export interface MediaSourceResolverInput {
  sourceRef: string;
  kind: AdapterMediaKind;
  assetResolver?: AssetResolver;
}

export interface MediaSourceResolverResult {
  uri?: string;
  diagnostic?: VerticalSliceRuntimeDiagnostic;
}

export interface MediaHandleStore {
  bgm: Record<string, AudioHandle>;
  sfx: Record<string, AudioHandle>;
  dialogueBleep?: AudioHandle;
  voice?: AudioHandle;
  oneShotSequence: number;
}

export interface ApplyMediaRuntimeEffectsInput {
  effects: MediaRuntimeEffect[];
  handles: MediaHandleStore;
  resolver: (input: Pick<MediaSourceResolverInput, "sourceRef" | "kind">) => MediaSourceResolverResult;
  audioPort?: AudioPort;
  videoPort?: VideoPort;
}

export interface ApplyMediaRuntimeEffectsResult {
  diagnostics: VerticalSliceRuntimeDiagnostic[];
  voiceHandle?: AudioHandle;
}

export interface DialogueVoiceAssetAvailabilityResult {
  available: boolean;
  diagnostics: VerticalSliceRuntimeDiagnostic[];
  sourceRef?: string;
}

interface CommitDialogRevealResult {
  diagnostics: VerticalSliceRuntimeDiagnostic[];
  effects: MediaRuntimeEffect[];
  hasVoiceBoundary: boolean;
}

export type VoiceAutoAdvanceSource = Extract<StoryPlayAdvanceSource, "auto" | "auto-next">;

export interface VoiceAutoAdvanceGateController {
  clear(options?: { stopVoice?: boolean }): void;
  install(handle: AudioHandle): void;
  request(source: VoiceAutoAdvanceSource | "skip"): boolean;
}

export interface CreateVoiceAutoAdvanceGateControllerInput {
  advance: (source: VoiceAutoAdvanceSource) => void;
  clearTimeoutFn: (timeout: ReturnType<typeof setTimeout>) => void;
  postDelayMs?: number;
  setTimeoutFn: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  stopVoice: () => void;
}

export interface VerticalSliceRuntimeAdapterOptions {
  profile?: VnRuntimeProfile;
  routeTable?: VnOutputRouteTable;
  audioPort?: AudioPort;
  videoPort?: VideoPort;
  storyPlayTiming?: StoryPlayTimingPolicy;
  voiceSettings?: AdapterVoiceSettings;
  dialogueBleepConfig?: DialogueBleepConfig;
  dialogueBleepSettings?: AdapterDialogueBleepSettings;
  dialogRevealSettings?: AdapterDialogRevealSettings;
  assetResolver?: AssetResolver;
  onEnterTrial?: () => void;
  onEnterNavi?: () => void;
}

export interface AdapterVoiceSettings {
  locale: string;
  volume: number;
}

export interface AdapterDialogueBleepSettings {
  volume: number;
}

export interface AdapterDialogRevealSettings {
  textSpeed: number;
}

export interface VerticalSlicePresentationTransactionInput {
  runtimeCommands: RuntimeCommand[];
  previousPixiStage: PixiStageSnapshot;
  previousMediaState?: MediaRuntimeState;
  previousUiState?: UiRuntimeState;
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
const DEFAULT_TOAST_DURATION_MS = 2500;
const DEFAULT_VOICE_SETTINGS: AdapterVoiceSettings = { locale: "zh", volume: 1 };
const DEFAULT_DIALOGUE_BLEEP_SETTINGS: AdapterDialogueBleepSettings = { volume: 1 };
const DEFAULT_DIALOG_REVEAL_SETTINGS: AdapterDialogRevealSettings = {
  textSpeed: createDefaultSettingsSnapshot().display.textSpeed
};
const DIALOG_REVEAL_TICK_INTERVAL_MS = 16;
const MAX_DIALOG_REVEAL_EVENTS = 50;
export const POST_VOICE_AUTO_ADVANCE_DELAY_MS = 500;

export interface SyncRuntimeToastDismissalTimersInput {
  state: UiRuntimeState;
  timeouts: Record<string, number>;
  setTimeoutFn: (callback: () => void, durationMs: number) => number;
  clearTimeoutFn: (timeoutId: number) => void;
  dismissToastId: (toastId: string) => void;
  defaultDurationMs?: number;
}

export function syncRuntimeToastDismissalTimers({
  state,
  timeouts,
  setTimeoutFn,
  clearTimeoutFn,
  dismissToastId,
  defaultDurationMs = DEFAULT_TOAST_DURATION_MS
}: SyncRuntimeToastDismissalTimersInput) {
  const activeToastIds = new Set(state.toasts.map((toast) => toast.id));
  for (const [toastId, timeout] of Object.entries(timeouts)) {
    if (!activeToastIds.has(toastId)) {
      clearTimeoutFn(timeout);
      delete timeouts[toastId];
    }
  }
  for (const toast of state.toasts) {
    if (timeouts[toast.id]) continue;
    timeouts[toast.id] = setTimeoutFn(() => {
      delete timeouts[toast.id];
      dismissToastId(toast.id);
    }, toast.durationMs ?? defaultDurationMs);
  }
}

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
  const audioPort = useMemo(() => options.audioPort ?? createHowlerAudioPort(), [options.audioPort]);
  const videoPort = useMemo(() => options.videoPort ?? createHtmlVideoPort(), [options.videoPort]);
  const assetResolver = options.assetResolver;
  const storyPlayTiming = options.storyPlayTiming;
  const voiceSettings = options.voiceSettings ?? DEFAULT_VOICE_SETTINGS;
  const dialogueBleepConfig = options.dialogueBleepConfig;
  const dialogueBleepSettings = options.dialogueBleepSettings ?? DEFAULT_DIALOGUE_BLEEP_SETTINGS;
  const dialogRevealSettings = options.dialogRevealSettings ?? DEFAULT_DIALOG_REVEAL_SETTINGS;
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
  const [mediaRuntime, setMediaRuntime] = useState<MediaRuntime>(() => ({ state: createInitialMediaRuntimeState() }));
  const [uiRuntime, setUiRuntime] = useState<UiRuntime>(() => ({ state: createInitialUiRuntimeState() }));
  const [dialogRevealRuntime, setDialogRevealRuntime] = useState<DialogRevealRuntime>(() => ({
    events: [],
    eventSequence: 0
  }));
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<VerticalSliceRuntimeDiagnostic[]>(() => initialRuntimeDiagnostics);
  const [lastRuntimeCommandCount, setLastRuntimeCommandCount] = useState(0);
  const [lastOutcome, setLastOutcome] = useState("spawn");
  const [lastAction, setLastAction] = useState("boot");
  const [storySession, setStorySession] = useState(0);
  const storyRuntimeRef = useRef<StoryRuntime>({ state: createInitialStoryState(compiled.script), active: false });
  const storyPlayRef = useRef<StoryPlayState>(createInitialStoryPlayState());
  const pixiStageRuntimeRef = useRef<PixiStageRuntime>(createInitialPixiStageRuntime());
  const mediaRuntimeRef = useRef<MediaRuntime>({ state: createInitialMediaRuntimeState() });
  const uiRuntimeRef = useRef<UiRuntime>({ state: createInitialUiRuntimeState() });
  const dialogRevealRuntimeRef = useRef<DialogRevealRuntime>({ events: [], eventSequence: 0 });
  const dialogueAudioRuntimeRef = useRef<DialogueAudioRuntimeState>({});
  const mediaHandlesRef = useRef<MediaHandleStore>({ bgm: {}, sfx: {}, oneShotSequence: 0 });
  const pendingMoviePlaybackRef = useRef<{ sourceRef: string; uri: string } | undefined>(undefined);
  const toastTimeoutsRef = useRef<Record<string, number>>({});
  const observedWaitTasksRef = useRef<{ waitKey: string; observed: Set<string> } | undefined>(undefined);
  const completingWaitKeyRef = useRef<string | undefined>(undefined);
  const activeMap = getActiveMap(navi);
  const currentCameraMode = navi.inputLock === "none" && flowMode === "navi" ? "first-person" : "locked";
  const inputActionsRef = useKeyboardInputActions(defaultHarnessInputBindings, "navi", navi.inputLock === "none" && flowMode === "navi");
  const interactionView = createNaviInteractionView(navi);
  const storyPlayHostRef = useRef<{ active: boolean; schedule: StoryPlaySchedule }>({
    active: false,
    schedule: { type: "idle" }
  });
  // Voice gates resolve after a later render; keep AUTO advance on the current Story state.
  const advanceStoryRef = useRef<(source?: StoryPlayAdvanceSource) => void>(() => undefined);
  const voiceAutoAdvanceGateControllerRef = useRef<VoiceAutoAdvanceGateController | undefined>(undefined);
  const voiceEffectTokenRef = useRef(0);
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
    storyRuntimeRef.current = storyRuntime;
  }, [storyRuntime]);

  useEffect(() => {
    storyPlayRef.current = storyPlay;
  }, [storyPlay]);

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
    const key = storyRuntime.state.presentationWait ? presentationWaitKey(storyRuntime.state.presentationWait) : undefined;
    if (key !== completingWaitKeyRef.current) completingWaitKeyRef.current = undefined;
  }, [storyRuntime.state.presentationWait]);

  function setStoryRuntimeNow(next: StoryRuntime | ((current: StoryRuntime) => StoryRuntime)) {
    const resolved = typeof next === "function" ? next(storyRuntimeRef.current) : next;
    storyRuntimeRef.current = resolved;
    setStoryRuntime(resolved);
  }

  function setStoryPlayNow(next: StoryPlayState | ((current: StoryPlayState) => StoryPlayState)) {
    const resolved = typeof next === "function" ? next(storyPlayRef.current) : next;
    storyPlayRef.current = resolved;
    setStoryPlay(resolved);
  }

  function setPixiStageRuntimeNow(next: PixiStageRuntime | ((current: PixiStageRuntime) => PixiStageRuntime)) {
    const resolved = typeof next === "function" ? next(pixiStageRuntimeRef.current) : next;
    pixiStageRuntimeRef.current = resolved;
    setPixiStageRuntime(resolved);
  }

  function setMediaRuntimeNow(next: MediaRuntime | ((current: MediaRuntime) => MediaRuntime)) {
    const resolved = typeof next === "function" ? next(mediaRuntimeRef.current) : next;
    mediaRuntimeRef.current = resolved;
    setMediaRuntime(resolved);
  }

  function setUiRuntimeNow(next: UiRuntime | ((current: UiRuntime) => UiRuntime)) {
    const resolved = typeof next === "function" ? next(uiRuntimeRef.current) : next;
    uiRuntimeRef.current = resolved;
    setUiRuntime(resolved);
  }

  function setDialogRevealRuntimeNow(next: DialogRevealRuntime | ((current: DialogRevealRuntime) => DialogRevealRuntime)) {
    const resolved = typeof next === "function" ? next(dialogRevealRuntimeRef.current) : next;
    dialogRevealRuntimeRef.current = resolved;
    setDialogRevealRuntime(resolved);
  }

  const appendRuntimeDiagnostics = useCallback((diagnostics: VerticalSliceRuntimeDiagnostic[]) => {
    if (diagnostics.length === 0) return;
    setRuntimeDiagnostics((current) => limitRuntimeDiagnostics([...current, ...diagnostics]));
  }, []);

  const observeAssetDiagnostic = useCallback(
    (diagnostic: { code?: string; severity?: "info" | "warning" | "error"; message: string; assetId?: string; kind?: string }) => {
      appendRuntimeDiagnostics([toVerticalSliceAssetDiagnostic(diagnostic)]);
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
        appendRuntimeDiagnostics([mediaPortError(error instanceof Error ? error.message : String(error))]);
      });
    },
    [appendRuntimeDiagnostics, videoPort]
  );

  const dismissRuntimeToast = useCallback((toastId: string) => {
    setUiRuntimeNow((current) => ({ state: dismissToast(current.state, toastId) }));
  }, []);

  useEffect(() => {
    if (!storyRuntime.active) return;
    const plan = createDialogPlaybackSchedulePlan({
      schedule: storyPlaySchedule,
      reveal: dialogRevealRuntimeRef.current.state,
      nowMs: readRuntimeNowMs()
    });
    if (plan.type === "idle") return;
    storyPlayHostRef.current = { active: storyRuntime.active, schedule: storyPlaySchedule };
    const scheduled = storyPlaySchedule;
    const source = plan.source;
    const timeout = window.setTimeout(() => {
      const currentHost = storyPlayHostRef.current;
      if (!currentHost.active || currentHost.schedule !== scheduled) return;
      requestDialogPlaybackScheduleAdvance(source);
    }, plan.delayMs);
    return () => window.clearTimeout(timeout);
  }, [dialogRevealRuntime.state?.lineKey, dialogRevealRuntime.state?.status, storyPlaySchedule, storyRuntime.active]);

  useEffect(() => {
    const reveal = dialogRevealRuntime.state;
    if (!shouldDriveDialogReveal({ active: storyRuntime.active, reveal })) return;
    const interval = window.setInterval(() => advanceActiveDialogReveal(), DIALOG_REVEAL_TICK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [dialogRevealRuntime.state?.lineKey, dialogRevealRuntime.state?.status, storyRuntime.active]);

  useEffect(() => {
    const wait = storyRuntime.state.presentationWait;
    if (!storyRuntime.active || !wait) return;
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
  }, [storyRuntime.active, storyRuntime.state.presentationWait]);

  useEffect(() => {
    const wait = storyRuntime.state.runtimeWait;
    if (!storyRuntime.active || wait?.kind !== "pause") return;
    if (wait.mode === "confirm" || wait.durationMs === undefined) return;
    const timeout = window.setTimeout(() => completeRuntimeWaitAndAdvance("system", "pause"), wait.durationMs);
    return () => window.clearTimeout(timeout);
  }, [storyRuntime.active, storyRuntime.state.runtimeWait]);

  useEffect(() => {
    syncRuntimeToastDismissalTimers({
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
      voiceAutoAdvanceGateControllerRef.current?.clear({ stopVoice: true });
      mediaHandlesRef.current.dialogueBleep?.stop();
      dialogueAudioRuntimeRef.current = {};
    };
  }, []);

  function getVoiceAutoAdvanceGateController(): VoiceAutoAdvanceGateController {
    if (!voiceAutoAdvanceGateControllerRef.current) {
      voiceAutoAdvanceGateControllerRef.current = createVoiceAutoAdvanceGateController({
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

  function requestDialogPlaybackScheduleAdvance(source: DialogPlaybackScheduleSource): boolean {
    const revealGate = selectDialogPlaybackAdvanceGate({ source, reveal: dialogRevealRuntimeRef.current.state });
    const voiceReady = revealGate.ready ? getVoiceAutoAdvanceGateController().request(source) : false;
    const request = selectDialogPlaybackAdvanceRequest({ revealGate, voiceReady });
    if (request.type === "blocked") return false;
    advanceStory(request.source);
    return true;
  }

  function appendDialogRevealEvents(state: DialogRevealState, events: DialogRevealEvent[]) {
    setDialogRevealRuntimeNow((current) => ({
      state,
      events: events.length > 0 ? [...current.events, ...events].slice(-MAX_DIALOG_REVEAL_EVENTS) : current.events,
      eventSequence: current.eventSequence + events.length,
      visibleText: selectVisibleRevealText(state) ?? state.text
    }));
    if (events.some((event) => event.type === "reveal-finish")) {
      applyDialogueAudioLifecycleSignal({ type: "line-finish", lineKey: state.lineKey });
    }
  }

  function advanceActiveDialogReveal() {
    const reveal = dialogRevealRuntimeRef.current.state;
    if (!reveal || reveal.status === "complete") return;
    const step = advanceDialogReveal(reveal, readRuntimeNowMs());
    if (
      step.events.length === 0 &&
      step.state.status === reveal.status &&
      step.state.visibleUnitCount === reveal.visibleUnitCount
    ) {
      return;
    }
    appendDialogRevealEvents(step.state, step.events);
  }

  function completeActiveDialogReveal(): boolean {
    const reveal = dialogRevealRuntimeRef.current.state;
    if (!reveal || reveal.status === "complete") return false;
    const step = completeDialogReveal(reveal, readRuntimeNowMs());
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
    void applyMediaRuntimeEffects({
      audioPort,
      effects: step.effects,
      handles: mediaHandlesRef.current,
      resolver: ({ kind, sourceRef }) =>
        resolveMediaSource({
          kind,
          sourceRef,
          ...(assetResolver ? { assetResolver } : {})
        })
    }).then((result) => appendRuntimeDiagnostics(result.diagnostics));
  }

  function resetSlice() {
    cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate();
    clearDialogRevealRuntime();
    observedWaitTasksRef.current = undefined;
    completingWaitKeyRef.current = undefined;
    const spawnPose: PlayerPose = { position: initialMap.spawn, yaw: 0, pitch: 0 };
    setNavi({
      ...createInitialNaviState(initialMap.id),
      playerPose: spawnPose
    });
    setGameplay(createGameplayState());
    setStoryRuntimeNow({ state: createInitialStoryState(compiled.script), active: false });
    setStoryPlayNow(createInitialStoryPlayState());
    setTrialRuntime(createInitialVerticalSliceTrialRuntime());
    stopAllMediaHandles();
    setMediaRuntimeNow({ state: createInitialMediaRuntimeState() });
    setUiRuntimeNow({ state: createInitialUiRuntimeState() });
    setRuntimeDiagnostics(initialRuntimeDiagnostics);
    setPixiStageRuntimeNow((current) => ({
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

  function startStoryOverlay() {
    clearDialogRevealRuntime();
    setTrialRuntime(createInitialVerticalSliceTrialRuntime());
    const initial = createInitialStoryState(compiled.script);
    const step = advanceStoryPlay(createInitialStoryPlayState(), {
      state: initial,
      script: compiled.script,
      source: "start"
    });
    const initialPixiStage = createInitialPixiStageSnapshot();
    setStorySession((session) => session + 1);
    setStoryPlayNow(step.play);
    commitStoryTransaction({
      storyStep: step.story,
      storyPlayState: step.play,
      previousPixiStage: initialPixiStage,
      active: true,
      pacing: step.intent.pacing,
      forcePixiCommit: true
    });
  }

  function advanceStory(source: StoryPlayAdvanceSource = "manual") {
    if (dialogRevealRuntimeRef.current.state?.status === "revealing") {
      if (source === "manual") {
        cancelStoryPlayHostSchedule();
        setStoryPlayNow((current) => stopStoryPlayAutomation(current, "manual-takeover"));
        completeActiveDialogReveal();
        setLastAction("dialog:reveal-complete");
        setLastOutcome("line-complete");
      } else if (source === "skip") {
        cancelStoryPlayHostSchedule();
        clearVoiceAutoAdvanceGate({ stopVoice: true });
        completeActiveDialogReveal();
        setLastAction("story:skip");
        setLastOutcome("line-complete");
      }
      return;
    }

    if (source === "manual" || source === "skip") {
      cancelStoryPlayHostSchedule();
      if (canStoryAdvanceFromSource(storyRuntimeRef.current, source)) clearVoiceAutoAdvanceGate({ stopVoice: true });
    }
    if (storyRuntime.state.presentationWait) {
      completePresentationWaitAndAdvance(source, { settlePixi: true });
      return;
    }
    if (storyRuntime.state.runtimeWait) {
      if (storyRuntime.state.runtimeWait.kind === "pause") {
        if (!canCompletePauseRuntimeWaitFromSource(storyRuntime.state.runtimeWait, source)) {
          setLastAction(source === "manual" ? "story:advance" : `story:${source}`);
          setLastOutcome("timer-wait");
          return;
        }
        completeRuntimeWaitAndAdvance(source, "pause");
        return;
      }
      if (storyRuntime.state.runtimeWait.kind === "movie") {
        completeRuntimeWaitAndAdvance(source, "movie");
        return;
      }
      setLastAction(source === "manual" ? "story:advance" : `story:${source}`);
      setLastOutcome("input-wait");
      return;
    }
    const step = advanceStoryPlay(storyPlay, {
      state: storyRuntime.state,
      script: compiled.script,
      source
    });
    const nextStory = step.story.state;
    setStoryPlayNow(step.play);
    commitStoryTransaction({
      storyStep: step.story,
      storyPlayState: step.play,
      previousPixiStage: pixiStageRuntime.snapshot,
      active: !nextStory.ended,
      pacing: step.intent.pacing
    });
    if (nextStory.ended) {
      closeStoryOverlay("story:end");
    } else {
      setLastAction(source === "manual" ? "story:advance" : `story:${source}`);
      setLastOutcome(nextStory.presentationWait ? "presentation-wait" : nextStory.pendingChoices.length > 0 ? "choices" : "line");
    }
  }
  advanceStoryRef.current = advanceStory;

  function chooseStory(index: number) {
    cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate({ stopVoice: true });
    const step = chooseStoryPlayOption(storyPlay, {
      state: storyRuntime.state,
      script: compiled.script,
      index
    });
    const nextStory = step.story.state;
    setStoryPlayNow(step.play);
    commitStoryTransaction({
      storyStep: step.story,
      storyPlayState: step.play,
      previousPixiStage: pixiStageRuntime.snapshot,
      active: !nextStory.ended,
      pacing: step.intent.pacing
    });
    if (nextStory.ended) {
      closeStoryOverlay("story:end");
    } else {
      setLastAction(`choice:${index}`);
      setLastOutcome(nextStory.presentationWait ? "presentation-wait" : nextStory.variables.route ? `route:${String(nextStory.variables.route)}` : "choice");
    }
  }

  function toggleStoryAuto() {
    if (!canToggleStoryAutomation(storyRuntime)) return;
    if (storyPlay.mode === "auto") {
      cancelStoryPlayHostSchedule();
      clearVoiceAutoAdvanceGate();
    }
    setStoryPlayNow((current) => toggleAutoStoryPlay(current));
    setLastAction("story:auto");
    setLastOutcome(storyPlay.mode === "auto" ? "manual" : "auto");
  }

  function toggleStorySkip() {
    if (!canToggleStoryAutomation(storyRuntime)) return;
    if (storyPlay.mode === "skip") cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate({ stopVoice: true });
    if (storyPlay.mode !== "skip" && dialogRevealRuntimeRef.current.state?.status === "revealing") {
      completeActiveDialogReveal();
    }
    setStoryPlayNow((current) => toggleSkipStoryPlay(current));
    setLastAction("story:skip");
    setLastOutcome(storyPlay.mode === "skip" ? "manual" : "skip");
  }

  function stopStoryAutomation(reason: StoryPlayStopReason) {
    cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate();
    setStoryPlayNow((current) => stopStoryPlayAutomation(current, reason));
  }

  function submitStoryInput(value: string | number | boolean) {
    cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate({ stopVoice: true });
    const currentStory = storyRuntimeRef.current;
    if (!currentStory.active || currentStory.state.runtimeWait?.kind !== "input") return;
    const submitted = storyReducer(currentStory.state, { type: "SUBMIT_INPUT", script: compiled.script, value });
    appendRuntimeDiagnostics(collectVerticalSliceRuntimeDiagnostics({ storyDiagnostics: submitted.diagnostics }));
    if (submitted.diagnostics.length > 0) return;
    const step = advanceStoryPlay(storyPlayRef.current, {
      state: submitted.state,
      script: compiled.script,
      source: "manual"
    });
    setStoryPlayNow(step.play);
    commitStoryTransaction({
      storyStep: step.story,
      storyPlayState: step.play,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      active: !step.story.state.ended,
      pacing: step.intent.pacing
    });
    setLastAction("input:submit");
    setLastOutcome(step.story.state.ended ? "story:end" : "input-submitted");
  }

  function completeMoviePlayback() {
    if (storyRuntimeRef.current.state.runtimeWait?.kind === "movie") {
      completeRuntimeWaitAndAdvance("system", "movie");
      return;
    }
    pendingMoviePlaybackRef.current = undefined;
    videoPort.stop();
    setUiRuntimeNow((current) => ({ state: clearMovieOverlay(current.state) }));
  }

  function startTrial(outcome: Extract<ExplorationOutcome, { type: "start-trial" }>) {
    cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate({ stopVoice: true });
    clearDialogRevealRuntime();
    observedWaitTasksRef.current = undefined;
    completingWaitKeyRef.current = undefined;
    setStoryRuntimeNow((current) => ({ ...current, active: false }));
    setStoryPlayNow(createInitialStoryPlayState());

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
    clearVoiceAutoAdvanceGate();
    clearDialogRevealRuntime();
    observedWaitTasksRef.current = undefined;
    completingWaitKeyRef.current = undefined;
    setNavi((currentNavi) => naviReducer(currentNavi, { type: "CLOSE_OVERLAY" }));
    setStoryRuntimeNow((current) => ({ ...current, active: false }));
    setStoryPlayNow(createInitialStoryPlayState());
    stopAllMediaHandles();
    setMediaRuntimeNow({ state: createInitialMediaRuntimeState() });
    setUiRuntimeNow({ state: createInitialUiRuntimeState() });
    setLastRuntimeCommandCount(0);
    setLastAction(action);
    setLastOutcome("overlay-closed");
  }

  function restoreFromSave(save: Pick<SaveData, "mode" | "navi" | "story" | "pixiStage" | "inventory" | "evidence" | "characters" | "trial">) {
    cancelStoryPlayHostSchedule();
    clearVoiceAutoAdvanceGate();
    clearDialogRevealRuntime();
    observedWaitTasksRef.current = undefined;
    completingWaitKeyRef.current = undefined;
    const plan = createVerticalSliceRuntimeRestorePlan(save, compiled.script);
    if (plan.navi) setNavi(plan.navi);
    if (plan.playerPose) firstPersonBridge.issuePoseCommand(plan.playerPose);
    setGameplay(plan.gameplay);
    setStoryRuntimeNow(plan.storyRuntime);
    setStoryPlayNow(plan.storyPlay);
    setTrialRuntime(plan.trialRuntime);
    stopAllMediaHandles();
    setMediaRuntimeNow({ state: createInitialMediaRuntimeState() });
    setUiRuntimeNow({ state: deriveUiRuntimeLifecycleState(createInitialUiRuntimeState(), plan.storyRuntime.state) });
    setRuntimeDiagnostics(limitRuntimeDiagnostics([...initialRuntimeDiagnostics, ...plan.diagnostics]));
    setPixiStageRuntimeNow((current) => ({
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
    storyPlayState,
    previousPixiStage,
    active,
    pacing = "normal",
    forcePixiCommit = false
  }: {
    storyStep: StoryStepperResult;
    storyPlayState: StoryPlayState;
    previousPixiStage: PixiStageSnapshot;
    active: boolean;
    pacing?: StoryPlayPacing;
    forcePixiCommit?: boolean;
  }) {
    const transaction = createVerticalSlicePresentationTransaction({
      runtimeCommands: storyStep.emittedRuntimeCommands,
      previousPixiStage,
      previousMediaState: mediaRuntimeRef.current.state,
      previousUiState: uiRuntimeRef.current.state,
      options: {
        profile: runtimeProfile,
        ...(runtimeRouteTable ? { routeTable: runtimeRouteTable } : {})
      }
    });
    setLastRuntimeCommandCount(storyStep.emittedRuntimeCommands.length);
    if (transaction.gameplayEvents.length > 0) {
      setGameplay((currentGameplay) => applyGameplayEvents(currentGameplay, transaction.gameplayEvents));
    }
    const animatePixi = shouldAnimateStoryPlayPacing(pacing);
    const nextStoryState = storyStep.state.presentationWait
      ? {
          ...storyStep.state,
          presentationWait: {
            ...storyStep.state.presentationWait,
            stageRevision: transaction.pixiStage.revision,
            expectedTasks: animatePixi ? transaction.pixiWaitTasks : []
          }
        }
      : storyStep.state;
    const dialogueAudio = commitDialogRevealForStoryStep({
      active,
      dialogVisible: transaction.uiState.visible.dialog,
      pacing,
      storyPlayState,
      storyState: nextStoryState,
      runtimeCommands: storyStep.emittedRuntimeCommands
    });
    let sawMovieEffect = false;
    let pendingMoviePlayback: { sourceRef: string; uri: string } | undefined;
    const movieDiagnostics: VerticalSliceRuntimeDiagnostic[] = [];
    const nextUiStateFromCommands = transaction.mediaEffects.reduce((current, effect) => {
      if (effect.type !== "play-movie") return current;
      sawMovieEffect = true;
      const resolved = resolveMediaSource({
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
      collectVerticalSliceRuntimeDiagnostics({
        storyDiagnostics: storyStep.diagnostics,
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
      const mediaEffectInput: ApplyMediaRuntimeEffectsInput = {
        audioPort,
        effects: audioEffects,
        handles: mediaHandlesRef.current,
        resolver: ({ kind, sourceRef }) =>
          resolveMediaSource({
            kind,
            sourceRef,
            ...(assetResolver ? { assetResolver } : {})
          })
      };
      void applyMediaRuntimeEffects(mediaEffectInput).then((result) => {
        appendRuntimeDiagnostics(result.diagnostics);
        if (result.voiceHandle && voiceBoundaryToken === voiceEffectTokenRef.current) {
          getVoiceAutoAdvanceGateController().install(result.voiceHandle);
        }
      });
    }
    if (
      forcePixiCommit ||
      transaction.pixiStage !== previousPixiStage ||
      transaction.pixiHints.length > 0
    ) {
      setPixiStageRuntimeNow((current) => ({
        snapshot: transaction.pixiStage,
        hints: transaction.pixiHints,
        hintSequence: current.hintSequence + 1,
        animate: animatePixi,
        presentationTasks: animatePixi ? current.presentationTasks : []
      }));
    }
    const nextStoryRuntime = { state: nextStoryState, active };
    setStoryRuntimeNow(nextStoryRuntime);
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
    storyState: StoryRuntimeState;
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
    const nowMs = readRuntimeNowMs();
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
      visibleText: selectVisibleRevealText(step.state) ?? step.state.text
    }));
    const textId = stringRuntimeParam(print, "textId");
    const voiceAvailability = resolveDialogueVoiceAssetAvailability({
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

  function updatePixiPresentationTasks(tasks: PixiPresentationTaskSnapshot[]) {
    setPixiStageRuntimeNow((current) => ({
      ...current,
      presentationTasks: tasks
    }));
    observePixiPresentationTasks(tasks);
  }

  function observePixiPresentationTasks(tasks: PixiPresentationTaskSnapshot[]) {
    const currentStory = storyRuntimeRef.current;
    const wait = currentStory.state.presentationWait;
    if (!currentStory.active || !wait) return;
    const expectedTasks = wait.expectedTasks ?? [];
    if (expectedTasks.length === 0) return;
    const waitKey = presentationWaitKey(wait);
    if (observedWaitTasksRef.current?.waitKey !== waitKey) {
      observedWaitTasksRef.current = { waitKey, observed: new Set() };
    }
    const observed = observedWaitTasksRef.current.observed;
    const activeTaskKeys = new Set(tasks.map(pixiPresentationTaskKey));
    const expectedTaskKeys = expectedTasks.map(presentationWaitTaskKey);
    for (const key of expectedTaskKeys) {
      if (activeTaskKeys.has(key)) observed.add(key);
    }
    if (expectedTaskKeys.every((key) => observed.has(key)) && expectedTaskKeys.every((key) => !activeTaskKeys.has(key))) {
      completePresentationWaitAndAdvance("system");
    }
  }

  function completePresentationWaitAndAdvance(
    source: StoryPlayAdvanceSource,
    options: { settlePixi?: boolean } = {}
  ) {
    const currentStory = storyRuntimeRef.current;
    const wait = currentStory.state.presentationWait;
    if (!currentStory.active || !wait) return;
    const advanceSource = resolvePresentationWaitAdvanceSource(source, storyPlayRef.current);
    const waitKey = presentationWaitKey(wait);
    if (completingWaitKeyRef.current === waitKey) return;
    completingWaitKeyRef.current = waitKey;
    observedWaitTasksRef.current = undefined;

    if (options.settlePixi) {
      setPixiStageRuntimeNow((current) => ({
        ...current,
        hints: [],
        hintSequence: current.hintSequence + 1,
        animate: false,
        presentationTasks: []
      }));
    }

    const completed = storyReducer(currentStory.state, { type: "PRESENTATION_COMPLETE", script: compiled.script });
    const step = advanceStoryPlay(storyPlayRef.current, {
      state: completed.state,
      script: compiled.script,
      source: advanceSource
    });
    setStoryPlayNow(step.play);
    commitStoryTransaction({
      storyStep: step.story,
      storyPlayState: step.play,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      active: !step.story.state.ended,
      pacing: step.intent.pacing
    });
    if (step.story.state.ended) {
      closeStoryOverlay("story:end");
    } else {
      setLastAction(advanceSource === "manual" ? "story:advance" : `story:${advanceSource}`);
      setLastOutcome(step.story.state.presentationWait ? "presentation-wait" : step.story.state.pendingChoices.length > 0 ? "choices" : "line");
    }
  }

  function completeRuntimeWaitAndAdvance(source: StoryPlayAdvanceSource, kind: "pause" | "movie") {
    const currentStory = storyRuntimeRef.current;
    const wait = currentStory.state.runtimeWait;
    if (!currentStory.active || !wait || wait.kind !== kind) return;
    if (kind === "pause" && wait.kind === "pause" && !canCompletePauseRuntimeWaitFromSource(wait, source)) return;
    if (kind === "movie") {
      pendingMoviePlaybackRef.current = undefined;
      videoPort.stop();
      setUiRuntimeNow((current) => ({ state: clearMovieOverlay(current.state) }));
    }
    const completed = storyReducer(currentStory.state, { type: "RUNTIME_WAIT_COMPLETE", script: compiled.script, kind });
    appendRuntimeDiagnostics(collectVerticalSliceRuntimeDiagnostics({ storyDiagnostics: completed.diagnostics }));
    if (completed.diagnostics.length > 0) return;
    const step = advanceStoryPlay(storyPlayRef.current, {
      state: completed.state,
      script: compiled.script,
      source
    });
    setStoryPlayNow(step.play);
    commitStoryTransaction({
      storyStep: step.story,
      storyPlayState: step.play,
      previousPixiStage: pixiStageRuntimeRef.current.snapshot,
      active: !step.story.state.ended,
      pacing: step.intent.pacing
    });
    if (step.story.state.ended) {
      closeStoryOverlay("story:end");
    } else {
      setLastAction(source === "manual" ? "story:advance" : `story:${source}`);
      setLastOutcome(step.story.state.runtimeWait ? "runtime-wait" : step.story.state.pendingChoices.length > 0 ? "choices" : "line");
    }
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
      storyRuntime.state.presentationWait,
      storyRuntime.state.runtimeWait,
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
    dialogRevealRuntime,
    firstPersonBridge,
    gameplay,
    interactionContext,
    interactionView,
    lastAction,
    lastOutcome,
    lastRuntimeCommandCount,
    mediaRuntime,
    moveToPreset,
    navi,
    observeAssetDiagnostic,
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
    uiRuntime,
    updatePixiPresentationTasks,
    submitStoryInput,
    completeMoviePlayback,
    attachMovieElement,
    dismissRuntimeToast,
    exitTrial
  };

  function cancelStoryPlayHostSchedule() {
    storyPlayHostRef.current = { active: storyRuntimeRef.current.active, schedule: { type: "idle" } };
  }

  function stopAllMediaHandles() {
    for (const handle of Object.values(mediaHandlesRef.current.bgm)) handle.stop();
    for (const handle of Object.values(mediaHandlesRef.current.sfx)) handle.stop();
    mediaHandlesRef.current.dialogueBleep?.stop();
    mediaHandlesRef.current.voice?.stop();
    mediaHandlesRef.current = { bgm: {}, sfx: {}, oneShotSequence: mediaHandlesRef.current.oneShotSequence };
    dialogueAudioRuntimeRef.current = {};
    pendingMoviePlaybackRef.current = undefined;
    videoPort.stop();
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
  mediaDiagnostics = [],
  storyDiagnostics = [],
  transactionDiagnostics = [],
  uiDiagnostics = []
}: {
  mediaDiagnostics?: MediaRuntimeDiagnostic[];
  storyDiagnostics?: StoryStepperDiagnostic[];
  transactionDiagnostics?: VnRuntimeTransactionDiagnostic[];
  uiDiagnostics?: UiRuntimeDiagnostic[];
}): VerticalSliceRuntimeDiagnostic[] {
  return [
    ...storyDiagnostics.map(toVerticalSliceStoryDiagnostic),
    ...transactionDiagnostics.map(toVerticalSliceTransactionDiagnostic),
    ...mediaDiagnostics.map(toVerticalSliceMediaDiagnostic),
    ...uiDiagnostics.map(toVerticalSliceUiDiagnostic)
  ];
}

export function resolveDialogueVoiceAssetAvailability({
  assetResolver,
  textId,
  voiceSettings
}: {
  assetResolver?: AssetResolver;
  textId?: string;
  voiceSettings: AdapterVoiceSettings;
}): DialogueVoiceAssetAvailabilityResult {
  if (!textId) return { available: false, diagnostics: [] };
  const sourceRef = createVoiceAssetId(textId, voiceSettings.locale);
  if (!assetResolver) return { available: false, diagnostics: [], sourceRef };

  const resolved = assetResolver.resolve({ id: sourceRef, kind: "voice" });
  if (resolved.uri) return { available: true, diagnostics: [], sourceRef };
  if (resolved.diagnostic?.code === "asset-kind-mismatch") {
    return {
      available: false,
      diagnostics: [toVerticalSliceAssetDiagnostic({ ...resolved.diagnostic, severity: "warning" })],
      sourceRef
    };
  }
  return { available: false, diagnostics: [], sourceRef };
}

export function createVoiceAutoAdvanceGateController({
  advance,
  clearTimeoutFn,
  postDelayMs = POST_VOICE_AUTO_ADVANCE_DELAY_MS,
  setTimeoutFn,
  stopVoice
}: CreateVoiceAutoAdvanceGateControllerInput): VoiceAutoAdvanceGateController {
  let nextToken = 0;
  let gate:
    | {
        pendingSource?: VoiceAutoAdvanceSource;
        postDelayTimeout?: ReturnType<typeof setTimeout>;
        ready: boolean;
        token: number;
      }
    | undefined;

  function clear({ stopVoice: shouldStopVoice = false }: { stopVoice?: boolean } = {}) {
    nextToken += 1;
    if (gate?.postDelayTimeout) clearTimeoutFn(gate.postDelayTimeout);
    gate = undefined;
    if (shouldStopVoice) stopVoice();
  }

  function releaseReadyGate(token: number) {
    const current = gate;
    if (!current || current.token !== token) return;
    current.ready = true;
    const pendingSource = current.pendingSource;
    if (!pendingSource) return;
    clear();
    advance(pendingSource);
  }

  function releaseFailedGate(token: number) {
    const current = gate;
    if (!current || current.token !== token) return;
    const pendingSource = current.pendingSource;
    clear();
    if (pendingSource) advance(pendingSource);
  }

  return {
    clear,
    install(handle) {
      clear();
      const token = ++nextToken;
      gate = { ready: false, token };
      void handle.finished.then(({ reason }) => {
        const current = gate;
        if (!current || current.token !== token) return;
        switch (reason) {
          case "ended":
            current.postDelayTimeout = setTimeoutFn(() => releaseReadyGate(token), postDelayMs);
            return;
          case "failed":
            releaseFailedGate(token);
            return;
          case "stopped":
            clear();
            return;
        }
      });
    },
    request(source) {
      if (source === "skip") {
        clear({ stopVoice: true });
        return true;
      }
      const current = gate;
      if (!current) return true;
      if (current.ready) {
        clear();
        return true;
      }
      current.pendingSource = source;
      return false;
    }
  };
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
    isAtStableStop:
      flowMode === "navi" &&
      !storyRuntime.state.presentationWait &&
      !storyRuntime.state.runtimeWait &&
      (navi.substate === "walk" || navi.substate === "vn2d-overlay")
  };
}

export function canToggleStoryAutomation(storyRuntime: StoryRuntime): boolean {
  return (
    storyRuntime.active &&
    !storyRuntime.state.ended &&
    storyRuntime.state.pendingChoices.length === 0 &&
    !storyRuntime.state.presentationWait &&
    !storyRuntime.state.runtimeWait
  );
}

export function canStoryAdvanceFromSource(storyRuntime: StoryRuntime, source: StoryPlayAdvanceSource): boolean {
  if (!storyRuntime.active || storyRuntime.state.ended || storyRuntime.state.pendingChoices.length > 0) return false;
  if (storyRuntime.state.presentationWait) return true;
  const wait = storyRuntime.state.runtimeWait;
  if (!wait) return true;
  if (wait.kind === "pause") return canCompletePauseRuntimeWaitFromSource(wait, source);
  return wait.kind === "movie";
}

export function canCompletePauseRuntimeWaitFromSource(
  wait: Extract<NonNullable<StoryRuntimeState["runtimeWait"]>, { kind: "pause" }>,
  source: StoryPlayAdvanceSource
): boolean {
  if (source === "system") return true;
  return source === "manual" && wait.mode !== "timer";
}

export function createVerticalSliceRuntimeRestorePlan(
  save: Pick<SaveData, "mode" | "navi" | "story" | "pixiStage" | "inventory" | "evidence" | "characters" | "trial">,
  script: { scriptPath: string }
): VerticalSliceRuntimeRestorePlan {
  const { runtimeWait: restoredRuntimeWait, ...saveableStory } = save.story;
  const storyRuntime = {
    active: save.navi?.substate === "vn2d-overlay" && !save.story.ended,
    state: {
      ...createInitialStoryState(script),
      ...saveableStory
    }
  };
  return {
    diagnostics: restoredRuntimeWait
      ? [
          {
            source: "story",
            code: "runtime-wait-cleared-on-load",
            severity: "warning",
            message: "Saved runtimeWait was cleared during restore because runtime waits are transient app state."
          }
        ]
      : [],
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
      animate: false,
      presentationTasks: []
    }
  };
}

export function createInitialPixiStageRuntime(): PixiStageRuntime {
  return {
    snapshot: createInitialPixiStageSnapshot(),
    hints: [],
    hintSequence: 0,
    animate: false,
    presentationTasks: []
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

export function resolvePresentationWaitAdvanceSource(
  source: StoryPlayAdvanceSource,
  storyPlay: Pick<StoryPlayState, "mode">
): StoryPlayAdvanceSource {
  return source === "system" && storyPlay.mode === "skip" ? "skip" : source;
}

function latestPrintCommand(commands: RuntimeCommand[]): RuntimeCommand | undefined {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index];
    if (command?.commandId === "print") return command;
  }
  return undefined;
}

function createDialogRevealLineKey(storyState: StoryRuntimeState, command: RuntimeCommand): string {
  const loc = command.loc;
  const source = loc ? `${loc.scriptPath}:${loc.line}:${loc.column}` : `${storyState.currentScriptPath}:${storyState.instructionPointer}`;
  return `${source}:${storyState.backlog.length}`;
}

function presentationWaitKey(wait: NonNullable<StoryRuntimeState["presentationWait"]>): string {
  const tasks = (wait.expectedTasks ?? []).map(presentationWaitTaskKey).join("|");
  return `${wait.commandIndex ?? "unknown"}:${wait.commandId}:${wait.stageRevision ?? "none"}:${tasks}`;
}

function presentationWaitTaskKey(task: NonNullable<StoryRuntimeState["presentationWait"]>["expectedTasks"][number]): string {
  return `${task.kind}:${task.target}:${task.revision}`;
}

function pixiPresentationTaskKey(task: PixiPresentationTaskSnapshot): string {
  return `${task.kind}:${task.target}:${task.revision}`;
}

export function createVerticalSlicePresentationTransaction({
  runtimeCommands,
  previousMediaState,
  previousPixiStage,
  previousUiState,
  options = {}
}: VerticalSlicePresentationTransactionInput): VnRuntimePresentationTransaction {
  return createVnRuntimePresentationTransaction({
    runtimeCommands,
    ...(previousMediaState ? { previousMediaState } : {}),
    previousPixiStage,
    ...(previousUiState ? { previousUiState } : {}),
    profile: options.profile ?? "vn2d",
    ...(options.routeTable ? { routeTable: options.routeTable } : {})
  });
}

export function resolveMediaSource({
  assetResolver,
  kind,
  sourceRef
}: MediaSourceResolverInput): MediaSourceResolverResult {
  if (!assetResolver) {
    return {
      diagnostic: {
        source: "asset",
        code: "asset-resolver-missing",
        severity: "error",
        message: `Media source ${sourceRef} (${kind}) could not be resolved because no AssetResolver was provided.`
      }
    };
  }
  const resolved = assetResolver.resolve({ id: sourceRef, kind });
  if (resolved.uri) return { uri: resolved.uri };

  return {
    diagnostic: toVerticalSliceAssetDiagnostic(
      resolved.diagnostic ?? {
        code: "asset-missing",
        severity: "error",
        id: sourceRef,
        kind,
        message: `Media source ${sourceRef} (${kind}) could not be resolved.`
      }
    )
  };
}

export async function applyMediaRuntimeEffects({
  audioPort,
  effects,
  handles,
  resolver,
  videoPort
}: ApplyMediaRuntimeEffectsInput): Promise<ApplyMediaRuntimeEffectsResult> {
  const diagnostics: VerticalSliceRuntimeDiagnostic[] = [];
  let voiceHandle: AudioHandle | undefined;
  for (const effect of effects) {
    try {
      if (effect.type === "play-bgm") {
        const resolved = resolver({ sourceRef: effect.sourceRef, kind: "bgm" });
        if (!resolved.uri) {
          if (resolved.diagnostic) diagnostics.push(resolved.diagnostic);
          continue;
        }
        if (!audioPort) {
          diagnostics.push(mediaPortError("AudioPort is not available for BGM playback."));
          continue;
        }
        handles.bgm[effect.key]?.stop();
        handles.bgm[effect.key] = audioPort.playBgm(effect.key, resolved.uri, {
          loop: true,
          ...(effect.volume !== undefined ? { volume: effect.volume } : {})
        });
        continue;
      }

      if (effect.type === "stop-bgm") {
        const handle = handles.bgm[effect.key];
        if (!handle) {
          diagnostics.push(mediaHandleMissing(`BGM handle ${effect.key} is not active.`));
          continue;
        }
        if (effect.fadeMs !== undefined) handle.fadeOutAndStop(effect.fadeMs);
        else handle.stop();
        delete handles.bgm[effect.key];
        continue;
      }

      if (effect.type === "play-sfx") {
        const resolved = resolver({ sourceRef: effect.sourceRef, kind: "sfx" });
        if (!resolved.uri) {
          if (resolved.diagnostic) diagnostics.push(resolved.diagnostic);
          continue;
        }
        if (!audioPort) {
          diagnostics.push(mediaPortError("AudioPort is not available for SFX playback."));
          continue;
        }
        const key = effect.key ?? `sfx:one-shot:${++handles.oneShotSequence}`;
        const handle = audioPort.playSfx(key, resolved.uri, {
          loop: effect.loop,
          ...(effect.volume !== undefined ? { volume: effect.volume } : {})
        });
        if (effect.loop) handles.sfx[key] = handle;
        continue;
      }

      if (effect.type === "stop-sfx") {
        const handle = handles.sfx[effect.key];
        if (!handle) {
          diagnostics.push(mediaHandleMissing(`Looping SFX handle ${effect.key} is not active.`));
          continue;
        }
        if (effect.fadeMs !== undefined) handle.fadeOutAndStop(effect.fadeMs);
        else handle.stop();
        delete handles.sfx[effect.key];
        continue;
      }

      if (effect.type === "play-dialogue-bleep") {
        handles.dialogueBleep?.stop();
        delete handles.dialogueBleep;
        const resolved = resolver({ sourceRef: effect.sourceRef, kind: "bleep" });
        if (!resolved.uri) {
          if (resolved.diagnostic) diagnostics.push({ ...resolved.diagnostic, severity: "warning" });
          continue;
        }
        if (!audioPort) {
          diagnostics.push(mediaPortError("AudioPort is not available for dialogue bleep playback."));
          continue;
        }
        handles.dialogueBleep = audioPort.playDialogueBleep(effect.key, resolved.uri, {
          ...(effect.volume !== undefined ? { volume: effect.volume } : {})
        });
        continue;
      }

      if (effect.type === "stop-dialogue-bleep") {
        handles.dialogueBleep?.stop();
        delete handles.dialogueBleep;
        continue;
      }

      if (effect.type === "stop-voice") {
        voiceHandle = undefined;
        handles.voice?.stop();
        delete handles.voice;
        continue;
      }

      if (effect.type === "play-voice") {
        voiceHandle = undefined;
        handles.voice?.stop();
        delete handles.voice;
        const resolved = resolver({ sourceRef: effect.sourceRef, kind: "voice" });
        if (!resolved.uri) {
          if (resolved.diagnostic) diagnostics.push({ ...resolved.diagnostic, severity: "warning" });
          continue;
        }
        if (!audioPort) {
          diagnostics.push(mediaPortError("AudioPort is not available for voice playback."));
          continue;
        }
        voiceHandle = audioPort.playVoice(effect.key, resolved.uri, {
          ...(effect.volume !== undefined ? { volume: effect.volume } : {})
        });
        handles.voice = voiceHandle;
        continue;
      }

      const resolved = resolver({ sourceRef: effect.sourceRef, kind: "video" });
      if (!resolved.uri) {
        if (resolved.diagnostic) diagnostics.push(resolved.diagnostic);
        continue;
      }
      if (videoPort) await videoPort.play(resolved.uri);
    } catch (error) {
      diagnostics.push(mediaPortError(error instanceof Error ? error.message : String(error)));
    }
  }
  return {
    diagnostics,
    ...(voiceHandle ? { voiceHandle } : {})
  };
}

function applyGameplayEvents(gameplay: GameplayState, events: GameplayEvent[]): GameplayState {
  return events.reduce((current, event) => {
    return applyGameplayEvent(current, event).state;
  }, gameplay);
}

function mediaHandleMissing(message: string): VerticalSliceRuntimeDiagnostic {
  return { source: "media", code: "media-handle-missing", severity: "info", message };
}

function mediaPortError(message: string): VerticalSliceRuntimeDiagnostic {
  return { source: "media", code: "media-port-error", severity: "warning", message };
}

function stringRuntimeParam(command: RuntimeCommand, key: string): string | undefined {
  const value = command.params[key];
  return typeof value === "string" ? value : undefined;
}

function numberRuntimeParam(command: RuntimeCommand, key: string): number | undefined {
  const value = command.params[key];
  return typeof value === "number" ? value : undefined;
}

function readRuntimeNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
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

function toVerticalSliceMediaDiagnostic(diagnostic: MediaRuntimeDiagnostic): VerticalSliceRuntimeDiagnostic {
  return {
    source: "media",
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    commandId: diagnostic.commandId
  };
}

function toVerticalSliceUiDiagnostic(diagnostic: UiRuntimeDiagnostic): VerticalSliceRuntimeDiagnostic {
  return {
    source: "ui",
    code: diagnostic.code,
    severity: diagnostic.severity,
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

function toVerticalSliceAssetDiagnostic(
  diagnostic: Pick<AssetRegistryDiagnostic, "message"> & {
    code?: string;
    severity?: "info" | "warning" | "error";
    id?: string;
    assetId?: string;
    kind?: string;
  }
): VerticalSliceRuntimeDiagnostic {
  const assetId = diagnostic.assetId ?? diagnostic.id;
  const detail = [assetId, diagnostic.kind].filter(Boolean).join(" ");
  return {
    source: "asset",
    code: diagnostic.code ?? "asset-unresolved",
    severity: diagnostic.severity ?? "error",
    message: detail ? `${diagnostic.message} (${detail})` : diagnostic.message
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
