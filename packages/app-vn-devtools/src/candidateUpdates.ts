import {
  EMPTY_VN_DEBUG_DECISION_TRACE,
  inspectVnDebugScript,
  materializeVnDebugTarget,
  resolveVnDebugAnchor,
  type VnDebugDecisionTrace,
  type VnDebugScriptInspection,
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
      inspection: VnDebugScriptInspection;
      reason: "invalid-source" | "revision-mismatch" | "catalog-link-error";
      message?: string;
  }
  | {
    kind: "refresh-source-mapping";
    inspection: VnDebugScriptInspection;
    expectedRevision: string;
    remappedTarget?: VnDebugTargetAnchor;
  }
  | {
    kind: "materialize-pinned-target";
    inspection: VnDebugScriptInspection;
    expectedRevision: string;
    result: VnDebugMaterializationResult;
  }
  | {
      kind: "adopt-catalog";
      inspection: VnDebugScriptInspection;
      expectedRevision: string;
      impact: "next-start" | "future-navigation";
    }
  | { kind: "require-preview-target"; inspection: VnDebugScriptInspection; expectedRevision: string };

export type VnDevtoolsScriptUpdateImpact = "next-start" | "future-navigation" | "executed-session";

export interface PrepareVnDevtoolsCandidateUpdateInput {
  activeCandidate: VnDevtoolsScriptCandidate;
  update: NaniDevtoolsViteUpdate;
  pinnedTarget?: VnDebugTargetAnchor;
  decisions?: VnDebugDecisionTrace;
  impact: VnDevtoolsScriptUpdateImpact;
  signal?: AbortSignal;
}

export function classifyVnDevtoolsScriptUpdateImpact({
  executedScriptPaths = [],
  runtimeScriptPath,
  updatedScriptPath,
  vnActive
}: {
  executedScriptPaths?: Iterable<string>;
  runtimeScriptPath: string;
  updatedScriptPath: string;
  vnActive: boolean;
}): VnDevtoolsScriptUpdateImpact {
  if (!vnActive) return "next-start";
  return updatedScriptPath === runtimeScriptPath || new Set(executedScriptPaths).has(updatedScriptPath)
    ? "executed-session"
    : "future-navigation";
}

/**
 * Runs the browser half of a saved-source update without mutating the host.
 * The controller commits only a returned ready materialization; every other
 * result is an inspection/status update that preserves last-known-good state.
 */
export async function prepareVnDevtoolsCandidateUpdate({
  activeCandidate,
  decisions = EMPTY_VN_DEBUG_DECISION_TRACE,
  impact,
  pinnedTarget,
  signal,
  update
}: PrepareVnDevtoolsCandidateUpdateInput): Promise<PreparedVnDevtoolsCandidateUpdate> {
  throwIfAborted(signal);
  const candidateSource = {
    ...activeCandidate.source,
    sourceText: update.sourceText,
    scriptRevision: update.serverRevision ?? activeCandidate.source.scriptRevision
  };
  const candidateCatalog = replaceVnDevtoolsCandidateSource(activeCandidate, candidateSource);
  const inspection = await inspectVnDebugScript(activeCandidate.entry, candidateSource);
  throwIfAborted(signal);
  const replayTarget = impact === "executed-session" ? pinnedTarget : undefined;
  const plan = planVnDevtoolsCandidate({
    serverRevision: update.serverRevision,
    browserRevision: inspection.revision,
    activeRevision: activeCandidate.source.scriptRevision,
    canMaterialize: inspection.canMaterialize,
    hasPinnedTarget: Boolean(replayTarget),
    vnActive: impact === "executed-session"
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
    if (!replayTarget) {
      return { kind: "retain-last-known-good", inspection, reason: "invalid-source" };
    }
    const result = await materializeVnDebugTarget({
      entry: inspection.entry,
      catalog: candidateCatalog.catalog,
      inspection,
      target: replayTarget,
      decisions,
      expectedRevision,
      ...(signal ? { signal } : {})
    });
    throwIfAborted(signal);
    return { kind: plan.kind, inspection, expectedRevision, result };
  }
  if (plan.kind === "adopt-for-next-start") {
    return {
      kind: "adopt-catalog",
      inspection,
      expectedRevision,
      impact: impact === "executed-session" ? "next-start" : impact
    };
  }
  return { kind: "require-preview-target", inspection, expectedRevision };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new DOMException("The Nani candidate task was superseded.", "AbortError");
}
