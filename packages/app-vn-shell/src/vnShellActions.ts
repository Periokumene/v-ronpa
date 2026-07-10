import type { GameMode, GameOverlayKind, GameUiAction, SaveSlotSummary } from "@v-ronpa/contracts";
import type { SaveLoadActiveOperation, SaveLoadErrorViewModel, SaveLoadOverlayViewModel, SaveSlotPreviewViewModel } from "./GameInteractionViewModels";

export type VnSaveLoadOverlayModel = Omit<SaveLoadOverlayViewModel, "visible">;

export type VnPauseSectionId = "backlog" | "save" | "load" | "settings";

export interface VnPauseSectionDefinition {
  id: VnPauseSectionId;
  action: Extract<GameUiAction, "open-backlog" | "open-save" | "open-load" | "open-settings">;
  label: string;
  overlay: Extract<GameOverlayKind, "vn-backlog" | "vn-save" | "vn-load" | "vn-settings">;
  testId: string;
}

/** Canonical section order and navigation actions for every VN pause surface. */
export const VN_PAUSE_SECTIONS: VnPauseSectionDefinition[] = [
  { id: "backlog", action: "open-backlog", label: "LOG", overlay: "vn-backlog", testId: "pause-tab-log" },
  { id: "save", action: "open-save", label: "SAVE", overlay: "vn-save", testId: "pause-tab-save" },
  { id: "load", action: "open-load", label: "LOAD", overlay: "vn-load", testId: "pause-tab-load" },
  { id: "settings", action: "open-settings", label: "SETTINGS", overlay: "vn-settings", testId: "pause-tab-settings" }
];

export function pauseSectionForOverlay(overlay: GameOverlayKind | undefined): VnPauseSectionDefinition | undefined {
  return VN_PAUSE_SECTIONS.find((section) => section.overlay === overlay);
}

export function isVnPauseSectionOverlay(overlay: GameOverlayKind | undefined): boolean {
  return pauseSectionForOverlay(overlay) !== undefined;
}

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
  activeOperation,
  busy = false,
  canSave,
  lastError,
  overlay,
  pendingLoadSlot,
  slotPreviewsById = {},
  slotIds,
  slots
}: {
  activeOperation?: SaveLoadActiveOperation | undefined;
  busy?: boolean | undefined;
  canSave: boolean;
  lastError?: SaveLoadErrorViewModel | undefined;
  overlay: GameOverlayKind;
  pendingLoadSlot: SaveSlotSummary | undefined;
  slotPreviewsById?: Record<string, SaveSlotPreviewViewModel> | undefined;
  slotIds: string[];
  slots: SaveSlotSummary[];
}): VnSaveLoadOverlayModel | undefined {
  if (overlay !== "vn-save" && overlay !== "vn-load" && overlay !== "title-load") return undefined;
  return {
    mode: overlay === "vn-save" ? "save" : "load",
    slotIds,
    slots,
    slotPreviewsById,
    canSave: overlay === "vn-save" && canSave,
    pendingLoadSlot,
    busy,
    activeOperation,
    lastError
  };
}
