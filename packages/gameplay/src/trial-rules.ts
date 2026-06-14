import type { EvidenceState, TrialDefinition, TrialSegment } from "@v-ronpa/contracts";
import { ownsEvidence } from "./evidence";

export type DebateKeywordOutcome =
  | { type: "correct"; keywordId: string; evidenceId: string }
  | { type: "miss"; keywordId: string; evidenceId: string }
  | { type: "not-owned"; keywordId: string; evidenceId: string }
  | { type: "not-available"; keywordId: string; evidenceId: string }
  | { type: "keyword-not-found"; keywordId: string; evidenceId: string }
  | { type: "invalid-segment"; keywordId: string; evidenceId: string; segmentId: string };

export type TrialTimeoutOutcome = { type: "timeout" };

export type DebateOutcome = DebateKeywordOutcome | TrialTimeoutOutcome;

export type EvidenceSubmitOutcome = { type: "accepted"; accepted: true } | { type: "rejected"; accepted: false };

export function resolveDebateKeyword(
  trial: TrialDefinition,
  segmentId: string,
  evidenceState: EvidenceState,
  keywordId: string,
  evidenceId: string
): DebateKeywordOutcome;
export function resolveDebateKeyword(
  trial: TrialDefinition,
  segmentId: string,
  keywordId: string,
  evidenceId: string
): Extract<DebateKeywordOutcome, { type: "correct" | "miss" }>;
export function resolveDebateKeyword(
  trial: TrialDefinition,
  segmentId: string,
  evidenceStateOrKeywordId: EvidenceState | string,
  keywordIdOrEvidenceId: string,
  maybeEvidenceId?: string
): DebateKeywordOutcome {
  if (typeof evidenceStateOrKeywordId === "string") {
    return resolveLegacyDebateKeyword(trial, segmentId, evidenceStateOrKeywordId, keywordIdOrEvidenceId);
  }

  return resolveOwnedDebateKeyword(
    trial,
    segmentId,
    evidenceStateOrKeywordId,
    keywordIdOrEvidenceId,
    requiredEvidenceId(maybeEvidenceId)
  );
}

export function resolveTrialTimeout(_trial: TrialDefinition, _segmentId: string): TrialTimeoutOutcome {
  return { type: "timeout" };
}

export function submitEvidence(segment: TrialSegment, evidenceId: string): EvidenceSubmitOutcome {
  if (segment.kind !== "evidence-submit") return { type: "rejected", accepted: false };
  return segment.acceptedEvidenceIds.includes(evidenceId)
    ? { type: "accepted", accepted: true }
    : { type: "rejected", accepted: false };
}

function resolveOwnedDebateKeyword(
  trial: TrialDefinition,
  segmentId: string,
  evidenceState: EvidenceState,
  keywordId: string,
  evidenceId: string
): DebateKeywordOutcome {
  const segment = findSegment(trial, segmentId);
  if (!segment || segment.kind !== "debate") {
    return { type: "invalid-segment", segmentId, keywordId, evidenceId };
  }

  const keyword = segment.keywords.find((candidate) => candidate.id === keywordId);
  if (!keyword) return { type: "keyword-not-found", keywordId, evidenceId };

  if (!ownsEvidence(evidenceState, evidenceId)) {
    return { type: "not-owned", keywordId, evidenceId };
  }

  if (!segment.truthBullets.some((truthBullet) => truthBullet.evidenceId === evidenceId)) {
    return { type: "not-available", keywordId, evidenceId };
  }

  if (keyword.correctEvidenceId === evidenceId) {
    return { type: "correct", keywordId, evidenceId };
  }

  return { type: "miss", keywordId, evidenceId };
}

function resolveLegacyDebateKeyword(
  trial: TrialDefinition,
  segmentId: string,
  keywordId: string,
  evidenceId: string
): Extract<DebateKeywordOutcome, { type: "correct" | "miss" }> {
  const segment = findSegment(trial, segmentId);
  if (!segment || segment.kind !== "debate") {
    return { type: "miss", keywordId, evidenceId };
  }

  const keyword = segment.keywords.find((candidate) => candidate.id === keywordId);
  if (!keyword) return { type: "miss", keywordId, evidenceId };

  if (keyword.correctEvidenceId === evidenceId) {
    return { type: "correct", keywordId, evidenceId };
  }

  return { type: "miss", keywordId, evidenceId };
}

function findSegment(trial: TrialDefinition, segmentId: string): TrialSegment | undefined {
  return trial.segments.find((segment) => segment.id === segmentId);
}

function requiredEvidenceId(evidenceId: string | undefined): string {
  if (evidenceId === undefined) {
    throw new TypeError("resolveDebateKeyword requires evidenceId when EvidenceState is provided.");
  }
  return evidenceId;
}
