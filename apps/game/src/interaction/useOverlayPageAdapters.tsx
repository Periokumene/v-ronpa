import type { ReactNode } from "react";
import type { GameOverlayKind, GameUiAction, SaveSlotSummary } from "@v-ronpa/contracts";
import {
  PauseMenuOverlay,
  ReadOnlyBacklogOverlay,
  SaveLoadOverlay,
  SettingsOverlay
} from "@v-ronpa/ui-kit";
import type { useGameFlowActor } from "./useGameFlowActor";
import type { useVerticalSliceRuntimeAdapter } from "./useVerticalSliceRuntimeAdapter";
import type { useVerticalSliceSaveAdapter } from "./useVerticalSliceSaveAdapter";

type GameFlowAdapter = ReturnType<typeof useGameFlowActor>;
type VerticalSliceRuntimeAdapter = ReturnType<typeof useVerticalSliceRuntimeAdapter>;
type VerticalSliceSaveAdapter = ReturnType<typeof useVerticalSliceSaveAdapter>;

export interface SaveLoadOverlayModel {
  mode: "save" | "load";
  slotIds: string[];
  slots: SaveSlotSummary[];
  canSave: boolean;
  pendingLoadSlot: SaveSlotSummary | undefined;
}

export function overlayKindForUiAction(action: GameUiAction, mode: GameFlowAdapter["mode"]): GameOverlayKind | undefined {
  if (action === "open-load") return mode === "title" ? "title-load" : "vn-load";
  if (action === "open-settings") return mode === "title" ? "title-settings" : "vn-settings";
  if (action === "open-save") return "vn-save";
  if (action === "open-backlog") return "vn-backlog";
  if (action === "open-pause-menu") return "pause-menu";
  return undefined;
}

export function createSaveLoadOverlayModel({
  canSave,
  overlay,
  pendingLoadSlot,
  slotIds,
  slots
}: {
  canSave: boolean;
  overlay: GameOverlayKind;
  pendingLoadSlot: SaveSlotSummary | undefined;
  slotIds: string[];
  slots: SaveSlotSummary[];
}): SaveLoadOverlayModel | undefined {
  if (overlay === "vn-save") return { canSave, mode: "save", pendingLoadSlot, slotIds, slots };
  if (overlay === "title-load" || overlay === "vn-load") {
    return { canSave: false, mode: "load", pendingLoadSlot, slotIds, slots };
  }
  return undefined;
}

export function useOverlayPageAdapters({
  flow,
  runtime,
  save
}: {
  flow: GameFlowAdapter;
  runtime: VerticalSliceRuntimeAdapter;
  save: VerticalSliceSaveAdapter;
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
      runtime.resetSlice();
      flow.dispatchAction("new-game");
      return;
    }

    const overlay = overlayKindForUiAction(action, flow.mode);
    if (overlay) {
      runtime.stopStoryAutomation("overlay");
      flow.openOverlay(overlay);
      return;
    }

    if (action === "return-title") {
      runtime.resetSlice();
      flow.send({ type: "RETURN_TITLE" });
    }
  }

  return {
    dispatchUiAction,
    renderOverlay(overlay: GameOverlayKind | undefined): ReactNode {
      if (!overlay) return null;

      if (overlay === "vn-backlog") {
        return <ReadOnlyBacklogOverlay entries={runtime.storyRuntime.state.backlog} onClose={flow.closeTopOverlay} />;
      }

      if (overlay === "vn-save") {
        const model = createSaveLoadOverlayModel({
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
            onConfirmLoad={save.confirmLoadSlot}
            onRequestLoad={save.requestLoadSlot}
            onSave={save.saveSlot}
            pendingLoadSlot={model.pendingLoadSlot}
            slotIds={model.slotIds}
            slots={model.slots}
          />
        );
      }

      if (overlay === "title-load" || overlay === "vn-load") {
        const model = createSaveLoadOverlayModel({
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
            onConfirmLoad={async () => {
              await save.confirmLoadSlot();
              flow.send({ type: "ENTER_NAVI" });
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
        return <SettingsOverlay onClose={flow.closeTopOverlay} />;
      }

      if (overlay === "pause-menu") {
        return <PauseMenuOverlay capabilities={flow.capabilities} onAction={dispatchUiAction} onClose={flow.closeTopOverlay} />;
      }

      return null;
    }
  };
}
