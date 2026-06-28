import { useEffect, type ReactNode } from "react";
import { selectCurrentStoryLine } from "@v-ronpa/story-engine";
import {
  GameOverlayHost,
  RuntimeInputPromptSurface,
  RuntimeMovieOverlaySurface,
  RuntimeToastLayer,
  TitleSurface,
  VnCommandBar,
  VnDialogSurface,
  type VnDialogDisplaySettings
} from "@v-ronpa/ui-kit";
import type { useGameFlowActor } from "./useGameFlowActor";
import type { useOverlayPageAdapters } from "./useOverlayPageAdapters";
import type { useVerticalSliceRuntimeAdapter } from "./useVerticalSliceRuntimeAdapter";

type GameFlowAdapter = ReturnType<typeof useGameFlowActor>;
type OverlayPageAdapters = ReturnType<typeof useOverlayPageAdapters>;
type VerticalSliceRuntimeAdapter = ReturnType<typeof useVerticalSliceRuntimeAdapter>;

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
  flow: GameFlowAdapter;
  formatStorySpeaker?: (speaker: string) => string;
  overlayPages: OverlayPageAdapters;
  runtime: VerticalSliceRuntimeAdapter;
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
      if (flow.mode === "title") return;
      if (runtime.storyRuntime.active) return;
      event.preventDefault();
      if (flow.activeOverlay) flow.closeTopOverlay();
      else overlayPages.dispatchUiAction("open-pause-menu");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flow.activeOverlay, flow.closeTopOverlay, flow.mode, overlayPages, runtime.storyRuntime.active]);

  const currentLine =
    runtime.storyRuntime.active && flow.mode !== "title" && runtime.uiRuntime.state.visible.dialog
      ? selectCurrentStoryLine(runtime.storyRuntime.state)
      : undefined;
  const speaker = currentLine?.speaker && formatStorySpeaker ? formatStorySpeaker(currentLine.speaker) : currentLine?.speaker;
  const dialogText = runtime.dialogRevealRuntime.visibleText ?? currentLine?.text;

  return (
    <>
      {children}
      {currentLine ? (
        <VnDialogSurface
          {...(speaker ? { speaker } : {})}
          text={dialogText ?? currentLine.text}
          choices={runtime.storyRuntime.state.pendingChoices}
          {...(dialogDisplay ? { displaySettings: dialogDisplay } : {})}
          ended={runtime.storyRuntime.state.ended}
          onAdvance={runtime.advanceStory}
          onChoice={runtime.chooseStory}
          onCancel={() => runtime.closeStoryOverlay()}
        />
      ) : null}
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
