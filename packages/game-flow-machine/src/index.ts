import { assign, setup } from "xstate";
import type {
  GameInteractionContext,
  GameMode,
  GameOverlayKind,
  InteractionCapabilitySnapshot
} from "@v-ronpa/contracts";
import {
  GameInteractionContextSchema,
  InteractionCapabilitySnapshotSchema
} from "@v-ronpa/contracts";

export type GameFlowEvent =
  | { type: "BOOT" }
  | { type: "START_NEW_GAME" }
  | { type: "ENTER_NAVI" }
  | { type: "ENTER_TRIAL" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RETURN_TITLE" }
  | { type: "SAVE" }
  | { type: "SAVED" }
  | { type: "OPEN_OVERLAY"; overlay: GameOverlayKind }
  | { type: "CLOSE_OVERLAY" }
  | { type: "POP_OVERLAY" }
  | { type: "UPDATE_CONTEXT"; context: Partial<GameInteractionContext> };

export interface GameFlowContext {
  interaction: GameInteractionContext;
  capabilities: InteractionCapabilitySnapshot;
}

const initialInteractionContext = GameInteractionContextSchema.parse({
  mode: "loading",
  overlayStack: [],
  inputLock: "none"
});

const initialGameFlowContext: GameFlowContext = {
  interaction: initialInteractionContext,
  capabilities: calculateInteractionCapabilities(initialInteractionContext)
};

const rootModeTransitions = {
  ENTER_NAVI: "navi",
  ENTER_TRIAL: "trial",
  PAUSE: "paused",
  SAVE: "saving",
  RETURN_TITLE: "title"
} as const;

function withMode(context: GameFlowContext, mode: GameMode, overlayStack: GameOverlayKind[] = []): GameFlowContext {
  return withInteraction(context, { mode, overlayStack });
}

function withInteraction(context: GameFlowContext, patch: Partial<GameInteractionContext>): GameFlowContext {
  const interaction = GameInteractionContextSchema.parse({
    ...context.interaction,
    ...patch
  });
  return {
    interaction,
    capabilities: calculateInteractionCapabilities(interaction)
  };
}

function withOverlay(context: GameFlowContext, overlay: GameOverlayKind): GameFlowContext {
  return withInteraction(context, {
    overlayStack: [...context.interaction.overlayStack, overlay],
    inputLock: "menu"
  });
}

function withoutTopOverlay(context: GameFlowContext): GameFlowContext {
  const nextStack = context.interaction.overlayStack.slice(0, -1);
  return withInteraction(context, {
    overlayStack: nextStack,
    inputLock: nextStack.length > 0 ? "menu" : context.interaction.hasActiveStory ? "dialog" : "none"
  });
}

const overlayEvents = {
  OPEN_OVERLAY: {
    actions: "pushOverlay"
  },
  CLOSE_OVERLAY: {
    actions: "closeOverlays"
  },
  POP_OVERLAY: {
    actions: "popOverlay"
  },
  UPDATE_CONTEXT: {
    actions: "updateInteractionContext"
  }
} as const;

const modeEvents = {
  ...rootModeTransitions,
  RESUME: "navi",
  SAVED: "navi",
  ...overlayEvents
} as const;

const flowMachineSetup = setup({
  types: {} as {
    events: GameFlowEvent;
    context: GameFlowContext;
  },
  actions: {
    setLoadingMode: assign(({ context }) => withMode(context, "loading")),
    setTitleMode: assign(({ context }) => withMode(context, "title")),
    setNaviMode: assign(({ context }) => withMode(context, "navi")),
    setTrialMode: assign(({ context }) => withMode(context, "trial")),
    setPausedMode: assign(({ context }) => withMode(context, "paused", ["pause-menu"])),
    setSavingMode: assign(({ context }) => withMode(context, "saving")),
    pushOverlay: assign(({ context, event }) => {
      if (event.type !== "OPEN_OVERLAY") return context;
      return withOverlay(context, event.overlay);
    }),
    closeOverlays: assign(({ context }) => withInteraction(context, { overlayStack: [], inputLock: "none" })),
    popOverlay: assign(({ context }) => withoutTopOverlay(context)),
    updateInteractionContext: assign(({ context, event }) => {
      if (event.type !== "UPDATE_CONTEXT") return context;
      return withInteraction(context, event.context);
    })
  }
});

export const gameFlowMachine = flowMachineSetup.createMachine({
  id: "v-ronpa-flow",
  context: initialGameFlowContext,
  initial: "loading",
  states: {
    loading: {
      entry: "setLoadingMode",
      on: { BOOT: "title" }
    },
    title: {
      entry: "setTitleMode",
      on: {
        START_NEW_GAME: "navi",
        ENTER_NAVI: "navi",
        ENTER_TRIAL: "trial",
        ...overlayEvents
      }
    },
    navi: {
      entry: "setNaviMode",
      on: modeEvents
    },
    trial: {
      entry: "setTrialMode",
      on: modeEvents
    },
    paused: {
      entry: "setPausedMode",
      on: { RESUME: "navi", ENTER_NAVI: "navi", ENTER_TRIAL: "trial", ...overlayEvents }
    },
    saving: {
      entry: "setSavingMode",
      on: { SAVED: "navi", ENTER_NAVI: "navi", ENTER_TRIAL: "trial", ...overlayEvents }
    }
  }
});

export function modeFromSnapshotValue(value: unknown): GameMode {
  return String(value) as GameMode;
}

export function calculateInteractionCapabilities(context: GameInteractionContext): InteractionCapabilitySnapshot {
  const mode = context.mode;
  const inTitle = mode === "title";
  const inPlayableMode = mode === "navi" || mode === "trial";
  const inVnStory = context.hasActiveStory && context.inputLock === "dialog";
  const canSave = inPlayableMode && context.isAtStableStop && !(context.hasActiveStory && context.storyEnded);
  const canLoad = inTitle || inPlayableMode || mode === "paused";

  return InteractionCapabilitySnapshotSchema.parse({
    canStartNewGame: inTitle,
    canSave,
    canLoad,
    canOpenSettings: true,
    canOpenBacklog: inVnStory && (context.naviSubstate === "vn2d-overlay" || context.trialPresentation === "vn2d"),
    canOpenPauseMenu: inPlayableMode && context.inputLock !== "menu",
    canAuto: inVnStory && !context.storyEnded,
    canSkip: inVnStory && !context.storyEnded,
    canReturnTitle: inPlayableMode || mode === "paused"
  });
}
