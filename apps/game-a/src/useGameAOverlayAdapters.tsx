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
  settings,
  beginNewGame,
  ensureVnPresentationReady
}: {
  flow: GameAFlowAdapter;
  runtime: GameAVnRuntime;
  save: GameASaveAdapter;
  settings: GameASettingsAdapter;
  beginNewGame(): Promise<boolean>;
  ensureVnPresentationReady(): Promise<boolean>;
}) {
  function dispatchUiAction(action: GameUiAction) {
    if (action === "toggle-auto") {
      runtime.debug.toggleStoryAuto();
      return;
    }
    if (action === "toggle-skip") {
      runtime.debug.toggleStorySkip();
      return;
    }
    if (action === "new-game") {
      void beginNewGame();
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
        flow.send({ type: "ENTER_VN" });
      });
      return;
    }
    if (action === "return-title") {
      runtime.lifecycle.resetRuntime();
      flow.send({ type: "RETURN_TITLE" });
      return;
    }

    const target = resolveVnShellNavigation(action, flow.mode);
    if (target) {
      const section = target.kind === "pause"
        ? target.section ?? selectDefaultPauseSection(flow.capabilities, createCommandAvailability())
        : undefined;
      if (save.busy && target.kind === "overlay" && target.overlay === "title-load") return;
      if (shouldStopVnShellAutomationForAction(action, flow.mode)) runtime.debug.stopStoryAutomation("overlay");
      if (target.kind === "pause") {
        const pauseSection = section ?? selectDefaultPauseSection(flow.capabilities, createCommandAvailability());
        if (flow.mode === "paused" && pauseSection === flow.pauseSection) return;
        flow.openPauseSection(pauseSection);
      } else {
        if (target.overlay === flow.activeOverlay) return;
        flow.openOverlay(target.overlay);
      }
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
      if (page === "save" || page === "load" || page === "title-load") {
        return {
          saveLoad: {
            cancelLoad: save.cancelLoadSlot,
            close,
            confirmLoad: () => {
              void ensureVnPresentationReady().then((ready) => ready && save.confirmLoadSlot()).then((loaded) => {
                if (!loaded) return;
                flow.send({ type: "ENTER_VN" });
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
