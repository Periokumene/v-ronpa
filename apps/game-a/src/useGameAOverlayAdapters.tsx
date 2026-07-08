import {
  createVnSaveLoadOverlayModel,
  overlayKindForVnShellAction,
  shouldStopVnShellAutomationForAction,
  type GameInteractionOverlayActions,
  type GameInteractionOverlayViewModelInputs,
  type useGameSettingsAdapter
} from "@v-ronpa/app-vn-shell";
import type { GameOverlayKind, GameUiAction } from "@v-ronpa/contracts";
import {
  GAME_A_PAUSE_ENTRY_OVERLAY,
  GAME_A_PAUSE_LOCKED_ACTIONS,
  isGameAPauseTabOverlay
} from "./gameAPauseTabs";
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
      if (runtime.startNewGame()) flow.send({ type: "ENTER_VN" });
      return;
    }
    if (
      save.pendingLoadSlot &&
      isGameAPauseTabOverlay(flow.activeOverlay) &&
      GAME_A_PAUSE_LOCKED_ACTIONS.has(action)
    ) {
      return;
    }
    if (action === "return-title") {
      flow.send({ type: "RETURN_TITLE" });
      return;
    }

    const overlay = overlayKindForGameAAction(action, flow.mode);
    if (overlay) {
      if (shouldStopVnShellAutomationForAction(action, flow.mode)) runtime.stopStoryAutomation("overlay");
      if (overlay === flow.activeOverlay) return;
      if (isGameAPauseTabOverlay(flow.activeOverlay) && isGameAPauseTabOverlay(overlay)) {
        flow.replaceOverlay(overlay);
        return;
      }
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
    createOverlayActions(overlay: GameOverlayKind | undefined): GameInteractionOverlayActions {
      if (!overlay) return {};
      if (overlay === "vn-backlog") {
        return { backlog: { close: flow.closeTopOverlay } };
      }
      if (overlay === "vn-save" || overlay === "vn-load" || overlay === "title-load") {
        return {
          saveLoad: {
            cancelLoad: save.cancelLoadSlot,
            close: flow.closeTopOverlay,
            confirmLoad: () => {
              save.confirmLoadSlot();
              flow.send({ type: "ENTER_VN" });
              flow.closeAllOverlays();
            },
            requestLoad: save.requestLoadSlot,
            save: save.saveSlot
          }
        };
      }
      if (overlay === "title-settings" || overlay === "vn-settings") {
        return {
          settings: {
            close: flow.closeTopOverlay,
            patchSettings: settings.patchSettings,
            resetSettings: settings.resetSettings
          }
        };
      }
      if (overlay === "pause-menu") {
        return { pauseMenu: { close: flow.closeTopOverlay, dispatch: dispatchUiAction } };
      }
      return {};
    }
  };
}

function overlayKindForGameAAction(action: GameUiAction, mode: GameAFlowAdapter["mode"]): GameOverlayKind | undefined {
  if (action === "open-pause-menu") return GAME_A_PAUSE_ENTRY_OVERLAY;
  return overlayKindForVnShellAction(action, mode);
}
