/** Explicit diagnostics/debug surface for the game harness. */
export { limitVnRuntimeDiagnostics } from "./runtimeDiagnostics";
export type { VnRuntimeDiagnostic } from "./runtimeDiagnostics";
export {
  canAdvanceVnStoryFromSource,
  canCompleteVnPauseRuntimeWaitFromSource,
  canToggleVnStoryAutomation,
  shouldAnimateVnStoryPlayPacing
} from "./runtimeUtils";
