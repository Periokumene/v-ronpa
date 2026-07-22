import {
  EMPTY_VN_DEBUG_DECISION_TRACE,
  inspectVnDebugScript,
  materializeVnDebugTarget,
  type VnDebugDecisionTrace,
  type VnDebugScriptInspection,
  type VnDebugMaterializationResult,
  type VnDebugTargetAnchor
} from "@v-ronpa/app-vn-runtime/debug";
import type { NaniDevtoolsViteInitialCandidate } from "./viteProtocol";
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
      result: VnDebugMaterializationResult;
    }
  | { kind: "adopt-for-next-start"; inspection: VnDebugScriptInspection; expectedRevision: string }
  | { kind: "require-preview-target"; inspection: VnDebugScriptInspection; expectedRevision: string }
  | { kind: "ready"; inspection: VnDebugScriptInspection; expectedRevision: string };

export interface PrepareVnDevtoolsInitialCandidateInput {
  activeCandidate: VnDevtoolsScriptCandidate;
  candidate: NaniDevtoolsViteInitialCandidate;
  pinnedTarget?: VnDebugTargetAnchor;
  decisions?: VnDebugDecisionTrace;
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
  pinnedTarget,
  signal,
  vnActive
}: PrepareVnDevtoolsInitialCandidateInput): Promise<PreparedVnDevtoolsInitialCandidate> {
  throwIfAborted(signal);
  if (candidate.entryId !== activeCandidate.entry.id || candidate.scriptPath !== activeCandidate.source.scriptPath) {
    return {
      kind: "retain-read-only",
      inspection: await inspectVnDebugScript(activeCandidate.entry, activeCandidate.source),
      reason: "identity-mismatch"
    };
  }
  const candidateSource = {
    ...activeCandidate.source,
    sourceText: candidate.sourceText,
    scriptRevision: candidate.serverRevision ?? activeCandidate.source.scriptRevision
  };
  const candidateCatalog = replaceVnDevtoolsCandidateSource(activeCandidate, candidateSource);
  const inspection = await inspectVnDebugScript(activeCandidate.entry, candidateSource);
  throwIfAborted(signal);
  if (!candidate.serverRevision || !inspection.canMaterialize) {
    return { kind: "retain-read-only", inspection, reason: "invalid-source" };
  }
  if (inspection.revision !== candidate.serverRevision) {
    return { kind: "retain-read-only", inspection, reason: "revision-mismatch" };
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

  const expectedRevision = candidate.serverRevision;
  if (pinnedTarget) {
    const result = await materializeVnDebugTarget({
      entry: inspection.entry,
      catalog: candidateCatalog.catalog,
      inspection,
      target: pinnedTarget,
      decisions,
      expectedRevision,
      ...(signal ? { signal } : {})
    });
    throwIfAborted(signal);
    return { kind: "materialize-pinned-target", inspection, expectedRevision, result };
  }
  if (expectedRevision !== activeCandidate.source.scriptRevision) {
    return vnActive
      ? { kind: "require-preview-target", inspection, expectedRevision }
      : { kind: "adopt-for-next-start", inspection, expectedRevision };
  }
  return { kind: "ready", inspection, expectedRevision };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new DOMException("The initial Nani candidate task was superseded.", "AbortError");
}
