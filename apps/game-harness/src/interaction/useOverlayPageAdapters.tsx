import {
  createVnSaveLoadOverlayModel,
  overlayKindForVnShellAction,
  shouldStopVnShellAutomationForAction,
  type GameInteractionOverlayActions,
  type GameInteractionOverlayViewModelInputs,
  type useGameSettingsAdapter
} from "@v-ronpa/app-vn-shell";
import type { GameOverlayKind, GameUiAction } from "@v-ronpa/contracts";
import type { useGameFlowActor } from "./useGameFlowActor";
import type { useHarnessShowcaseRuntimeAdapter } from "./useHarnessShowcaseRuntimeAdapter";
import type { useHarnessShowcaseSaveAdapter } from "./useHarnessShowcaseSaveAdapter";

type GameFlowAdapter = ReturnType<typeof useGameFlowActor>;
type GameSettingsAdapter = ReturnType<typeof useGameSettingsAdapter>;
type HarnessShowcaseRuntimeAdapter = ReturnType<typeof useHarnessShowcaseRuntimeAdapter>;
type HarnessShowcaseSaveAdapter = ReturnType<typeof useHarnessShowcaseSaveAdapter>;

export function useOverlayPageAdapters({
  flow,
  runtime,
  save,
  settings
}: {
  flow: GameFlowAdapter;
  runtime: HarnessShowcaseRuntimeAdapter;
  save: HarnessShowcaseSaveAdapter;
  settings: GameSettingsAdapter;
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
      runtime.resetShowcase();
      flow.dispatchAction("new-game");
      return;
    }

    const overlay = overlayKindForVnShellAction(action, flow.mode);
    if (overlay) {
      if (shouldStopVnShellAutomationForAction(action, flow.mode)) runtime.stopStoryAutomation("overlay");
      flow.openOverlay(overlay);
      return;
    }

    if (action === "return-title") {
      runtime.resetShowcase();
      flow.send({ type: "RETURN_TITLE" });
    }
  }

  return {
    dispatchUiAction,
    createOverlayViewModelInputs(overlay: GameOverlayKind | undefined): GameInteractionOverlayViewModelInputs {
      if (!overlay) return {};
      if (overlay === "vn-save" || overlay === "title-load" || overlay === "vn-load") {
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

      if (overlay === "vn-save") {
        return {
          saveLoad: {
            cancelLoad: save.cancelLoadSlot,
            close: flow.closeTopOverlay,
            confirmLoad: save.confirmLoadSlot,
            requestLoad: save.requestLoadSlot,
            save: save.saveSlot
          }
        };
      }

      if (overlay === "title-load" || overlay === "vn-load") {
        return {
          saveLoad: {
            cancelLoad: save.cancelLoadSlot,
            close: flow.closeTopOverlay,
            confirmLoad: async () => {
              await save.confirmLoadSlot();
              flow.send({ type: "ENTER_NAVI" });
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
