import {
  EMPTY_VN_DEBUG_DECISION_TRACE,
  inspectVnDebugEntry,
  materializeVnDebugTarget,
  resolveVnDebugAnchor,
  type VnDebugDecisionTrace,
  type VnDebugEntryInspection,
  type VnDebugMaterializationResult,
  type VnDebugTargetAnchor
} from "@v-ronpa/app-vn-runtime/debug";
import { planVnDevtoolsCandidate } from "./sourceUpdates";
import type { NaniDevtoolsViteUpdate } from "./viteProtocol";
import {
  replaceVnDevtoolsCandidateSource,
  validateVnDevtoolsCandidateCatalog,
  type VnDevtoolsScriptCandidate
} from "./scriptCandidate";

export type PreparedVnDevtoolsCandidateUpdate =
  | {
      kind: "retain-last-known-good";
      inspection: VnDebugEntryInspection;
      reason: "invalid-source" | "revision-mismatch" | "catalog-link-error";
      message?: string;
  }
  | {
    kind: "refresh-source-mapping";
    inspection: VnDebugEntryInspection;
    expectedRevision: string;
    remappedTarget?: VnDebugTargetAnchor;
  }
  | {
    kind: "materialize-pinned-target";
    inspection: VnDebugEntryInspection;
    expectedRevision: string;
    result: VnDebugMaterializationResult;
  }
  | { kind: "adopt-for-next-start"; inspection: VnDebugEntryInspection; expectedRevision: string }
  | { kind: "require-preview-target"; inspection: VnDebugEntryInspection; expectedRevision: string };

export interface PrepareVnDevtoolsCandidateUpdateInput {
  activeCandidate: VnDevtoolsScriptCandidate;
  update: NaniDevtoolsViteUpdate;
  pinnedTarget?: VnDebugTargetAnchor;
  decisions?: VnDebugDecisionTrace;
  vnActive: boolean;
  signal?: AbortSignal;
}

export function isVnDevtoolsUpdateRuntimeActive({
  hasFixedPoint,
  runtimeScriptPath,
  runtimeVisitedScriptPaths = [],
  updatedScriptPath,
  vnActive
}: {
  hasFixedPoint: boolean;
  runtimeScriptPath: string;
  runtimeVisitedScriptPaths?: Iterable<string>;
  updatedScriptPath: string;
  vnActive: boolean;
}): boolean {
  return vnActive && (
    updatedScriptPath === runtimeScriptPath
    || hasFixedPoint
    || new Set(runtimeVisitedScriptPaths).has(updatedScriptPath)
  );
}

/**
 * Runs the browser half of a saved-source update without mutating the host.
 * The controller commits only a returned ready materialization; every other
 * result is an inspection/status update that preserves last-known-good state.
 */
export async function prepareVnDevtoolsCandidateUpdate({
  activeCandidate,
  decisions = EMPTY_VN_DEBUG_DECISION_TRACE,
  pinnedTarget,
  signal,
  update,
  vnActive
}: PrepareVnDevtoolsCandidateUpdateInput): Promise<PreparedVnDevtoolsCandidateUpdate> {
  throwIfAborted(signal);
  const candidateSource = {
    ...activeCandidate.source,
    sourceText: update.sourceText,
    scriptRevision: update.serverRevision ?? activeCandidate.source.scriptRevision
  };
  const candidateCatalog = replaceVnDevtoolsCandidateSource(activeCandidate, candidateSource);
  const inspection = await inspectVnDebugEntry(activeCandidate.entry, candidateSource);
  throwIfAborted(signal);
  const plan = planVnDevtoolsCandidate({
    serverRevision: update.serverRevision,
    browserRevision: inspection.revision,
    activeRevision: activeCandidate.source.scriptRevision,
    canMaterialize: inspection.canMaterialize,
    hasPinnedTarget: Boolean(pinnedTarget),
    vnActive
  });

  if (plan.kind === "retain-last-known-good") {
    return { kind: plan.kind, inspection, reason: plan.reason };
  }
  // Every non-retain plan is revision-verified by planVnDevtoolsCandidate.
  // Keep that proof on the prepared value so later manual previews cannot
  // accidentally omit the server revision check.
  const expectedRevision = update.serverRevision;
  if (!expectedRevision) {
    return { kind: "retain-last-known-good", inspection, reason: "invalid-source" };
  }
  const catalogValidation = await validateVnDevtoolsCandidateCatalog(candidateCatalog);
  throwIfAborted(signal);
  if (!catalogValidation.ok) {
    return {
      kind: "retain-last-known-good",
      inspection,
      reason: catalogValidation.code,
      message: catalogValidation.message
    };
  }
  if (plan.kind === "refresh-source-mapping") {
    const remappedTarget = pinnedTarget
      ? pinnedTarget.scriptPath === inspection.source.scriptPath
        ? resolveVnDebugAnchor(inspection, pinnedTarget)
        : pinnedTarget
      : undefined;
    return {
      kind: plan.kind,
      inspection,
      expectedRevision,
      ...(remappedTarget ? { remappedTarget } : {})
    };
  }
  if (plan.kind === "materialize-pinned-target") {
    if (!pinnedTarget) {
      return { kind: "retain-last-known-good", inspection, reason: "invalid-source" };
    }
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
    return { kind: plan.kind, inspection, expectedRevision, result };
  }
  if (plan.kind === "adopt-for-next-start") return { kind: plan.kind, inspection, expectedRevision };
  return { kind: "require-preview-target", inspection, expectedRevision };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new DOMException("The Nani candidate task was superseded.", "AbortError");
}
