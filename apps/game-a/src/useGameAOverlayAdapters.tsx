import type { ReactNode } from "react";
import {
  createVnSaveLoadOverlayModel,
  overlayKindForVnShellAction,
  shouldStopVnShellAutomationForAction,
  type useGameSettingsAdapter
} from "@v-ronpa/app-vn-shell";
import type { GameOverlayKind, GameUiAction } from "@v-ronpa/contracts";
import {
  PauseMenuOverlay,
  ReadOnlyBacklogOverlay,
  SaveLoadOverlay,
  SettingsOverlay
} from "@v-ronpa/ui-kit";
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
    renderOverlay(overlay: GameOverlayKind | undefined): ReactNode {
      if (!overlay) return null;
      if (overlay === "vn-backlog") {
        return <ReadOnlyBacklogOverlay entries={runtime.storyRuntime.state.backlog} onClose={flow.closeTopOverlay} />;
      }
      if (overlay === "vn-save" || overlay === "vn-load" || overlay === "title-load") {
        const model = createVnSaveLoadOverlayModel({
          canSave: flow.capabilities.canSave,
          overlay,
          pendingLoadSlot: save.pendingLoadSlot,
          slotIds: save.slotIds,
          slots: save.slots
        });
        if (!model) return null;
        return (
          <SaveLoadOverlay
            canSave={model.canSave}
            mode={model.mode}
            onCancelLoad={save.cancelLoadSlot}
            onClose={flow.closeTopOverlay}
            onConfirmLoad={() => {
              save.confirmLoadSlot();
              flow.send({ type: "ENTER_VN" });
              flow.closeAllOverlays();
            }}
            onRequestLoad={save.requestLoadSlot}
            onSave={save.saveSlot}
            pendingLoadSlot={model.pendingLoadSlot}
            slotIds={model.slotIds}
            slots={model.slots}
          />
        );
      }
      if (overlay === "title-settings" || overlay === "vn-settings") {
        return (
          <SettingsOverlay
            onClose={flow.closeTopOverlay}
            onPatchSettings={settings.patchSettings}
            onResetSettings={settings.resetSettings}
            settings={settings.settings}
          />
        );
      }
      if (overlay === "pause-menu") {
        return <PauseMenuOverlay capabilities={flow.capabilities} onAction={dispatchUiAction} onClose={flow.closeTopOverlay} />;
      }
      return null;
    }
  };
}
