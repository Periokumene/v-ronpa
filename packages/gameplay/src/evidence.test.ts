import { describe, expect, it } from "vitest";
import {
  createGameplayState,
  grantEvidence,
  grantEvidenceWithResult,
  listOwnedEvidenceIdsFromEvidenceState,
  ownsEvidence,
  recordEvidenceSubmission,
  removeEvidence
} from "./index";

describe("evidence", () => {
  it("grants evidence ownership once", () => {
    const first = grantEvidence(createGameplayState(), "evidence:keycard");
    const duplicate = grantEvidenceWithResult(first, "evidence:keycard");

    expect(first.evidence.ownedEvidenceIds).toEqual(["evidence:keycard"]);
    expect(duplicate.state).toBe(first);
    expect(duplicate.result).toMatchObject({ applied: false, reason: "already-owned" });
  });

  it("removes evidence ownership", () => {
    const state = removeEvidence(grantEvidence(createGameplayState(), "evidence:keycard"), "evidence:keycard");

    expect(state.evidence.ownedEvidenceIds).toEqual([]);
  });

  it("checks ownership and lists stable owned ids", () => {
    const evidence = {
      ownedEvidenceIds: ["evidence:keycard", "evidence:photo"],
      submittedEvidenceIds: []
    };

    expect(ownsEvidence(evidence, "evidence:keycard")).toBe(true);
    expect(ownsEvidence(evidence, "evidence:missing")).toBe(false);
    expect(listOwnedEvidenceIdsFromEvidenceState(evidence)).toEqual(["evidence:keycard", "evidence:photo"]);
  });

  it("records submissions from current submittedEvidenceIds without duplicates", () => {
    const initial = {
      ...createGameplayState(),
      evidence: {
        ownedEvidenceIds: ["evidence:keycard"],
        submittedEvidenceIds: ["evidence:photo"]
      }
    };
    const recorded = recordEvidenceSubmission(initial, "evidence:keycard");
    const duplicate = recordEvidenceSubmission(recorded, "evidence:keycard");

    expect(recorded.evidence.submittedEvidenceIds).toEqual(["evidence:photo", "evidence:keycard"]);
    expect(duplicate.evidence.submittedEvidenceIds).toEqual(["evidence:photo", "evidence:keycard"]);
  });
});
