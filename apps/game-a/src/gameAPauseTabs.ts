import type { GameOverlayKind, GameUiAction } from "@v-ronpa/contracts";

export type GameAPauseTab = "log" | "save" | "load" | "settings";

export interface GameAPauseTabDefinition {
  action: GameUiAction;
  label: string;
  sectionNumber: string;
  tab: GameAPauseTab;
  testId: string;
}

export const GAME_A_PAUSE_ENTRY_OVERLAY: GameOverlayKind = "vn-backlog";

export const GAME_A_PAUSE_TABS: GameAPauseTabDefinition[] = [
  { action: "open-backlog", label: "LOG", sectionNumber: "01", tab: "log", testId: "pause-tab-log" },
  { action: "open-save", label: "SAVE", sectionNumber: "02", tab: "save", testId: "pause-tab-save" },
  { action: "open-load", label: "LOAD", sectionNumber: "03", tab: "load", testId: "pause-tab-load" },
  { action: "open-settings", label: "SETTINGS", sectionNumber: "04", tab: "settings", testId: "pause-tab-settings" }
];

const GAME_A_PAUSE_TAB_OVERLAYS = new Set<GameOverlayKind>([
  "vn-backlog",
  "vn-save",
  "vn-load",
  "vn-settings"
]);

export const GAME_A_PAUSE_LOCKED_ACTIONS = new Set<GameUiAction>([
  "open-backlog",
  "open-save",
  "open-load",
  "open-settings",
  "open-pause-menu",
  "return-title"
]);

export function isGameAPauseTabOverlay(overlay: GameOverlayKind | undefined): boolean {
  return overlay ? GAME_A_PAUSE_TAB_OVERLAYS.has(overlay) : false;
}

export function getGameAPauseTabSectionNumber(tab: GameAPauseTab): string {
  const definition = GAME_A_PAUSE_TABS.find((candidate) => candidate.tab === tab);
  if (!definition) throw new Error(`Unknown Game A pause tab: ${tab}`);
  return definition.sectionNumber;
}
