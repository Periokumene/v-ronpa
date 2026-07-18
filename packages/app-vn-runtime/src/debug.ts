/** Explicit diagnostics, inspection, and materialization surface for harness/dev tooling. */
export { useVnRuntimeWithDebug } from "./useVnRuntimeWithDebug";
export type { UseVnRuntimeWithDebugResult, VnRuntimeDebugSnapshot } from "./runtimeTypes";
export { limitVnRuntimeDiagnostics } from "./runtimeDiagnostics";
export type { VnRuntimeDiagnostic } from "./runtimeDiagnostics";
export {
  DEFAULT_VN_DEBUG_MAX_INSTRUCTIONS,
  EMPTY_VN_DEBUG_DECISION_TRACE,
  inspectVnDebugEntry,
  materializeVnDebugTarget,
  resolveVnDebugAnchor
} from "./debugMaterializer";
export type {
  MaterializeVnDebugTargetInput,
  VnDebugChoiceDecision,
  VnDebugChoiceRequest,
  VnDebugCommandInspection,
  VnDebugDecisionTrace,
  VnDebugEntryInspection,
  VnDebugInputDecision,
  VnDebugInputRequest,
  VnDebugLabelOutlineItem,
  VnDebugMaterializationBlocked,
  VnDebugMaterializationBlockedCode,
  VnDebugMaterializationDecisionRequired,
  VnDebugMaterializationReady,
  VnDebugMaterializationResult,
  VnDebugPreviewability,
  VnDebugSourceLine,
  VnDebugTargetAnchor
} from "./debugMaterializer";
