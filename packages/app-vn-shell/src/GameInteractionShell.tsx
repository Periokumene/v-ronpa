import { useEffect, type CSSProperties, type ReactNode } from "react";
import type { GameMode, GameOverlayKind, GameUiAction, NaviSubstate } from "@v-ronpa/contracts";
import {
  GameOverlayHost,
  PauseMenuOverlay,
  ReadOnlyBacklogOverlay,
  RuntimeInputPromptSurface,
  RuntimeMovieOverlaySurface,
  RuntimeToastLayer,
  SaveLoadOverlay,
  SettingsOverlay,
  TitleSurface,
  VnChoiceOverlay,
  VnCommandBar,
  VnDialogSurface
} from "@v-ronpa/ui-kit";
import {
  createGameInteractionShellViewModels,
  type BacklogOverlayActions,
  type BacklogOverlayViewModel,
  type GameInteractionOverlayActions,
  type GameInteractionOverlayViewModelInputs,
  type GameFlowShellAdapter,
  type GameInteractionShellSurfaces,
  type GameInteractionShellViewModels,
  type PauseMenuOverlayActions,
  type PauseMenuOverlayViewModel,
  type RuntimeInputPromptActions,
  type RuntimeInputPromptViewModel,
  type RuntimeToastActions,
  type RuntimeToastLayerViewModel,
  type SaveLoadOverlayActions,
  type SaveLoadOverlayViewModel,
  type SettingsOverlayActions,
  type SettingsOverlayViewModel,
  type SurfaceSlotProps,
  type TitleActions,
  type TitleViewModel,
  type VnChoicesActions,
  type VnChoicesViewModel,
  type VnCommandBarActions,
  type VnCommandBarViewModel,
  type VnDialogDisplaySettings,
  type VnDialogViewModel,
  type VnShellRuntimeAdapter
} from "./GameInteractionViewModels";

export interface OverlayPageShellAdapter {
  createOverlayViewModelInputs?(overlay: GameOverlayKind | undefined): GameInteractionOverlayViewModelInputs;
  createOverlayActions?(overlay: GameOverlayKind | undefined): GameInteractionOverlayActions;
  dispatchUiAction(action: GameUiAction): void;
}

const VN_SHELL_LAYER_Z_INDEX = {
  advanceHitPlane: 6
} as const;

export interface VnAdvanceHitPlaneInput {
  flowMode: GameMode;
  hasActiveOverlay: boolean;
  hasInputPrompt: boolean;
  hasMovieOverlay: boolean;
  naviSubstate?: NaviSubstate | undefined;
  storyActive: boolean;
  storyEnded: boolean;
  storyHasChoices: boolean;
}

export function shouldRenderVnAdvanceHitPlane({
  flowMode,
  hasActiveOverlay,
  hasInputPrompt,
  hasMovieOverlay,
  naviSubstate,
  storyActive,
  storyEnded,
  storyHasChoices
}: VnAdvanceHitPlaneInput): boolean {
  return (
    (flowMode === "vn" || (flowMode === "navi" && naviSubstate === "vn2d-overlay")) &&
    storyActive &&
    !storyEnded &&
    !storyHasChoices &&
    !hasActiveOverlay &&
    !hasInputPrompt &&
    !hasMovieOverlay
  );
}

export function GameInteractionShell({
  children,
  dialogDisplay,
  flow,
  formatStorySpeaker,
  overlayPages,
  runtime,
  surfaces
}: {
  children: ReactNode;
  dialogDisplay?: VnDialogDisplaySettings;
  flow: GameFlowShellAdapter;
  formatStorySpeaker?: (speaker: string) => string;
  overlayPages: OverlayPageShellAdapter;
  runtime: VnShellRuntimeAdapter;
  surfaces?: Partial<GameInteractionShellSurfaces>;
}) {
  useEffect(() => {
    const { overlayStack: _overlayStack, ...runtimeContext } = runtime.interactionContext;
    void _overlayStack;
    flow.send({
      type: "UPDATE_CONTEXT",
      context: {
        ...runtimeContext,
        mode: flow.mode,
        inputLock: flow.activeOverlay ? "menu" : runtimeContext.inputLock
      }
    });
  }, [flow.activeOverlay, flow.mode, flow.send, runtime.interactionContext]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (flow.activeOverlay) {
        event.preventDefault();
        flow.closeTopOverlay();
        return;
      }
      if (flow.mode === "title") return;
      if (runtime.uiRuntime.state.inputPrompt || runtime.uiRuntime.state.movieOverlay) return;

      event.preventDefault();
      overlayPages.dispatchUiAction("open-pause-menu");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    flow.activeOverlay,
    flow.closeTopOverlay,
    flow.mode,
    overlayPages,
    runtime.uiRuntime.state.inputPrompt,
    runtime.uiRuntime.state.movieOverlay
  ]);

  const resolvedSurfaces = resolveGameInteractionShellSurfaces(surfaces);
  const overlayModelInputs = overlayPages.createOverlayViewModelInputs?.(flow.activeOverlay);
  const overlayActions = createGameInteractionOverlayActions({
    closeTopOverlay: flow.closeTopOverlay,
    dispatchUiAction: overlayPages.dispatchUiAction,
    overlayActions: overlayPages.createOverlayActions?.(flow.activeOverlay)
  });
  const models = createGameInteractionShellViewModels({
    ...(dialogDisplay ? { dialogDisplay } : {}),
    flow,
    ...(formatStorySpeaker ? { formatStorySpeaker } : {}),
    ...(overlayModelInputs ? { overlayModels: overlayModelInputs } : {}),
    runtime
  });
  const storyHasChoices = runtime.storyRuntime.state.pendingChoices.length > 0;
  const showAdvanceHitPlane = shouldRenderVnAdvanceHitPlane({
    flowMode: flow.mode,
    hasActiveOverlay: Boolean(flow.activeOverlay),
    hasInputPrompt: Boolean(runtime.uiRuntime.state.inputPrompt),
    hasMovieOverlay: Boolean(runtime.uiRuntime.state.movieOverlay),
    naviSubstate: runtime.navi?.substate,
    storyActive: runtime.storyRuntime.active,
    storyEnded: runtime.storyRuntime.state.ended,
    storyHasChoices
  });

  return (
    <>
      {children}
      {showAdvanceHitPlane ? <VnAdvanceHitPlane onAdvance={() => runtime.advanceStory("manual")} /> : null}
      {models.dialog ? <resolvedSurfaces.Dialog model={models.dialog} actions={{}} /> : null}
      {models.choices ? (
        <resolvedSurfaces.Choices
          model={models.choices}
          actions={{ choose: (index) => runtime.chooseStory(index) }}
        />
      ) : null}
      {models.commandBar ? (
        <resolvedSurfaces.CommandBar
          model={models.commandBar}
          actions={{ dispatch: overlayPages.dispatchUiAction }}
        />
      ) : null}
      {models.inputPrompt ? (
        <resolvedSurfaces.InputPrompt model={models.inputPrompt} actions={{ submit: runtime.submitStoryInput }} />
      ) : null}
      {runtime.uiRuntime.state.movieOverlay ? (
        <RuntimeMovieOverlaySurface
          {...runtime.uiRuntime.state.movieOverlay}
          onEnded={runtime.completeMoviePlayback}
          onSkip={runtime.completeMoviePlayback}
          onVideoElement={runtime.attachMovieElement}
        />
      ) : null}
      {models.toastLayer ? (
        <resolvedSurfaces.ToastLayer
          model={models.toastLayer}
          actions={{ dismiss: runtime.dismissRuntimeToast }}
        />
      ) : null}
      {models.title ? (
        <resolvedSurfaces.Title model={models.title} actions={{ dispatch: overlayPages.dispatchUiAction }} />
      ) : null}
      <GameOverlayHost activeOverlay={flow.activeOverlay}>
        {renderGameInteractionOverlaySurface({
          actions: overlayActions,
          models,
          overlay: flow.activeOverlay,
          surfaces: resolvedSurfaces
        })}
      </GameOverlayHost>
    </>
  );
}

export function createGameInteractionOverlayActions({
  closeTopOverlay,
  dispatchUiAction,
  overlayActions
}: {
  closeTopOverlay: () => void;
  dispatchUiAction: (action: GameUiAction) => void;
  overlayActions?: GameInteractionOverlayActions | undefined;
}): GameInteractionOverlayActions {
  return {
    backlog: { close: closeTopOverlay, ...overlayActions?.backlog },
    saveLoad: overlayActions?.saveLoad,
    settings: overlayActions?.settings,
    pauseMenu: { close: closeTopOverlay, dispatch: dispatchUiAction, ...overlayActions?.pauseMenu }
  };
}

export function renderGameInteractionOverlaySurface({
  actions,
  models,
  overlay,
  surfaces
}: {
  actions: GameInteractionOverlayActions;
  models: GameInteractionShellViewModels;
  overlay: GameOverlayKind | undefined;
  surfaces: GameInteractionShellSurfaces;
}): ReactNode {
  if (!overlay) return null;
  if (overlay === "vn-backlog") {
    if (!models.backlog || !actions.backlog) return null;
    return <surfaces.BacklogOverlay model={models.backlog} actions={actions.backlog} />;
  }
  if (overlay === "vn-save" || overlay === "vn-load" || overlay === "title-load") {
    if (!models.saveLoad || !actions.saveLoad) return null;
    return <surfaces.SaveLoadOverlay model={models.saveLoad} actions={actions.saveLoad} />;
  }
  if (overlay === "title-settings" || overlay === "vn-settings") {
    if (!models.settings || !actions.settings) return null;
    return <surfaces.SettingsOverlay model={models.settings} actions={actions.settings} />;
  }
  if (overlay === "pause-menu") {
    if (!models.pauseMenu || !actions.pauseMenu) return null;
    return <surfaces.PauseMenuOverlay model={models.pauseMenu} actions={actions.pauseMenu} />;
  }
  return null;
}

export const defaultGameInteractionShellSurfaces: GameInteractionShellSurfaces = {
  Dialog: DefaultDialogSurface,
  Choices: DefaultChoicesSurface,
  CommandBar: DefaultCommandBarSurface,
  Title: DefaultTitleSurface,
  ToastLayer: DefaultToastLayerSurface,
  InputPrompt: DefaultInputPromptSurface,
  BacklogOverlay: DefaultBacklogOverlaySurface,
  SaveLoadOverlay: DefaultSaveLoadOverlaySurface,
  SettingsOverlay: DefaultSettingsOverlaySurface,
  PauseMenuOverlay: DefaultPauseMenuOverlaySurface
};

export function resolveGameInteractionShellSurfaces(
  surfaces: Partial<GameInteractionShellSurfaces> | undefined
): GameInteractionShellSurfaces {
  return { ...defaultGameInteractionShellSurfaces, ...surfaces };
}

function DefaultDialogSurface({ model }: SurfaceSlotProps<VnDialogViewModel>) {
  return (
    <VnDialogSurface
      {...(model.speakerLabel ? { speaker: model.speakerLabel } : {})}
      text={model.text}
      {...(model.richText ? { richText: model.richText } : {})}
      {...(model.display ? { displaySettings: model.display } : {})}
      presentation={model.presentation}
      state={model.state}
    />
  );
}

function DefaultChoicesSurface({ actions, model }: SurfaceSlotProps<VnChoicesViewModel, VnChoicesActions>) {
  return <VnChoiceOverlay choices={model.choices} onChoice={actions.choose} />;
}

function DefaultCommandBarSurface({ actions, model }: SurfaceSlotProps<VnCommandBarViewModel, VnCommandBarActions>) {
  return <VnCommandBar commands={model.commands} onAction={actions.dispatch} presentation={model.presentation} />;
}

function DefaultTitleSurface({ actions, model }: SurfaceSlotProps<TitleViewModel, TitleActions>) {
  return <TitleSurface capabilities={model.capabilities} onAction={actions.dispatch} title={model.title} />;
}

function DefaultToastLayerSurface({ actions, model }: SurfaceSlotProps<RuntimeToastLayerViewModel, RuntimeToastActions>) {
  return <RuntimeToastLayer onDismiss={actions.dismiss} presentation={model.presentation} visible={model.visible} toasts={model.toasts} />;
}

function DefaultInputPromptSurface({ actions, model }: SurfaceSlotProps<RuntimeInputPromptViewModel, RuntimeInputPromptActions>) {
  return <RuntimeInputPromptSurface {...model.prompt} onSubmit={actions.submit} />;
}

function DefaultBacklogOverlaySurface({ actions, model }: SurfaceSlotProps<BacklogOverlayViewModel, BacklogOverlayActions>) {
  return <ReadOnlyBacklogOverlay entries={model.entries} onClose={actions.close} />;
}

function DefaultSaveLoadOverlaySurface({ actions, model }: SurfaceSlotProps<SaveLoadOverlayViewModel, SaveLoadOverlayActions>) {
  return (
    <SaveLoadOverlay
      canSave={model.canSave}
      mode={model.mode}
      onCancelLoad={actions.cancelLoad}
      onClose={actions.close}
      onConfirmLoad={actions.confirmLoad}
      onRequestLoad={actions.requestLoad}
      onSave={actions.save}
      pendingLoadSlot={model.pendingLoadSlot}
      slotIds={model.slotIds}
      slots={model.slots}
    />
  );
}

function DefaultSettingsOverlaySurface({ actions, model }: SurfaceSlotProps<SettingsOverlayViewModel, SettingsOverlayActions>) {
  return (
    <SettingsOverlay
      onClose={actions.close}
      onPatchSettings={actions.patchSettings}
      onResetSettings={actions.resetSettings}
      settings={model.settings}
    />
  );
}

function DefaultPauseMenuOverlaySurface({ actions, model }: SurfaceSlotProps<PauseMenuOverlayViewModel, PauseMenuOverlayActions>) {
  return <PauseMenuOverlay capabilities={model.capabilities} onAction={actions.dispatch} onClose={actions.close} />;
}

function VnAdvanceHitPlane({ onAdvance }: { onAdvance: () => void }) {
  return (
    <div
      aria-hidden="true"
      data-testid="vn-advance-hit-plane"
      onClick={() => onAdvance()}
      style={advanceHitPlaneStyle}
    />
  );
}

const advanceHitPlaneStyle: CSSProperties = {
  position: "absolute",
  zIndex: VN_SHELL_LAYER_Z_INDEX.advanceHitPlane,
  inset: 0,
  cursor: "default"
};
