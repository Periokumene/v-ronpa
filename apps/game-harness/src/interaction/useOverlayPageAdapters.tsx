import {
  createVnSaveLoadOverlayModel,
  resolveVnShellNavigation,
  selectDefaultPauseSection,
  shouldStopVnShellAutomationForAction,
  type GameInteractionPage,
  type GameInteractionOverlayActions,
  type GameInteractionOverlayViewModelInputs,
  type useGameSettingsAdapter
} from "@v-ronpa/app-vn-shell";
import type { GameUiAction } from "@v-ronpa/contracts";
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
  settings,
  ensureVnPresentationReady
}: {
  flow: GameFlowAdapter;
  runtime: HarnessShowcaseRuntimeAdapter;
  save: HarnessShowcaseSaveAdapter;
  settings: GameSettingsAdapter;
  ensureVnPresentationReady(): Promise<boolean>;
}) {
  function dispatchUiAction(action: GameUiAction) {
    if (action === "toggle-auto") {
      runtime.shell.toggleStoryAuto();
      return;
    }

    if (action === "toggle-skip") {
      runtime.shell.toggleStorySkip();
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
      void ensureVnPresentationReady().then((ready) => ready && save.quickLoadSlot()).then((loaded) => {
        if (!loaded) return;
        flow.send({ type: "ENTER_NAVI" });
      });
      return;
    }

    const target = resolveVnShellNavigation(action, flow.mode);
    if (target) {
      const section = target.kind === "pause"
        ? target.section ?? selectDefaultPauseSection(flow.capabilities, createCommandAvailability())
        : undefined;
      if (save.busy && target.kind === "overlay" && target.overlay === "title-load") return;
      if (shouldStopVnShellAutomationForAction(action, flow.mode)) runtime.shell.stopStoryAutomation("overlay");
      if (target.kind === "pause") {
        flow.openPauseSection(section ?? selectDefaultPauseSection(flow.capabilities, createCommandAvailability()));
      }
      else flow.openOverlay(target.overlay);
      return;
    }

    if (action === "return-title") {
      runtime.resetShowcase();
      flow.send({ type: "RETURN_TITLE" });
    }
  }

  function createCommandAvailability() {
    return {
      "open-save": !save.busy,
      "quick-save": !save.busy,
      "open-load": !save.busy,
      "quick-load": Boolean(save.quickSlot) && !save.busy
    };
  }

  return {
    dispatchUiAction,
    createCommandAvailability,
    createPageViewModelInputs(page: GameInteractionPage | undefined): GameInteractionOverlayViewModelInputs {
      if (!page) return {};
      if (page === "save" || page === "load" || page === "title-load") {
        return {
          saveLoad: createVnSaveLoadOverlayModel({
            canSave: flow.capabilities.canSave,
            activeOperation: save.activeOperation,
            busy: save.busy,
            lastError: save.lastError,
            page,
            pendingLoadSlot: save.pendingLoadSlot,
            slotPreviewsById: save.slotPreviewsById,
            slotIds: save.slotIds,
            slots: save.slots
          })
        };
      }
      if (page === "title-settings" || page === "settings") {
        return { settings: settings.settings };
      }
      return {};
    },
    createPageActions(page: GameInteractionPage | undefined): GameInteractionOverlayActions {
      if (!page) return {};
      const close = flow.mode === "paused" ? flow.resumeFromPause : flow.closeOverlay;

      if (page === "backlog") {
        return { backlog: { close } };
      }

      if (page === "save") {
        return {
          saveLoad: {
            cancelLoad: save.cancelLoadSlot,
            close,
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

      if (page === "title-load" || page === "load") {
        return {
          saveLoad: {
            cancelLoad: save.cancelLoadSlot,
            close,
            confirmLoad: () => {
              void ensureVnPresentationReady().then((ready) => ready && save.confirmLoadSlot()).then((loaded) => {
                if (!loaded) return;
                flow.send({ type: "ENTER_NAVI" });
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

      if (page === "title-settings" || page === "settings") {
        return {
          settings: {
            close,
            patchSettings: settings.patchSettings,
            resetSettings: settings.resetSettings
          }
        };
      }

      return {};
    }
  };
}
