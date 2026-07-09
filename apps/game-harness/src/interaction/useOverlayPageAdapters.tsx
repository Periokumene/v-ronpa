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

    if (action === "quick-save") {
      if (save.busy) return;
      if (!flow.capabilities.canSave) return;
      void save.quickSaveSlot();
      return;
    }

    if (action === "quick-load") {
      if (save.busy) return;
      if (!flow.capabilities.canLoad || !save.quickSlot) return;
      void save.quickLoadSlot().then((loaded) => {
        if (!loaded) return;
        flow.send({ type: "ENTER_NAVI" });
        flow.closeAllOverlays();
      });
      return;
    }

    const overlay = overlayKindForVnShellAction(action, flow.mode);
    if (overlay) {
      if (save.busy && (overlay === "vn-save" || overlay === "vn-load" || overlay === "title-load")) return;
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
    createCommandAvailability() {
      return {
        "open-save": !save.busy,
        "quick-save": !save.busy,
        "open-load": !save.busy,
        "quick-load": Boolean(save.quickSlot) && !save.busy
      };
    },
    createOverlayViewModelInputs(overlay: GameOverlayKind | undefined): GameInteractionOverlayViewModelInputs {
      if (!overlay) return {};
      if (overlay === "vn-save" || overlay === "title-load" || overlay === "vn-load") {
        return {
          saveLoad: createVnSaveLoadOverlayModel({
            canSave: flow.capabilities.canSave,
            activeOperation: save.activeOperation,
            busy: save.busy,
            lastError: save.lastError,
            overlay,
            pendingLoadSlot: save.pendingLoadSlot,
            slotPreviewsById: save.slotPreviewsById,
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
            confirmLoad: () => {
              void save.confirmLoadSlot();
            },
            loadPreviews: save.loadPreviews,
            requestLoad: (slotId) => {
              void save.requestLoadSlot(slotId);
            },
            save: (slotId) => {
              void save.saveSlot(slotId);
            }
          }
        };
      }

      if (overlay === "title-load" || overlay === "vn-load") {
        return {
          saveLoad: {
            cancelLoad: save.cancelLoadSlot,
            close: flow.closeTopOverlay,
            confirmLoad: () => {
              void save.confirmLoadSlot().then((loaded) => {
                if (!loaded) return;
                flow.send({ type: "ENTER_NAVI" });
                flow.closeAllOverlays();
              });
            },
            loadPreviews: save.loadPreviews,
            requestLoad: (slotId) => {
              void save.requestLoadSlot(slotId);
            },
            save: (slotId) => {
              void save.saveSlot(slotId);
            }
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
