import { describe, expect, it } from "vitest";
import type { EvidenceState, TrialDefinition, TrialSegment } from "@v-ronpa/contracts";
import { resolveDebateKeyword, resolveTrialTimeout, submitEvidence } from "./index";

const trial: TrialDefinition = {
  id: "trial:case-01",
  title: "Case 01",
  initialSegmentId: "debate:door",
  segments: [
    {
      kind: "debate",
      id: "debate:door",
      script: "trial.nani#Door",
      truthBullets: [
        { evidenceId: "evidence:keycard", label: "Keycard" },
        { evidenceId: "evidence:photo", label: "Photo" }
      ],
      keywords: [
        { id: "kw:locked", text: "locked", correctEvidenceId: "evidence:keycard" },
        { id: "kw:shadow", text: "shadow", correctEvidenceId: "evidence:photo" }
      ],
      onCorrect: "discussion:after",
      onMiss: "debate:door",
      onTimeout: "discussion:fail"
    },
    {
      kind: "discussion",
      id: "discussion:after",
      script: "trial.nani#After"
    }
  ]
};

const ownedEvidence: EvidenceState = {
  ownedEvidenceIds: ["evidence:keycard", "evidence:photo", "evidence:receipt"],
  submittedEvidenceIds: []
};

describe("trial rules", () => {
  it("returns correct for the matching owned and available evidence", () => {
    const outcome = resolveDebateKeyword(trial, "debate:door", ownedEvidence, "kw:locked", "evidence:keycard");

    expect(outcome).toEqual({ type: "correct", keywordId: "kw:locked", evidenceId: "evidence:keycard" });
    expect("nextSegmentId" in outcome).toBe(false);
  });

  it("returns miss for owned available evidence that does not match the keyword", () => {
    expect(resolveDebateKeyword(trial, "debate:door", ownedEvidence, "kw:locked", "evidence:photo")).toEqual({
      type: "miss",
      keywordId: "kw:locked",
      evidenceId: "evidence:photo"
    });
  });

  it("returns not-owned before checking segment availability", () => {
    expect(
      resolveDebateKeyword(
        trial,
        "debate:door",
        { ownedEvidenceIds: [], submittedEvidenceIds: [] },
        "kw:locked",
        "evidence:keycard"
      )
    ).toEqual({ type: "not-owned", keywordId: "kw:locked", evidenceId: "evidence:keycard" });
  });

  it("returns not-available when owned evidence is not a truth bullet for the segment", () => {
    expect(resolveDebateKeyword(trial, "debate:door", ownedEvidence, "kw:locked", "evidence:receipt")).toEqual({
      type: "not-available",
      keywordId: "kw:locked",
      evidenceId: "evidence:receipt"
    });
  });

  it("returns keyword-not-found for unknown keywords", () => {
    expect(resolveDebateKeyword(trial, "debate:door", ownedEvidence, "kw:missing", "evidence:keycard")).toEqual({
      type: "keyword-not-found",
      keywordId: "kw:missing",
      evidenceId: "evidence:keycard"
    });
  });

  it("returns invalid-segment for missing or non-debate segments", () => {
    expect(resolveDebateKeyword(trial, "missing", ownedEvidence, "kw:locked", "evidence:keycard")).toEqual({
      type: "invalid-segment",
      segmentId: "missing",
      keywordId: "kw:locked",
      evidenceId: "evidence:keycard"
    });
    expect(resolveDebateKeyword(trial, "discussion:after", ownedEvidence, "kw:locked", "evidence:keycard")).toEqual({
      type: "invalid-segment",
      segmentId: "discussion:after",
      keywordId: "kw:locked",
      evidenceId: "evidence:keycard"
    });
  });

  it("resolves timeout separately from keyword judgment", () => {
    const outcome = resolveTrialTimeout(trial, "debate:door");

    expect(outcome).toEqual({ type: "timeout" });
    expect("nextSegmentId" in outcome).toBe(false);
  });

  it("accepts or rejects evidence submissions without segment routing", () => {
    const segment: TrialSegment = {
      kind: "evidence-submit",
      id: "submit:culprit",
      prompt: "Choose the proof.",
      acceptedEvidenceIds: ["evidence:keycard"],
      onAccepted: "discussion:after",
      onRejected: "discussion:fail"
    };
    const accepted = submitEvidence(segment, "evidence:keycard");
    const rejected = submitEvidence(segment, "evidence:photo");

    expect(accepted).toEqual({ type: "accepted", accepted: true });
    expect(rejected).toEqual({ type: "rejected", accepted: false });
    expect("nextSegmentId" in accepted).toBe(false);
    expect("nextSegmentId" in rejected).toBe(false);
  });
});
