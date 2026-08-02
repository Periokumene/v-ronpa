import {
  EMPTY_VN_DEBUG_DECISION_TRACE,
  inspectVnDebugScript,
  materializeVnDebugTarget,
  resolveVnDebugFinalTextStageAnchor,
  type VnDebugDecisionTrace,
  type VnDebugMaterializationMode,
  type VnDebugScriptInspection,
  type VnDebugMaterializationResult,
  type VnDebugTargetAnchor
} from "@v-ronpa/app-vn-runtime/debug";
import type { NaniDevtoolsViteSourceCandidate } from "./viteProtocol";
import {
  replaceVnDevtoolsCandidateSource,
  validateVnDevtoolsCandidateCatalog,
  type VnDevtoolsScriptCandidate
} from "./scriptCandidate";

export type PreparedVnDevtoolsInitialCandidate =
  | {
      kind: "retain-read-only";
      inspection: VnDebugScriptInspection;
      reason: "invalid-source" | "revision-mismatch" | "catalog-link-error" | "identity-mismatch";
      message?: string;
    }
  | {
      kind: "materialize-pinned-target";
      inspection: VnDebugScriptInspection;
      expectedRevision: string;
      catalogVerified: boolean;
      result: VnDebugMaterializationResult;
    }
  | { kind: "adopt-for-next-start"; inspection: VnDebugScriptInspection; expectedRevision: string; catalogVerified: true }
  | { kind: "require-preview-target"; inspection: VnDebugScriptInspection; expectedRevision: string; catalogVerified: boolean }
  | { kind: "ready"; inspection: VnDebugScriptInspection; expectedRevision: string; catalogVerified: boolean };

export interface PrepareVnDevtoolsInitialCandidateInput {
  activeCandidate: VnDevtoolsScriptCandidate;
  candidate: NaniDevtoolsViteSourceCandidate;
  pinnedTarget?: VnDebugTargetAnchor;
  decisions?: VnDebugDecisionTrace;
  materializationMode?: VnDebugMaterializationMode;
  vnActive: boolean;
  signal?: AbortSignal;
}

/**
 * Performs the browser half of the first-load handshake. No initial restore or
 * adoption is exposed until the Vite server digest and browser digest agree.
 */
export async function prepareVnDevtoolsInitialCandidate({
  activeCandidate,
  candidate,
  decisions = EMPTY_VN_DEBUG_DECISION_TRACE,
  materializationMode = "canonical-entry",
  pinnedTarget,
  signal,
  vnActive
}: PrepareVnDevtoolsInitialCandidateInput): Promise<PreparedVnDevtoolsInitialCandidate> {
  throwIfAborted(signal);
  if (candidate.entryId !== activeCandidate.entry.id || candidate.scriptPath !== activeCandidate.source.scriptPath) {
    return {
      kind: "retain-read-only",
      inspection: await inspectVnDebugScript(
        activeCandidate.entry,
        activeCandidate.source,
        activeCandidate.sourceDiagnosticPolicy
      ),
      reason: "identity-mismatch"
    };
  }
  const candidateSource = {
    ...activeCandidate.source,
    sourceText: candidate.sourceText,
    scriptRevision: candidate.serverRevision ?? activeCandidate.source.scriptRevision
  };
  const candidateCatalog = replaceVnDevtoolsCandidateSource(activeCandidate, candidateSource);
  const inspection = await inspectVnDebugScript(
    activeCandidate.entry,
    candidateSource,
    activeCandidate.sourceDiagnosticPolicy
  );
  throwIfAborted(signal);
  if (!candidate.serverRevision || !inspection.canMaterialize) {
    return { kind: "retain-read-only", inspection, reason: "invalid-source" };
  }
  if (inspection.revision !== candidate.serverRevision) {
    return { kind: "retain-read-only", inspection, reason: "revision-mismatch" };
  }
  const expectedRevision = candidate.serverRevision;
  const finalPinnedTarget = pinnedTarget
    ? resolveVnDebugFinalTextStageAnchor(inspection, pinnedTarget) ?? pinnedTarget
    : undefined;
  if (pinnedTarget && materializationMode === "fast-current-script") {
    const result = await materializeVnDebugTarget({
      mode: materializationMode,
      entry: inspection.entry,
      inspection,
      target: finalPinnedTarget!,
      decisions,
      expectedRevision,
      sourceDiagnosticPolicy: activeCandidate.sourceDiagnosticPolicy,
      ...(signal ? { signal } : {})
    });
    throwIfAborted(signal);
    return { kind: "materialize-pinned-target", inspection, expectedRevision, catalogVerified: false, result };
  }
  if (
    !pinnedTarget
    && expectedRevision === activeCandidate.source.scriptRevision
    && materializationMode === "fast-current-script"
  ) {
    return { kind: "ready", inspection, expectedRevision, catalogVerified: false };
  }
  if (!pinnedTarget && vnActive && materializationMode === "fast-current-script") {
    return { kind: "require-preview-target", inspection, expectedRevision, catalogVerified: false };
  }
  const catalogValidation = await validateVnDevtoolsCandidateCatalog(candidateCatalog);
  throwIfAborted(signal);
  if (!catalogValidation.ok) {
    return {
      kind: "retain-read-only",
      inspection,
      reason: catalogValidation.code,
      message: catalogValidation.message
    };
  }
  if (finalPinnedTarget) {
    const result = await materializeVnDebugTarget({
      mode: "canonical-entry",
      entry: inspection.entry,
      catalog: candidateCatalog.catalog,
      inspection,
      target: finalPinnedTarget,
      decisions,
      expectedRevision,
      sourceDiagnosticPolicy: activeCandidate.sourceDiagnosticPolicy,
      ...(signal ? { signal } : {})
    });
    throwIfAborted(signal);
    return { kind: "materialize-pinned-target", inspection, expectedRevision, catalogVerified: true, result };
  }
  if (expectedRevision !== activeCandidate.source.scriptRevision) {
    return vnActive
      ? { kind: "require-preview-target", inspection, expectedRevision, catalogVerified: true }
      : { kind: "adopt-for-next-start", inspection, expectedRevision, catalogVerified: true };
  }
  return { kind: "ready", inspection, expectedRevision, catalogVerified: true };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new DOMException("The initial Nani candidate task was superseded.", "AbortError");
}
