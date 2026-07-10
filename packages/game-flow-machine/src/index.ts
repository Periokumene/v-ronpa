import { assign, setup } from "xstate";
import type {
  GameInteractionContext,
  GameMode,
  GameOverlayKind,
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
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RETURN_TITLE" }
  | { type: "OPEN_OVERLAY"; overlay: GameOverlayKind }
  | { type: "CLOSE_OVERLAY" }
  | { type: "POP_OVERLAY" };

export interface GameFlowContext {
  overlayStack: GameOverlayKind[];
  resumeMode: PlayableGameMode | null;
}

export interface GameFlowSnapshot {
  mode: GameMode;
  overlayStack: GameOverlayKind[];
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

const initialGameFlowContext: GameFlowContext = { overlayStack: [], resumeMode: null };

const machineSetup = setup({
  types: {} as { context: GameFlowContext; events: GameFlowEvent },
  guards: {
    startVn: ({ event }) => event.type === "START_NEW_GAME" && event.mode === "vn",
    startNavi: ({ event }) => event.type === "START_NEW_GAME" && event.mode === "navi",
    startTrial: ({ event }) => event.type === "START_NEW_GAME" && event.mode === "trial",
    resumeVn: ({ context }) => context.resumeMode === "vn",
    resumeNavi: ({ context }) => context.resumeMode === "navi",
    resumeTrial: ({ context }) => context.resumeMode === "trial",
    hasNestedPauseOverlay: ({ context }) => context.overlayStack.length > 1
  },
  actions: {
    clearFlow: assign(() => ({ overlayStack: [], resumeMode: null })),
    clearResume: assign(() => ({ overlayStack: [], resumeMode: null })),
    enterPlayable: assign(({ context }) => ({ ...context, overlayStack: [] })),
    rememberVnPause: assign(() => ({ overlayStack: ["pause-menu"], resumeMode: "vn" as const })),
    rememberNaviPause: assign(() => ({ overlayStack: ["pause-menu"], resumeMode: "navi" as const })),
    rememberTrialPause: assign(() => ({ overlayStack: ["pause-menu"], resumeMode: "trial" as const })),
    pushOverlay: assign(({ context, event }) =>
      event.type === "OPEN_OVERLAY" ? { ...context, overlayStack: [...context.overlayStack, event.overlay] } : context
    ),
    closeOverlays: assign(({ context }) => ({ ...context, overlayStack: [] })),
    popOverlay: assign(({ context }) => ({ ...context, overlayStack: context.overlayStack.slice(0, -1) }))
  }
});

const overlayEvents = {
  OPEN_OVERLAY: { actions: "pushOverlay" },
  CLOSE_OVERLAY: { actions: "closeOverlays" },
  POP_OVERLAY: { actions: "popOverlay" }
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
    vn: { on: { ...playableTransitions, PAUSE: { target: "paused", actions: "rememberVnPause" } } },
    navi: { on: { ...playableTransitions, PAUSE: { target: "paused", actions: "rememberNaviPause" } } },
    trial: { on: { ...playableTransitions, PAUSE: { target: "paused", actions: "rememberTrialPause" } } },
    paused: {
      on: {
        RESUME: resumeTransitions,
        POP_OVERLAY: [
          { guard: "hasNestedPauseOverlay", actions: "popOverlay" },
          ...resumeTransitions
        ],
        CLOSE_OVERLAY: resumeTransitions,
        OPEN_OVERLAY: { actions: "pushOverlay" },
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
    overlayStack: context.overlayStack,
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
  const hasOverlay = flow.overlayStack.length > 0;
  const inputLock = hasOverlay ? "menu" : host.inputLock ?? vn.inputLock;
  const context = GameInteractionContextSchema.parse({
    mode: flow.mode,
    overlayStack: flow.overlayStack,
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
    canOpenPauseMenu: context.mode !== "paused" && inPlayableMode && context.inputLock !== "menu",
    canAuto: canAutomateStory,
    canSkip: canAutomateStory,
    canReturnTitle: inPlayableMode
  });
}
