import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialMediaRuntimeState,
  createInitialUiRuntimeState,
  createVnRuntimePresentationTransaction,
  type MediaRuntimeState,
  type UiRuntimeState
} from "@v-ronpa/app-vn-dispatch";
import {
  advanceVnSession,
  chooseVnSessionOption,
  completeVnSessionRuntimeWait,
  createSaveableVnSessionSnapshot,
  createVnSession,
  restoreVnSession,
  stopVnSessionAutomation,
  submitVnSessionInput,
  toggleVnSessionAuto,
  toggleVnSessionSkip,
  type SaveableVnSessionSnapshot,
  type VnSessionState
} from "@v-ronpa/app-vn-session";
import type { GameInteractionContext, GameUiAction, PixiStageSnapshot, RuntimeCommand, SaveData } from "@v-ronpa/contracts";
import {
  createInitialPixiStageSnapshot,
  type PixiPresentationTaskSnapshot,
  type PixiStageRenderHint
} from "@v-ronpa/pixi-presenter";
import {
  selectStoryPlaySchedule,
  type StoryPlayAdvanceSource,
  type StoryPlaySchedule,
  type StoryPlayStopReason,
  type StoryPlayTimingPolicy
} from "@v-ronpa/story-play";
import { gameAScript, gameAVnEntry } from "./contentManifest";

export interface GameAPixiStageRuntime {
  snapshot: PixiStageSnapshot;
  hints: PixiStageRenderHint[];
  hintSequence: number;
  animate: boolean;
  presentationTasks: PixiPresentationTaskSnapshot[];
}

export interface UseGameAVnRuntimeOptions {
  storyPlayTiming?: Partial<StoryPlayTimingPolicy>;
}

export function useGameAVnRuntime({ storyPlayTiming }: UseGameAVnRuntimeOptions = {}) {
  const bootSession = useMemo(
    () =>
      createVnSession({
        scriptPath: gameAVnEntry.scriptPath,
        sourceText: gameAScript,
        startLabel: gameAVnEntry.startLabel
      }).session,
    []
  );
  const [session, setSession] = useState<VnSessionState>(() => ({ ...bootSession, active: false }));
  const [pixiStageRuntime, setPixiStageRuntime] = useState<GameAPixiStageRuntime>(() => ({
    snapshot: createInitialPixiStageSnapshot(),
    hints: [],
    hintSequence: 0,
    animate: true,
    presentationTasks: []
  }));
  const [mediaState, setMediaState] = useState<MediaRuntimeState>(() => createInitialMediaRuntimeState());
  const [uiState, setUiState] = useState<UiRuntimeState>(() => createInitialUiRuntimeState());

  const sessionRef = useRef(session);
  const pixiStageRuntimeRef = useRef(pixiStageRuntime);
  const mediaStateRef = useRef(mediaState);
  const uiStateRef = useRef(uiState);
  const scheduleTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    pixiStageRuntimeRef.current = pixiStageRuntime;
  }, [pixiStageRuntime]);

  useEffect(() => {
    mediaStateRef.current = mediaState;
  }, [mediaState]);

  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  const applySession = useCallback(
    (
      nextSession: VnSessionState,
      runtimeCommands: RuntimeCommand[] = [],
      previousPixiStage?: PixiStageSnapshot,
      previousMediaState?: MediaRuntimeState,
      previousUiState?: UiRuntimeState
    ) => {
      const transaction = createVnRuntimePresentationTransaction({
        runtimeCommands,
        previousPixiStage: previousPixiStage ?? pixiStageRuntimeRef.current.snapshot,
        previousMediaState: previousMediaState ?? mediaStateRef.current,
        previousUiState: previousUiState ?? uiStateRef.current,
        profile: gameAVnEntry.profile
      });
      setSession(nextSession);
      setMediaState(transaction.mediaState);
      setUiState(transaction.uiState);
      setPixiStageRuntime((current) => ({
        snapshot: transaction.pixiStage,
        hints: transaction.pixiHints,
        hintSequence: current.hintSequence + 1,
        animate: true,
        presentationTasks: current.presentationTasks
      }));
    },
    []
  );

  const startNewGame = useCallback(() => {
    window.clearTimeout(scheduleTimerRef.current);
    const resetPixi = createInitialPixiStageSnapshot();
    const resetMedia = createInitialMediaRuntimeState();
    const resetUi = createInitialUiRuntimeState();
    const boot = createVnSession({
      scriptPath: gameAVnEntry.scriptPath,
      sourceText: gameAScript,
      startLabel: gameAVnEntry.startLabel
    }).session;
    const firstStep = advanceVnSession(boot, "start");
    setPixiStageRuntime({ snapshot: resetPixi, hints: [], hintSequence: 0, animate: true, presentationTasks: [] });
    setMediaState(resetMedia);
    setUiState(resetUi);
    applySession(firstStep.session, firstStep.emittedRuntimeCommands, resetPixi, resetMedia, resetUi);
  }, [applySession]);

  const advanceStory = useCallback(
    (source: StoryPlayAdvanceSource = "manual") => {
      const current = sessionRef.current;
      if (!current.active) return;
      const step = advanceVnSession(current, source);
      applySession(step.session, step.emittedRuntimeCommands);
    },
    [applySession]
  );

  const chooseStory = useCallback(
    (index: number) => {
      const current = sessionRef.current;
      if (!current.active) return;
      const step = chooseVnSessionOption(current, index);
      applySession(step.session, step.emittedRuntimeCommands);
    },
    [applySession]
  );

  const submitStoryInput = useCallback(
    (value: string | number | boolean) => {
      const current = sessionRef.current;
      if (!current.active) return;
      const step = submitVnSessionInput(current, value);
      applySession(step.session, step.emittedRuntimeCommands);
    },
    [applySession]
  );

  const completeMoviePlayback = useCallback(() => {
    const current = sessionRef.current;
    if (!current.active || current.story.runtimeWait?.kind !== "movie") return;
    const step = completeVnSessionRuntimeWait(current, "movie");
    applySession(step.session, step.emittedRuntimeCommands);
  }, [applySession]);

  const toggleStoryAuto = useCallback(() => setSession((current) => toggleVnSessionAuto(current)), []);
  const toggleStorySkip = useCallback(() => setSession((current) => toggleVnSessionSkip(current)), []);
  const stopStoryAutomation = useCallback(
    (reason: StoryPlayStopReason) => setSession((current) => stopVnSessionAutomation(current, reason)),
    []
  );

  const restoreFromSnapshot = useCallback(
    (snapshot: SaveableVnSessionSnapshot, pixiStage: PixiStageSnapshot) => {
      const restored = restoreVnSession({ script: bootSession.script, snapshot, active: !snapshot.story.ended });
      setPixiStageRuntime({ snapshot: pixiStage, hints: [], hintSequence: 0, animate: true, presentationTasks: [] });
      setMediaState(createInitialMediaRuntimeState());
      setUiState(createInitialUiRuntimeState());
      setSession(restored);
    },
    [bootSession.script]
  );

  const storyPlaySchedule: StoryPlaySchedule = useMemo(
    () =>
      selectStoryPlaySchedule(session.play, session.story, {
        active: session.active,
        hostReadyForAuto: true,
        ...(storyPlayTiming ? { timing: storyPlayTiming } : {})
      }),
    [session.active, session.play, session.story, storyPlayTiming]
  );

  useEffect(() => {
    window.clearTimeout(scheduleTimerRef.current);
    if (storyPlaySchedule.type === "idle") return;
    if (storyPlaySchedule.type === "advance") {
      advanceStory(storyPlaySchedule.source);
      return;
    }
    scheduleTimerRef.current = window.setTimeout(() => advanceStory(storyPlaySchedule.source), storyPlaySchedule.delayMs);
    return () => window.clearTimeout(scheduleTimerRef.current);
  }, [advanceStory, storyPlaySchedule]);

  const interactionContext: GameInteractionContext = useMemo(
    () => ({
      mode: "vn",
      overlayStack: [],
      inputLock: session.active ? "dialog" : "none",
      hasActiveStory: session.active,
      storyHasChoices: session.story.pendingChoices.length > 0,
      storyEnded: session.story.ended,
      isAtStableStop: session.active && !session.story.presentationWait && !session.story.runtimeWait
    }),
    [session.active, session.story.ended, session.story.pendingChoices.length, session.story.presentationWait, session.story.runtimeWait]
  );

  return {
    advanceStory,
    attachMovieElement: () => undefined,
    chooseStory,
    completeMoviePlayback,
    createSaveSnapshot: () => createSaveableVnSessionSnapshot(sessionRef.current),
    dialogRevealRuntime: {},
    dismissRuntimeToast: () => undefined,
    interactionContext,
    pixiStageRuntime,
    restoreFromSave(save: SaveData) {
      restoreFromSnapshot(
        { story: save.vn?.story ?? save.story, play: sessionRef.current.play },
        save.vn?.pixiStage ?? save.pixiStage
      );
    },
    startNewGame,
    stopStoryAutomation,
    storyPlayActiveActions: {
      "toggle-auto": session.play.mode === "auto",
      "toggle-skip": session.play.mode === "skip"
    } satisfies Partial<Record<GameUiAction, boolean>>,
    storyRuntime: {
      active: session.active,
      state: session.story
    },
    submitStoryInput,
    toggleStoryAuto,
    toggleStorySkip,
    uiRuntime: {
      state: uiState
    },
    updatePixiPresentationTasks(tasks: PixiPresentationTaskSnapshot[]) {
      setPixiStageRuntime((current) => ({ ...current, presentationTasks: tasks }));
    }
  };
}
