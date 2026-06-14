import type { EvidenceState } from "@v-ronpa/contracts";
import type { GameplayState } from "./state";

export type EvidenceResultReason = "already-owned" | "not-owned" | "already-submitted";

export interface EvidenceMutationResult {
  type: "grant-evidence" | "remove-evidence" | "record-evidence-submission";
  evidenceId: string;
  applied: boolean;
  reason?: EvidenceResultReason;
}

export function grantEvidence(state: GameplayState, evidenceId: string): GameplayState {
  return grantEvidenceWithResult(state, evidenceId).state;
}

export function grantEvidenceWithResult(
  state: GameplayState,
  evidenceId: string
): { state: GameplayState; result: EvidenceMutationResult } {
  if (ownsEvidence(state.evidence, evidenceId)) {
    return {
      state,
      result: {
        type: "grant-evidence",
        evidenceId,
        applied: false,
        reason: "already-owned"
      }
    };
  }

  return {
    state: {
      ...state,
      evidence: {
        ...state.evidence,
        ownedEvidenceIds: [...state.evidence.ownedEvidenceIds, evidenceId]
      }
    },
    result: {
      type: "grant-evidence",
      evidenceId,
      applied: true
    }
  };
}

export function removeEvidence(state: GameplayState, evidenceId: string): GameplayState {
  return removeEvidenceWithResult(state, evidenceId).state;
}

export function removeEvidenceWithResult(
  state: GameplayState,
  evidenceId: string
): { state: GameplayState; result: EvidenceMutationResult } {
  if (!ownsEvidence(state.evidence, evidenceId)) {
    return {
      state,
      result: {
        type: "remove-evidence",
        evidenceId,
        applied: false,
        reason: "not-owned"
      }
    };
  }

  return {
    state: {
      ...state,
      evidence: {
        ...state.evidence,
        ownedEvidenceIds: state.evidence.ownedEvidenceIds.filter((ownedId) => ownedId !== evidenceId)
      }
    },
    result: {
      type: "remove-evidence",
      evidenceId,
      applied: true
    }
  };
}

export function recordEvidenceSubmission(state: GameplayState, evidenceId: string): GameplayState {
  return recordEvidenceSubmissionWithResult(state, evidenceId).state;
}

export function recordEvidenceSubmissionWithResult(
  state: GameplayState,
  evidenceId: string
): { state: GameplayState; result: EvidenceMutationResult } {
  if (state.evidence.submittedEvidenceIds.includes(evidenceId)) {
    return {
      state,
      result: {
        type: "record-evidence-submission",
        evidenceId,
        applied: false,
        reason: "already-submitted"
      }
    };
  }

  return {
    state: {
      ...state,
      evidence: {
        ...state.evidence,
        submittedEvidenceIds: [...state.evidence.submittedEvidenceIds, evidenceId]
      }
    },
    result: {
      type: "record-evidence-submission",
      evidenceId,
      applied: true
    }
  };
}

export function ownsEvidence(evidence: EvidenceState, evidenceId: string): boolean {
  return evidence.ownedEvidenceIds.includes(evidenceId);
}

export function listOwnedEvidenceIdsFromEvidenceState(evidence: EvidenceState): string[] {
  return [...evidence.ownedEvidenceIds];
}
