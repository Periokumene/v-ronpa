import type { GameMode, GameOverlayKind, GameUiAction, SaveSlotSummary } from "@v-ronpa/contracts";
import type { SaveLoadOverlayViewModel } from "./GameInteractionViewModels";

export type VnSaveLoadOverlayModel = Omit<SaveLoadOverlayViewModel, "visible">;

export function overlayKindForVnShellAction(action: GameUiAction, mode: GameMode): GameOverlayKind | undefined {
  if (action === "open-load") return mode === "title" ? "title-load" : "vn-load";
  if (action === "open-settings") return mode === "title" ? "title-settings" : "vn-settings";
  if (action === "open-save") return "vn-save";
  if (action === "open-backlog") return "vn-backlog";
  if (action === "open-pause-menu") return "pause-menu";
  return undefined;
}

export function shouldStopVnShellAutomationForAction(action: GameUiAction, mode: GameMode): boolean {
  return overlayKindForVnShellAction(action, mode) !== undefined;
}

export function createVnSaveLoadOverlayModel({
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
}): VnSaveLoadOverlayModel | undefined {
  if (overlay !== "vn-save" && overlay !== "vn-load" && overlay !== "title-load") return undefined;
  return {
    mode: overlay === "vn-save" ? "save" : "load",
    slotIds,
    slots,
    canSave: overlay === "vn-save" && canSave,
    pendingLoadSlot
  };
}
