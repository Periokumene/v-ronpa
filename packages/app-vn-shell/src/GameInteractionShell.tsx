import { useEffect, type CSSProperties, type ReactNode } from "react";
import type { GameMode, GameOverlayKind, GamePauseSection, GameUiAction, NaviSubstate } from "@v-ronpa/contracts";
import type { VnRuntimeShellPort } from "@v-ronpa/app-vn-runtime";
import {
  GameOverlayHost,
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
  type GameCommandAvailability,
  type GameInteractionOverlayActions,
  type GameInteractionOverlayViewModelInputs,
  type GameFlowShellAdapter,
  type GameInteractionShellSurfaces,
  type GameInteractionShellViewModels,
  type RuntimeInputPromptActions,
  type RuntimeInputPromptViewModel,
  type RuntimeToastActions,
  type RuntimeToastLayerViewModel,
  type PauseSurfaceActions,
  type PauseSurfaceViewModel,
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
  type VnDialogAppearance,
  type VnDialogDisplaySettings,
  type VnDialogViewModel
} from "./GameInteractionViewModels";
import { VN_PAUSE_SECTIONS } from "./vnShellActions";
import { useWebGameDocumentPolicy } from "./webGameDocumentPolicy";

export type GameInteractionPage = GameOverlayKind | GamePauseSection;

export interface InteractionPageShellAdapter {
  createCommandAvailability?(): GameCommandAvailability;
  createPageViewModelInputs?(page: GameInteractionPage | undefined): GameInteractionOverlayViewModelInputs;
  createPageActions?(page: GameInteractionPage | undefined): GameInteractionOverlayActions;
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
  dialogAppearance,
  dialogDisplay,
  flow,
  formatStorySpeaker,
  host,
  overlayPages,
  runtime,
  surfaces
}: {
  children: ReactNode;
  dialogAppearance?: Partial<VnDialogAppearance>;
  dialogDisplay?: VnDialogDisplaySettings;
  flow: GameFlowShellAdapter;
  formatStorySpeaker?: (speaker: string) => string;
  host?: { naviSubstate?: NaviSubstate | undefined };
  overlayPages: InteractionPageShellAdapter;
  runtime: VnRuntimeShellPort;
  surfaces?: Partial<GameInteractionShellSurfaces>;
}) {
  useWebGameDocumentPolicy();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (flow.activeOverlay) {
        event.preventDefault();
        flow.closeOverlay();
        return;
      }
      if (flow.mode === "paused") {
        event.preventDefault();
        flow.resumeFromPause();
        return;
      }
      if (flow.mode === "title") return;
      if (runtime.uiRuntime.state.inputPrompt || runtime.uiRuntime.state.movieOverlay) return;

      event.preventDefault();
      overlayPages.dispatchUiAction("open-pause");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    flow.activeOverlay,
    flow.closeOverlay,
    flow.mode,
    flow.resumeFromPause,
    overlayPages,
    runtime.uiRuntime.state.inputPrompt,
    runtime.uiRuntime.state.movieOverlay
  ]);

  const resolvedSurfaces = resolveGameInteractionShellSurfaces(surfaces);
  const commandAvailability = overlayPages.createCommandAvailability?.();
  const activePage = flow.activeOverlay ?? flow.pauseSection;
  const overlayModelInputs = overlayPages.createPageViewModelInputs?.(activePage);
  const overlayActions = createGameInteractionOverlayActions({
    close: flow.activeOverlay ? flow.closeOverlay : flow.resumeFromPause,
    overlayActions: overlayPages.createPageActions?.(activePage)
  });
  const models = createGameInteractionShellViewModels({
    ...(commandAvailability ? { commandAvailability } : {}),
    ...(dialogAppearance ? { dialogAppearance } : {}),
    ...(dialogDisplay ? { dialogDisplay } : {}),
    flow,
    host,
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
    naviSubstate: host?.naviSubstate,
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
      {flow.pauseSection ? (
        <resolvedSurfaces.PauseSurface
          actions={{ close: flow.resumeFromPause, dispatch: overlayPages.dispatchUiAction }}
          model={{
            activeSection: flow.pauseSection,
            capabilities: flow.capabilities,
            navigationLocked: Boolean(models.saveLoad?.pendingLoadSlot)
          }}
        >
          {renderGameInteractionPauseSurface({
            actions: overlayActions,
            models,
            section: flow.pauseSection,
            surfaces: resolvedSurfaces
          })}
        </resolvedSurfaces.PauseSurface>
      ) : null}
    </>
  );
}

export function createGameInteractionOverlayActions({
  close,
  overlayActions
}: {
  close: () => void;
  overlayActions?: GameInteractionOverlayActions | undefined;
}): GameInteractionOverlayActions {
  return {
    backlog: { close, ...overlayActions?.backlog },
    saveLoad: overlayActions?.saveLoad ? { ...overlayActions.saveLoad, close } : undefined,
    settings: overlayActions?.settings ? { ...overlayActions.settings, close } : undefined
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
  if (overlay === "title-load") {
    if (!models.saveLoad || !actions.saveLoad) return null;
    return <surfaces.SaveLoadOverlay model={models.saveLoad} actions={actions.saveLoad} />;
  }
  if (overlay === "title-settings") {
    if (!models.settings || !actions.settings) return null;
    return <surfaces.SettingsOverlay model={models.settings} actions={actions.settings} />;
  }
  return null;
}

export function renderGameInteractionPauseSurface({
  actions,
  models,
  section,
  surfaces
}: {
  actions: GameInteractionOverlayActions;
  models: GameInteractionShellViewModels;
  section: GamePauseSection | undefined;
  surfaces: GameInteractionShellSurfaces;
}): ReactNode {
  if (section === "backlog" && models.backlog && actions.backlog) {
    return <surfaces.BacklogOverlay model={models.backlog} actions={actions.backlog} />;
  }
  if ((section === "save" || section === "load") && models.saveLoad && actions.saveLoad) {
    return <surfaces.SaveLoadOverlay model={models.saveLoad} actions={actions.saveLoad} />;
  }
  if (section === "settings" && models.settings && actions.settings) {
    return <surfaces.SettingsOverlay model={models.settings} actions={actions.settings} />;
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
  PauseSurface: DefaultPauseSurface,
  BacklogOverlay: DefaultBacklogOverlaySurface,
  SaveLoadOverlay: DefaultSaveLoadOverlaySurface,
  SettingsOverlay: DefaultSettingsOverlaySurface
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
      appearance={model.appearance}
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

function DefaultPauseSurface({
  actions,
  children,
  model
}: SurfaceSlotProps<PauseSurfaceViewModel, PauseSurfaceActions> & { children?: ReactNode }) {
  return (
    <section
      aria-label="Pause"
      aria-modal="true"
      data-pause-section={model.activeSection}
      data-testid="pause-surface"
      role="dialog"
      style={pauseSurfaceStyle}
    >
      <div style={pauseNavigationStyle}>
        <nav aria-label="Pause tabs" style={pauseTabsStyle}>
          {VN_PAUSE_SECTIONS.map((section) => {
            const enabled = section.id === "backlog"
              ? model.capabilities.canOpenBacklog
              : section.id === "save"
                ? model.capabilities.canSave
                : section.id === "load"
                  ? model.capabilities.canLoad
                  : model.capabilities.canOpenSettings;
            return (
              <button
                aria-current={model.activeSection === section.id ? "page" : undefined}
                data-testid={section.testId}
                disabled={!enabled || model.navigationLocked}
                key={section.id}
                onClick={() => actions.dispatch(section.action)}
                type="button"
              >
                {section.label}
              </button>
            );
          })}
        </nav>
        <button aria-label="Close pause" data-testid="pause-surface-close" disabled={model.navigationLocked} onClick={actions.close} type="button">x</button>
      </div>
      {children}
    </section>
  );
}

function DefaultBacklogOverlaySurface({ actions, model }: SurfaceSlotProps<BacklogOverlayViewModel, BacklogOverlayActions>) {
  return <ReadOnlyBacklogOverlay embedded={model.placement === "pause"} entries={model.entries} onClose={actions.close} />;
}

function DefaultSaveLoadOverlaySurface({ actions, model }: SurfaceSlotProps<SaveLoadOverlayViewModel, SaveLoadOverlayActions>) {
  return (
    <SaveLoadOverlay
      canSave={model.canSave}
      embedded={model.placement === "pause"}
      mode={model.mode}
      onCancelLoad={actions.cancelLoad}
      onClose={actions.close}
      onConfirmLoad={actions.confirmLoad}
      onRequestLoad={actions.requestLoad}
      onSave={actions.save}
      {...(actions.loadPreviews ? { onLoadPreviews: actions.loadPreviews } : {})}
      pendingLoadSlot={model.pendingLoadSlot}
      slotIds={model.slotIds}
      slotPreviewsById={model.slotPreviewsById}
      slots={model.slots}
      busy={model.busy}
      lastError={model.lastError}
    />
  );
}

function DefaultSettingsOverlaySurface({ actions, model }: SurfaceSlotProps<SettingsOverlayViewModel, SettingsOverlayActions>) {
  return (
    <SettingsOverlay
      embedded={model.placement === "pause"}
      onClose={actions.close}
      onPatchSettings={actions.patchSettings}
      onResetSettings={actions.resetSettings}
      settings={model.settings}
    />
  );
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

const pauseSurfaceStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 32,
  display: "grid",
  placeItems: "center",
  background: "rgba(2, 6, 10, 0.5)"
};

const pauseNavigationStyle: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  top: 18,
  display: "flex",
  gap: 12,
  alignItems: "center"
};

const pauseTabsStyle: CSSProperties = { display: "flex", gap: 8 };
