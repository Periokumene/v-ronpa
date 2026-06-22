import { useEffect, type ReactNode } from "react";
import { GameOverlayHost, TitleSurface, VnCommandBar } from "@v-ronpa/ui-kit";
import type { useGameFlowActor } from "./useGameFlowActor";
import type { useOverlayPageAdapters } from "./useOverlayPageAdapters";
import type { useVerticalSliceRuntimeAdapter } from "./useVerticalSliceRuntimeAdapter";

type GameFlowAdapter = ReturnType<typeof useGameFlowActor>;
type OverlayPageAdapters = ReturnType<typeof useOverlayPageAdapters>;
type VerticalSliceRuntimeAdapter = ReturnType<typeof useVerticalSliceRuntimeAdapter>;

export function GameInteractionShell({
  children,
  flow,
  overlayPages,
  runtime
}: {
  children: ReactNode;
  flow: GameFlowAdapter;
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

  return (
    <>
      {children}
      {runtime.storyRuntime.active && flow.mode !== "title" ? (
        <VnCommandBar
          activeActions={runtime.storyPlayActiveActions}
          capabilities={flow.capabilities}
          onAction={overlayPages.dispatchUiAction}
        />
      ) : null}
      {flow.mode === "title" ? <TitleSurface capabilities={flow.capabilities} onAction={overlayPages.dispatchUiAction} /> : null}
      <GameOverlayHost activeOverlay={flow.activeOverlay}>{overlayPages.renderOverlay(flow.activeOverlay)}</GameOverlayHost>
    </>
  );
}
