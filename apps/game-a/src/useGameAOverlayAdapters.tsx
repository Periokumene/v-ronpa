import type { ReactNode } from "react";
import {
  createVnSaveLoadOverlayModel,
  overlayKindForVnShellAction,
  shouldStopVnShellAutomationForAction,
  type GameInteractionOverlayViewModelInputs,
  type GameInteractionShellSurfaces,
  type GameInteractionShellViewModels,
  type useGameSettingsAdapter
} from "@v-ronpa/app-vn-shell";
import type { GameOverlayKind, GameUiAction } from "@v-ronpa/contracts";
import type { useGameAFlowActor } from "./useGameAFlowActor";
import type { useGameASaveAdapter } from "./useGameASaveAdapter";
import type { useGameAVnRuntime } from "./useGameAVnRuntime";

type GameAFlowAdapter = ReturnType<typeof useGameAFlowActor>;
type GameASettingsAdapter = ReturnType<typeof useGameSettingsAdapter>;
type GameASaveAdapter = ReturnType<typeof useGameASaveAdapter>;
type GameAVnRuntime = ReturnType<typeof useGameAVnRuntime>;

export function useGameAOverlayAdapters({
  flow,
  runtime,
  save,
  settings
}: {
  flow: GameAFlowAdapter;
  runtime: GameAVnRuntime;
  save: GameASaveAdapter;
  settings: GameASettingsAdapter;
}) {
  function dispatchUiAction(action: GameUiAction) {
    if (action === "toggle-auto") {
      runtime.toggleStoryAuto();
      return;
    }
    if (action === "toggle-skip") {
      runtime.toggleStorySkip();
      return;
    }
    if (action === "new-game") {
      runtime.startNewGame();
      flow.send({ type: "ENTER_VN" });
      return;
    }
    if (action === "return-title") {
      flow.send({ type: "RETURN_TITLE" });
      return;
    }
    const overlay = overlayKindForVnShellAction(action, flow.mode);
    if (overlay) {
      if (shouldStopVnShellAutomationForAction(action, flow.mode)) runtime.stopStoryAutomation("overlay");
      flow.openOverlay(overlay);
    }
  }

  return {
    dispatchUiAction,
    createOverlayViewModelInputs(overlay: GameOverlayKind | undefined): GameInteractionOverlayViewModelInputs {
      if (!overlay) return {};
      if (overlay === "vn-save" || overlay === "vn-load" || overlay === "title-load") {
        return {
          saveLoad: createVnSaveLoadOverlayModel({
            canSave: flow.capabilities.canSave,
            overlay,
            pendingLoadSlot: save.pendingLoadSlot,
            slotIds: save.slotIds,
            slots: save.slots
          })
        };
      }
      if (overlay === "title-settings" || overlay === "vn-settings") {
        return { settings: settings.settings };
      }
      return {};
    },
    renderOverlay(
      overlay: GameOverlayKind | undefined,
      surfaces: GameInteractionShellSurfaces,
      models: GameInteractionShellViewModels
    ): ReactNode {
      if (!overlay) return null;
      if (overlay === "vn-backlog") {
        if (!models.backlog) return null;
        return <surfaces.BacklogOverlay model={models.backlog} actions={{ close: flow.closeTopOverlay }} />;
      }
      if (overlay === "vn-save" || overlay === "vn-load" || overlay === "title-load") {
        if (!models.saveLoad) return null;
        return (
          <surfaces.SaveLoadOverlay
            model={models.saveLoad}
            actions={{
              cancelLoad: save.cancelLoadSlot,
              close: flow.closeTopOverlay,
              confirmLoad: () => {
                save.confirmLoadSlot();
                flow.send({ type: "ENTER_VN" });
                flow.closeAllOverlays();
              },
              requestLoad: save.requestLoadSlot,
              save: save.saveSlot
            }}
          />
        );
      }
      if (overlay === "title-settings" || overlay === "vn-settings") {
        if (!models.settings) return null;
        return (
          <surfaces.SettingsOverlay
            model={models.settings}
            actions={{
              close: flow.closeTopOverlay,
              patchSettings: settings.patchSettings,
              resetSettings: settings.resetSettings
            }}
          />
        );
      }
      if (overlay === "pause-menu") {
        if (!models.pauseMenu) return null;
        return (
          <surfaces.PauseMenuOverlay
            model={models.pauseMenu}
            actions={{ close: flow.closeTopOverlay, dispatch: dispatchUiAction }}
          />
        );
      }
      return null;
    }
  };
}
