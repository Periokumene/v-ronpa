import type { VnRuntimeEntry } from "@v-ronpa/app-vn-runtime";
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
import type { NaniDevtoolsViteInitialCandidate } from "./viteProtocol";

export type PreparedVnDevtoolsInitialCandidate =
  | {
      kind: "retain-read-only";
      inspection: VnDebugEntryInspection;
      reason: "invalid-source" | "revision-mismatch" | "identity-mismatch" | "source-mismatch" | "target-invalid";
    }
  | {
      kind: "materialize-pinned-target";
      inspection: VnDebugEntryInspection;
      expectedRevision: string;
      result: VnDebugMaterializationResult;
    }
  | { kind: "adopt-for-next-start"; inspection: VnDebugEntryInspection; expectedRevision: string }
  | { kind: "require-preview-target"; inspection: VnDebugEntryInspection; expectedRevision: string }
  | { kind: "ready"; inspection: VnDebugEntryInspection; expectedRevision: string };

export interface PrepareVnDevtoolsInitialCandidateInput {
  activeEntry: VnRuntimeEntry;
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
  activeEntry,
  candidate,
  decisions = EMPTY_VN_DEBUG_DECISION_TRACE,
  pinnedTarget,
  signal,
  vnActive
}: PrepareVnDevtoolsInitialCandidateInput): Promise<PreparedVnDevtoolsInitialCandidate> {
  throwIfAborted(signal);
  if (candidate.entryId !== activeEntry.id || candidate.scriptPath !== activeEntry.scriptPath) {
    return {
      kind: "retain-read-only",
      inspection: await inspectVnDebugEntry(activeEntry),
      reason: "identity-mismatch"
    };
  }
  if (candidate.sourceText !== activeEntry.sourceText) {
    return {
      kind: "retain-read-only",
      inspection: await inspectVnDebugEntry(activeEntry),
      reason: "source-mismatch"
    };
  }

  const candidateEntry: VnRuntimeEntry = {
    ...activeEntry,
    sourceText: candidate.sourceText,
    scriptRevision: candidate.serverRevision ?? activeEntry.scriptRevision
  };
  const inspection = await inspectVnDebugEntry(candidateEntry);
  throwIfAborted(signal);
  if (!candidate.serverRevision || !inspection.canMaterialize) {
    return { kind: "retain-read-only", inspection, reason: "invalid-source" };
  }
  if (inspection.revision !== candidate.serverRevision) {
    return { kind: "retain-read-only", inspection, reason: "revision-mismatch" };
  }

  const expectedRevision = candidate.serverRevision;
  if (pinnedTarget) {
    const resolvedTarget = resolveVnDebugAnchor(inspection, pinnedTarget);
    if (!resolvedTarget) {
      return { kind: "retain-read-only", inspection, reason: "target-invalid" };
    }
    const result = await materializeVnDebugTarget({
      entry: inspection.entry,
      inspection,
      target: resolvedTarget,
      decisions,
      expectedRevision,
      ...(signal ? { signal } : {})
    });
    throwIfAborted(signal);
    return { kind: "materialize-pinned-target", inspection, expectedRevision, result };
  }
  if (expectedRevision !== activeEntry.scriptRevision) {
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
