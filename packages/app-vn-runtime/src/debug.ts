/** Explicit diagnostics, inspection, and materialization surface for harness/dev tooling. */
export { useVnRuntimeWithDebug } from "./useVnRuntimeWithDebug";
export type { UseVnRuntimeWithDebugResult, VnRuntimeDebugSnapshot } from "./runtimeTypes";
export { limitVnRuntimeDiagnostics } from "./runtimeDiagnostics";
export type { VnRuntimeDiagnostic } from "./runtimeDiagnostics";
export {
  DEFAULT_VN_DEBUG_MAX_INSTRUCTIONS,
  EMPTY_VN_DEBUG_DECISION_TRACE,
  inspectVnDebugScript,
  materializeVnDebugTarget,
  resolveVnDebugAnchor
} from "./debugMaterializer";
export type {
  MaterializeVnDebugTargetInput,
  MaterializeVnDebugCanonicalTargetInput,
  MaterializeVnDebugFastTargetInput,
  VnDebugChoiceDecision,
  VnDebugChoiceRequest,
  VnDebugCommandInspection,
  VnDebugDecisionTrace,
  VnDebugScriptInspection,
  VnDebugInputDecision,
  VnDebugInputRequest,
  VnDebugLabelOutlineItem,
  VnDebugMaterializationBlocked,
  VnDebugMaterializationBlockedCode,
  VnDebugMaterializationDecisionRequired,
  VnDebugMaterializationMode,
  VnDebugMaterializationProvenance,
  VnDebugMaterializationReady,
  VnDebugMaterializationResult,
  VnDebugPreviewability,
  VnDebugSourceLine,
  VnDebugTargetAnchor
} from "./debugMaterializer";
