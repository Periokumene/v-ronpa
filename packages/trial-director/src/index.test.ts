import { describe, expect, it } from "vitest";
import type { TrialDefinition } from "@v-ronpa/contracts";
import {
  createInitialTrialState,
  resolveTrialKeyword,
  segmentPresentationProfile,
  setTrialPresentation,
  trialReducer,
  validateTrialDefinition
} from "./index";

const trial: TrialDefinition = {
  id: "trial:case-01",
  title: "Case 01",
  initialSegmentId: "discussion:opening",
  segments: [
    {
      kind: "discussion",
      id: "discussion:opening",
      presentation: "vn3d",
      script: "trial.nani#Opening",
      nextSegmentId: "debate:door"
    },
    {
      kind: "debate",
      id: "debate:door",
      script: "trial.nani#Door",
      truthBullets: [{ evidenceId: "evidence:keycard", label: "Keycard" }],
      keywords: [{ id: "kw:locked", text: "locked", correctEvidenceId: "evidence:keycard" }],
      onCorrect: "discussion:after",
      onMiss: "debate:door",
      onTimeout: "discussion:fail"
    },
    {
      kind: "discussion",
      id: "discussion:after",
      script: "trial.nani#After"
    },
    {
      kind: "discussion",
      id: "discussion:fail",
      script: "trial.nani#Fail"
    }
  ]
};

describe("trial director", () => {
  it("derives presentation profile from trial segments", () => {
    expect(segmentPresentationProfile(trial.segments[0]!)).toBe("vn3d");
    expect(segmentPresentationProfile(trial.segments[1]!)).toBe("debate3d");
    expect(createInitialTrialState(trial)).toMatchObject({
      currentSegmentId: "discussion:opening",
      presentation: "vn3d",
      inputLock: "dialog"
    });
  });

  it("resolves truth bullets and updates trial runtime state", () => {
    const initial = setTrialPresentation(createInitialTrialState(trial), "debate3d");
    const state = { ...initial, currentSegmentId: "debate:door" };
    const result = resolveTrialKeyword(trial, state, "kw:locked", "evidence:keycard");

    expect(result.outcome).toMatchObject({ type: "correct", nextSegmentId: "discussion:after" });
    expect(result.trial).toMatchObject({
      selectedEvidenceId: "evidence:keycard",
      keywordStates: { "kw:locked": "broken" }
    });
  });

  it("validates trial graph references before subsystem fanout", () => {
    expect(validateTrialDefinition(trial)).toEqual([]);

    const invalid: TrialDefinition = {
      ...trial,
      segments: [
        {
          kind: "debate",
          id: "debate:bad",
          script: "bad.nani#Start",
          truthBullets: [{ evidenceId: "evidence:keycard", label: "Keycard" }],
          keywords: [{ id: "kw:bad", text: "bad", correctEvidenceId: "evidence:missing" }],
          onCorrect: "discussion:missing"
        }
      ]
    };

    expect(validateTrialDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-initial-segment", severity: "error" }),
        expect.objectContaining({ code: "missing-segment-ref", ref: "discussion:missing" }),
        expect.objectContaining({ code: "keyword-evidence-not-available", ref: "evidence:missing" })
      ])
    );
  });

  it("reduces trial events through the formal director boundary", () => {
    const initial = createInitialTrialState(trial);
    const entered = trialReducer(trial, initial, { type: "ENTER_SEGMENT", segmentId: "debate:door" });
    expect(entered).toMatchObject({
      outcome: { type: "segment", segmentId: "debate:door" },
      trial: { presentation: "debate3d", inputLock: "trial-targeting" }
    });

    const resolved = trialReducer(trial, entered.trial, {
      type: "BREAK_KEYWORD",
      keywordId: "kw:locked",
      evidenceId: "evidence:keycard"
    });

    expect(resolved).toMatchObject({
      outcome: { type: "correct", nextSegmentId: "discussion:after" },
      trial: { currentSegmentId: "discussion:after", presentation: "vn2d", inputLock: "dialog" }
    });
  });
});
