import { assign, setup } from "xstate";
import type {
  GameInteractionContext,
  GameMode,
  GameOverlayKind,
  GamePauseSection,
  InputLockState,
  InteractionCapabilitySnapshot,
  NaviSubstate,
  TrialPresentationProfile
} from "@v-ronpa/contracts";
import { GameInteractionContextSchema, InteractionCapabilitySnapshotSchema } from "@v-ronpa/contracts";

export type PlayableGameMode = Extract<GameMode, "vn" | "navi" | "trial">;

export type GameFlowEvent =
  | { type: "BOOT" }
  | { type: "START_NEW_GAME"; mode: PlayableGameMode }
  | { type: "ENTER_VN" }
  | { type: "ENTER_NAVI" }
  | { type: "ENTER_TRIAL" }
  | { type: "OPEN_PAUSE"; section: GamePauseSection }
  | { type: "RESUME" }
  | { type: "RETURN_TITLE" }
  | { type: "OPEN_OVERLAY"; overlay: GameOverlayKind }
  | { type: "CLOSE_OVERLAY" };

export interface GameFlowContext {
  activeOverlay: GameOverlayKind | null;
  pauseSection: GamePauseSection | null;
  resumeMode: PlayableGameMode | null;
}

export interface GameFlowSnapshot {
  mode: GameMode;
  activeOverlay?: GameOverlayKind;
  pauseSection?: GamePauseSection;
  resumeMode?: PlayableGameMode;
}

export interface VnInteractionFacts {
  hasActiveStory: boolean;
  storyHasChoices: boolean;
  storyEnded: boolean;
  isAtStableStop: boolean;
  inputLock: InputLockState;
}

export interface GameHostInteractionFacts {
  inputLock?: InputLockState;
  isAtStableStop?: boolean;
  naviSubstate?: NaviSubstate;
  trialPresentation?: TrialPresentationProfile;
}

const initialGameFlowContext: GameFlowContext = { activeOverlay: null, pauseSection: null, resumeMode: null };

const machineSetup = setup({
  types: {} as { context: GameFlowContext; events: GameFlowEvent },
  guards: {
    startVn: ({ event }) => event.type === "START_NEW_GAME" && event.mode === "vn",
    startNavi: ({ event }) => event.type === "START_NEW_GAME" && event.mode === "navi",
    startTrial: ({ event }) => event.type === "START_NEW_GAME" && event.mode === "trial",
    resumeVn: ({ context }) => context.resumeMode === "vn",
    resumeNavi: ({ context }) => context.resumeMode === "navi",
    resumeTrial: ({ context }) => context.resumeMode === "trial"
  },
  actions: {
    clearFlow: assign(() => ({ activeOverlay: null, pauseSection: null, resumeMode: null })),
    clearResume: assign(() => ({ activeOverlay: null, pauseSection: null, resumeMode: null })),
    enterPlayable: assign(({ context }) => ({ ...context, activeOverlay: null, pauseSection: null })),
    rememberVnPause: assign(({ event }) =>
      event.type === "OPEN_PAUSE"
        ? { activeOverlay: null, pauseSection: event.section, resumeMode: "vn" as const }
        : initialGameFlowContext
    ),
    rememberNaviPause: assign(({ event }) =>
      event.type === "OPEN_PAUSE"
        ? { activeOverlay: null, pauseSection: event.section, resumeMode: "navi" as const }
        : initialGameFlowContext
    ),
    rememberTrialPause: assign(({ event }) =>
      event.type === "OPEN_PAUSE"
        ? { activeOverlay: null, pauseSection: event.section, resumeMode: "trial" as const }
        : initialGameFlowContext
    ),
    setPauseSection: assign(({ context, event }) =>
      event.type === "OPEN_PAUSE" ? { ...context, pauseSection: event.section } : context
    ),
    openOverlay: assign(({ context, event }) =>
      event.type === "OPEN_OVERLAY" ? { ...context, activeOverlay: event.overlay } : context
    ),
    closeOverlay: assign(({ context }) => ({ ...context, activeOverlay: null }))
  }
});

const overlayEvents = {
  OPEN_OVERLAY: { actions: "openOverlay" },
  CLOSE_OVERLAY: { actions: "closeOverlay" }
} as const;

const playableTransitions = {
  ENTER_VN: { target: "vn", actions: "enterPlayable" },
  ENTER_NAVI: { target: "navi", actions: "enterPlayable" },
  ENTER_TRIAL: { target: "trial", actions: "enterPlayable" },
  RETURN_TITLE: { target: "title", actions: "clearFlow" },
  ...overlayEvents
} as const;

const resumeTransitions = [
  { guard: "resumeVn", target: "vn", actions: "clearResume" },
  { guard: "resumeNavi", target: "navi", actions: "clearResume" },
  { guard: "resumeTrial", target: "trial", actions: "clearResume" }
] as const;

export const gameFlowMachine = machineSetup.createMachine({
  id: "v-ronpa-flow",
  context: initialGameFlowContext,
  initial: "loading",
  states: {
    loading: { on: { BOOT: { target: "title", actions: "clearFlow" } } },
    title: {
      on: {
        START_NEW_GAME: [
          { guard: "startVn", target: "vn", actions: "enterPlayable" },
          { guard: "startNavi", target: "navi", actions: "enterPlayable" },
          { guard: "startTrial", target: "trial", actions: "enterPlayable" }
        ],
        ENTER_VN: { target: "vn", actions: "enterPlayable" },
        ENTER_NAVI: { target: "navi", actions: "enterPlayable" },
        ENTER_TRIAL: { target: "trial", actions: "enterPlayable" },
        ...overlayEvents
      }
    },
    vn: { on: { ...playableTransitions, OPEN_PAUSE: { target: "paused", actions: "rememberVnPause" } } },
    navi: { on: { ...playableTransitions, OPEN_PAUSE: { target: "paused", actions: "rememberNaviPause" } } },
    trial: { on: { ...playableTransitions, OPEN_PAUSE: { target: "paused", actions: "rememberTrialPause" } } },
    paused: {
      on: {
        RESUME: resumeTransitions,
        OPEN_PAUSE: { actions: "setPauseSection" },
        RETURN_TITLE: { target: "title", actions: "clearFlow" },
        ENTER_VN: { target: "vn", actions: "clearResume" },
        ENTER_NAVI: { target: "navi", actions: "clearResume" },
        ENTER_TRIAL: { target: "trial", actions: "clearResume" }
      }
    }
  }
});

export function modeFromSnapshotValue(value: unknown): GameMode {
  return String(value) as GameMode;
}

export function createGameFlowSnapshot(value: unknown, context: GameFlowContext): GameFlowSnapshot {
  return {
    mode: modeFromSnapshotValue(value),
    ...(context.activeOverlay ? { activeOverlay: context.activeOverlay } : {}),
    ...(context.pauseSection ? { pauseSection: context.pauseSection } : {}),
    ...(context.resumeMode ? { resumeMode: context.resumeMode } : {})
  };
}

export function deriveGameInteractionState({
  flow,
  host = {},
  vn
}: {
  flow: GameFlowSnapshot;
  host?: GameHostInteractionFacts;
  vn: VnInteractionFacts;
}): { context: GameInteractionContext; capabilities: InteractionCapabilitySnapshot } {
  const hasMenu = Boolean(flow.activeOverlay || flow.pauseSection || flow.mode === "paused");
  const inputLock = hasMenu ? "menu" : host.inputLock ?? vn.inputLock;
  const context = GameInteractionContextSchema.parse({
    mode: flow.mode,
    ...(flow.activeOverlay ? { activeOverlay: flow.activeOverlay } : {}),
    ...(flow.pauseSection ? { pauseSection: flow.pauseSection } : {}),
    inputLock,
    hasActiveStory: vn.hasActiveStory,
    storyHasChoices: vn.storyHasChoices,
    storyEnded: vn.storyEnded,
    isAtStableStop: host.isAtStableStop ?? vn.isAtStableStop,
    ...(host.naviSubstate ? { naviSubstate: host.naviSubstate } : {}),
    ...(host.trialPresentation ? { trialPresentation: host.trialPresentation } : {})
  });
  return {
    context,
    capabilities: calculateInteractionCapabilities(context, flow.mode === "paused" ? flow.resumeMode : flow.mode)
  };
}

export function calculateInteractionCapabilities(
  context: GameInteractionContext,
  effectiveMode: GameMode | undefined = context.mode
): InteractionCapabilitySnapshot {
  const inTitle = effectiveMode === "title";
  const inPlayableMode = effectiveMode === "vn" || effectiveMode === "navi" || effectiveMode === "trial";
  const inVnStory = context.hasActiveStory && context.inputLock === "dialog";
  const canAutomateStory = inVnStory && !context.storyEnded && !context.storyHasChoices;
  const canSave = inPlayableMode && context.isAtStableStop && !(context.hasActiveStory && context.storyEnded);
  const canLoad = inTitle || inPlayableMode;
  const hasStoryBacklog =
    context.hasActiveStory &&
    !context.storyEnded &&
    (effectiveMode === "vn" || context.naviSubstate === "vn2d-overlay" || context.trialPresentation === "vn2d");

  return InteractionCapabilitySnapshotSchema.parse({
    canStartNewGame: inTitle,
    canSave,
    canLoad,
    canOpenSettings: true,
    canOpenBacklog: hasStoryBacklog,
    canOpenPause: context.mode !== "paused" && inPlayableMode && context.inputLock !== "menu",
    canAuto: canAutomateStory,
    canSkip: canAutomateStory,
    canReturnTitle: inPlayableMode
  });
}
