import { useEffect, type CSSProperties, type ReactNode } from "react";
import type {
  GameInteractionContext,
  GameMode,
  GameOverlayKind,
  GameUiAction,
  InteractionCapabilitySnapshot,
  NaviSubstate,
  RichTextDocument
} from "@v-ronpa/contracts";
import type { UiRuntimeState } from "@v-ronpa/app-vn-dispatch";
import { selectCurrentStoryLine } from "@v-ronpa/story-engine";
import type { StoryRuntimeState } from "@v-ronpa/story-engine";
import type { StoryPlayAdvanceSource } from "@v-ronpa/story-play";
import {
  GameOverlayHost,
  RuntimeInputPromptSurface,
  RuntimeMovieOverlaySurface,
  RuntimeToastLayer,
  TitleSurface,
  VnChoiceOverlay,
  VnCommandBar,
  VnDialogSurface,
  type VnDialogDisplaySettings
} from "@v-ronpa/ui-kit";

export interface GameFlowShellAdapter {
  activeOverlay: GameOverlayKind | undefined;
  capabilities: InteractionCapabilitySnapshot;
  mode: GameMode;
  closeTopOverlay(): void;
  send(event: { type: string; [key: string]: unknown }): void;
}

export interface OverlayPageShellAdapter {
  dispatchUiAction(action: GameUiAction): void;
  renderOverlay(overlay: GameOverlayKind | undefined): ReactNode;
}

export interface VnShellRuntimeAdapter {
  advanceStory(source?: StoryPlayAdvanceSource): void;
  attachMovieElement(element: HTMLVideoElement | null): void;
  chooseStory(index: number): void;
  completeMoviePlayback(): void;
  dialogRevealRuntime: {
    visibleRichText?: RichTextDocument | undefined;
    visibleText?: string | undefined;
  };
  dismissRuntimeToast(toastId: string): void;
  interactionContext: GameInteractionContext;
  navi?: {
    substate?: NaviSubstate | undefined;
  };
  storyPlayActiveActions: Partial<Record<GameUiAction, boolean>>;
  storyRuntime: {
    active: boolean;
    state: StoryRuntimeState;
  };
  submitStoryInput(value: string | number | boolean): void;
  uiRuntime: {
    state: UiRuntimeState;
  };
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
  runtime
}: {
  children: ReactNode;
  dialogDisplay?: VnDialogDisplaySettings;
  flow: GameFlowShellAdapter;
  formatStorySpeaker?: (speaker: string) => string;
  overlayPages: OverlayPageShellAdapter;
  runtime: VnShellRuntimeAdapter;
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

  const currentLine =
    runtime.storyRuntime.active && flow.mode !== "title" && runtime.uiRuntime.state.visible.dialog
      ? selectCurrentStoryLine(runtime.storyRuntime.state)
      : undefined;
  const speaker = currentLine?.speaker && formatStorySpeaker ? formatStorySpeaker(currentLine.speaker) : currentLine?.speaker;
  const dialogText = runtime.dialogRevealRuntime.visibleText ?? currentLine?.text;
  const dialogRichText = runtime.dialogRevealRuntime.visibleRichText ?? currentLine?.richText;
  const storyHasChoices = runtime.storyRuntime.state.pendingChoices.length > 0;
  const dialogState = runtime.storyRuntime.state.ended ? "ended" : storyHasChoices ? "choices" : "line";
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
  const showChoices =
    runtime.storyRuntime.active &&
    (flow.mode === "vn" || (flow.mode === "navi" && runtime.navi?.substate === "vn2d-overlay")) &&
    !runtime.storyRuntime.state.ended &&
    storyHasChoices;

  return (
    <>
      {children}
      {showAdvanceHitPlane ? <VnAdvanceHitPlane onAdvance={() => runtime.advanceStory("manual")} /> : null}
      {currentLine ? (
        <VnDialogSurface
          {...(speaker ? { speaker } : {})}
          text={dialogText ?? currentLine.text}
          {...(dialogRichText ? { richText: dialogRichText } : {})}
          {...(dialogDisplay ? { displaySettings: dialogDisplay } : {})}
          state={dialogState}
        />
      ) : null}
      {showChoices ? <VnChoiceOverlay choices={runtime.storyRuntime.state.pendingChoices} onChoice={runtime.chooseStory} /> : null}
      {runtime.storyRuntime.active && flow.mode !== "title" && runtime.uiRuntime.state.visible.commandBar ? (
        <VnCommandBar
          activeActions={runtime.storyPlayActiveActions}
          capabilities={flow.capabilities}
          onAction={overlayPages.dispatchUiAction}
        />
      ) : null}
      {runtime.uiRuntime.state.inputPrompt ? (
        <RuntimeInputPromptSurface {...runtime.uiRuntime.state.inputPrompt} onSubmit={runtime.submitStoryInput} />
      ) : null}
      {runtime.uiRuntime.state.movieOverlay ? (
        <RuntimeMovieOverlaySurface
          {...runtime.uiRuntime.state.movieOverlay}
          onEnded={runtime.completeMoviePlayback}
          onSkip={runtime.completeMoviePlayback}
          onVideoElement={runtime.attachMovieElement}
        />
      ) : null}
      <RuntimeToastLayer
        onDismiss={runtime.dismissRuntimeToast}
        visible={runtime.uiRuntime.state.visible.toastLayer}
        toasts={runtime.uiRuntime.state.toasts}
      />
      {flow.mode === "title" ? <TitleSurface capabilities={flow.capabilities} onAction={overlayPages.dispatchUiAction} /> : null}
      <GameOverlayHost activeOverlay={flow.activeOverlay}>{overlayPages.renderOverlay(flow.activeOverlay)}</GameOverlayHost>
    </>
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
