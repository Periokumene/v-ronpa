import type {
  GameMode,
  GameOverlayKind,
  GamePauseSection,
  GameUiAction,
  InteractionCapabilitySnapshot,
  SaveSlotSummary
} from "@v-ronpa/contracts";
import type {
  GameCommandAvailability,
  SaveLoadActiveOperation,
  SaveLoadErrorViewModel,
  SaveLoadOverlayViewModel,
  SaveSlotPreviewViewModel
} from "./GameInteractionViewModels";

export type VnSaveLoadOverlayModel = Omit<SaveLoadOverlayViewModel, "visible" | "placement">;

export interface VnPauseSectionDefinition {
  id: GamePauseSection;
  action: Extract<GameUiAction, "open-backlog" | "open-save" | "open-load" | "open-settings">;
  label: string;
  testId: string;
}

/** Canonical section order and navigation actions for every pause surface. */
export const VN_PAUSE_SECTIONS: VnPauseSectionDefinition[] = [
  { id: "backlog", action: "open-backlog", label: "LOG", testId: "pause-tab-log" },
  { id: "save", action: "open-save", label: "SAVE", testId: "pause-tab-save" },
  { id: "load", action: "open-load", label: "LOAD", testId: "pause-tab-load" },
  { id: "settings", action: "open-settings", label: "SETTINGS", testId: "pause-tab-settings" }
];

export type VnShellNavigationTarget =
  | { kind: "overlay"; overlay: GameOverlayKind }
  | { kind: "pause"; section: GamePauseSection | undefined };

export function resolveVnShellNavigation(action: GameUiAction, mode: GameMode): VnShellNavigationTarget | undefined {
  if (mode === "title") {
    if (action === "open-load") return { kind: "overlay", overlay: "title-load" };
    if (action === "open-settings") return { kind: "overlay", overlay: "title-settings" };
    return undefined;
  }
  if (action === "open-pause") return { kind: "pause", section: undefined };
  const section = VN_PAUSE_SECTIONS.find((candidate) => candidate.action === action)?.id;
  return section ? { kind: "pause", section } : undefined;
}

export function selectDefaultPauseSection(
  capabilities: InteractionCapabilitySnapshot,
  commandAvailability: GameCommandAvailability = {}
): GamePauseSection {
  if (capabilities.canOpenBacklog && commandAvailability["open-backlog"] !== false) return "backlog";
  if (capabilities.canSave && commandAvailability["open-save"] !== false) return "save";
  if (capabilities.canLoad && commandAvailability["open-load"] !== false) return "load";
  return "settings";
}

export function shouldStopVnShellAutomationForAction(action: GameUiAction, mode: GameMode): boolean {
  return resolveVnShellNavigation(action, mode) !== undefined;
}

export function createVnSaveLoadOverlayModel({
  activeOperation,
  busy = false,
  canSave,
  lastError,
  page,
  pendingLoadSlot,
  slotPreviewsById = {},
  slotIds,
  slots
}: {
  activeOperation?: SaveLoadActiveOperation | undefined;
  busy?: boolean | undefined;
  canSave: boolean;
  lastError?: SaveLoadErrorViewModel | undefined;
  page: Extract<GamePauseSection, "save" | "load"> | "title-load";
  pendingLoadSlot: SaveSlotSummary | undefined;
  slotPreviewsById?: Record<string, SaveSlotPreviewViewModel> | undefined;
  slotIds: string[];
  slots: SaveSlotSummary[];
}): VnSaveLoadOverlayModel {
  return {
    mode: page === "save" ? "save" : "load",
    slotIds,
    slots,
    slotPreviewsById,
    canSave: page === "save" && canSave,
    pendingLoadSlot,
    busy,
    activeOperation,
    lastError
  };
}
