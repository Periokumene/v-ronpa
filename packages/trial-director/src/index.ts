import type {
  TrialDefinition,
  TrialPresentationProfile,
  TrialRuntimeState,
  TrialSegment
} from "@v-ronpa/contracts";
import {
  resolveDebateKeyword,
  resolveTrialTimeout,
  submitEvidence,
  type DebateOutcome
} from "@v-ronpa/gameplay";

export interface TrialDefinitionDiagnostic {
  severity: "warning" | "error";
  code:
    | "duplicate-segment"
    | "missing-initial-segment"
    | "missing-segment-ref"
    | "empty-debate-keywords"
    | "empty-truth-bullets"
    | "keyword-evidence-not-available"
    | "empty-evidence-submit";
  message: string;
  segmentId?: string;
  ref?: string;
}

export type EvidenceSubmitOutcome = { type: "evidence"; accepted: boolean; nextSegmentId?: string };
export type DebateDirectorOutcome = DebateOutcome & { nextSegmentId?: string };
export type SegmentOutcome = { type: "segment"; segmentId: string };
export type MinigameOutcome = { type: "minigame"; success: boolean; nextSegmentId?: string };
export type NoopOutcome = { type: "none" };
export type TrialDirectorOutcome =
  | DebateDirectorOutcome
  | EvidenceSubmitOutcome
  | SegmentOutcome
  | MinigameOutcome
  | NoopOutcome;

export interface TrialResolution {
  trial: TrialRuntimeState;
  outcome: TrialDirectorOutcome;
}

export type TrialEvent =
  | { type: "ENTER_SEGMENT"; segmentId: string }
  | { type: "SET_PRESENTATION"; presentation: TrialPresentationProfile }
  | { type: "BREAK_KEYWORD"; keywordId: string; evidenceId: string }
  | { type: "TIMEOUT" }
  | { type: "SUBMIT_EVIDENCE"; evidenceId: string }
  | { type: "COMPLETE_MINIGAME"; success: boolean };

export function createInitialTrialState(trial: TrialDefinition): TrialRuntimeState {
  const segment = findTrialSegment(trial, trial.initialSegmentId);
  const presentation = segment ? segmentPresentationProfile(segment) : "vn2d";
  const state: TrialRuntimeState = {
    trialId: trial.id,
    currentSegmentId: trial.initialSegmentId,
    presentation,
    inputLock: inputLockForPresentation(presentation),
    keywordStates: {}
  };
  if (segment?.kind === "debate" && segment.timeLimitMs) state.timerRemainingMs = segment.timeLimitMs;
  return state;
}

export function validateTrialDefinition(trial: TrialDefinition): TrialDefinitionDiagnostic[] {
  const diagnostics: TrialDefinitionDiagnostic[] = [];
  const segmentIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const segment of trial.segments) {
    if (segmentIds.has(segment.id)) duplicateIds.add(segment.id);
    segmentIds.add(segment.id);
  }

  for (const duplicateId of duplicateIds) {
    diagnostics.push({
      severity: "error",
      code: "duplicate-segment",
      message: `Trial segment '${duplicateId}' is declared more than once.`,
      segmentId: duplicateId
    });
  }

  if (!segmentIds.has(trial.initialSegmentId)) {
    diagnostics.push({
      severity: "error",
      code: "missing-initial-segment",
      message: `Initial segment '${trial.initialSegmentId}' does not exist.`,
      ref: trial.initialSegmentId
    });
  }

  for (const segment of trial.segments) {
    for (const ref of outgoingSegmentRefs(segment)) {
      if (!segmentIds.has(ref)) {
        diagnostics.push({
          severity: "error",
          code: "missing-segment-ref",
          message: `Segment '${segment.id}' references missing segment '${ref}'.`,
          segmentId: segment.id,
          ref
        });
      }
    }

    if (segment.kind === "debate") {
      if (segment.truthBullets.length === 0) {
        diagnostics.push({
          severity: "warning",
          code: "empty-truth-bullets",
          message: `Debate segment '${segment.id}' has no truth bullets.`,
          segmentId: segment.id
        });
      }

      if (segment.keywords.length === 0) {
        diagnostics.push({
          severity: "warning",
          code: "empty-debate-keywords",
          message: `Debate segment '${segment.id}' has no breakable keywords.`,
          segmentId: segment.id
        });
      }

      const availableEvidence = new Set(segment.truthBullets.map((bullet) => bullet.evidenceId));
      for (const keyword of segment.keywords) {
        if (!availableEvidence.has(keyword.correctEvidenceId)) {
          diagnostics.push({
            severity: "error",
            code: "keyword-evidence-not-available",
            message: `Keyword '${keyword.id}' requires evidence '${keyword.correctEvidenceId}' that is not available in the segment.`,
            segmentId: segment.id,
            ref: keyword.correctEvidenceId
          });
        }
      }
    }

    if (segment.kind === "evidence-submit" && segment.acceptedEvidenceIds.length === 0) {
      diagnostics.push({
        severity: "warning",
        code: "empty-evidence-submit",
        message: `Evidence submit segment '${segment.id}' accepts no evidence.`,
        segmentId: segment.id
      });
    }
  }

  return diagnostics;
}

export function findTrialSegment(trial: TrialDefinition, segmentId: string): TrialSegment | undefined {
  return trial.segments.find((segment) => segment.id === segmentId);
}

export function segmentPresentationProfile(segment: TrialSegment): TrialPresentationProfile {
  if (segment.presentation) return segment.presentation;
  if (segment.kind === "debate") return "debate3d";
  if (segment.kind === "minigame") return "minigame";
  return "vn2d";
}

export function setTrialPresentation(
  state: TrialRuntimeState,
  presentation: TrialPresentationProfile
): TrialRuntimeState {
  return {
    ...state,
    presentation,
    inputLock: inputLockForPresentation(presentation)
  };
}

export function forceTrialSegment(trial: TrialDefinition, state: TrialRuntimeState, segmentId: string): TrialRuntimeState {
  const segment = findTrialSegment(trial, segmentId);
  if (!segment) return state;
  return stateForSegment(state, segment);
}

export function trialReducer(trial: TrialDefinition, state: TrialRuntimeState, event: TrialEvent): TrialResolution {
  switch (event.type) {
    case "ENTER_SEGMENT": {
      const segment = findTrialSegment(trial, event.segmentId);
      if (!segment) return { trial: state, outcome: { type: "none" } };
      return {
        trial: stateForSegment(state, segment),
        outcome: { type: "segment", segmentId: segment.id }
      };
    }
    case "SET_PRESENTATION":
      return {
        trial: setTrialPresentation(state, event.presentation),
        outcome: { type: "none" }
      };
    case "BREAK_KEYWORD":
      return resolveTrialKeyword(trial, state, event.keywordId, event.evidenceId);
    case "TIMEOUT":
      return resolveTrialTimer(trial, state);
    case "SUBMIT_EVIDENCE":
      return submitTrialEvidence(trial, state, event.evidenceId);
    case "COMPLETE_MINIGAME":
      return completeTrialMinigame(trial, state, event.success);
  }
}

function stateForSegment(state: TrialRuntimeState, segment: TrialSegment): TrialRuntimeState {
  const presentation = segmentPresentationProfile(segment);
  const next: TrialRuntimeState = {
    ...state,
    currentSegmentId: segment.id,
    presentation,
    inputLock: inputLockForPresentation(presentation)
  };
  delete next.timerRemainingMs;
  if (segment.kind === "debate" && segment.timeLimitMs) next.timerRemainingMs = segment.timeLimitMs;
  return next;
}

export function resolveTrialKeyword(
  trial: TrialDefinition,
  state: TrialRuntimeState,
  keywordId: string,
  evidenceId: string
): TrialResolution {
  const ruleOutcome = resolveDebateKeyword(trial, state.currentSegmentId, keywordId, evidenceId);
  const outcome = withDebateNextSegment(trial, state.currentSegmentId, ruleOutcome);
  const keywordState = outcome.type === "correct" ? "broken" : "missed";
  return {
    trial: applyTrialOutcome(trial, state, outcome, { [keywordId]: keywordState }, evidenceId),
    outcome
  };
}

export function resolveTrialTimer(trial: TrialDefinition, state: TrialRuntimeState): TrialResolution {
  const ruleOutcome = resolveTrialTimeout(trial, state.currentSegmentId);
  const outcome = withDebateNextSegment(trial, state.currentSegmentId, ruleOutcome);
  return {
    trial: applyTrialOutcome(trial, state, outcome, undefined, state.selectedEvidenceId),
    outcome
  };
}

export function submitTrialEvidence(
  trial: TrialDefinition,
  state: TrialRuntimeState,
  evidenceId: string
): TrialResolution {
  const segment = findTrialSegment(trial, state.currentSegmentId);
  const result = segment ? submitEvidence(segment, evidenceId) : { accepted: false };
  const nextSegmentId =
    segment?.kind === "evidence-submit" ? (result.accepted ? segment.onAccepted : segment.onRejected) : undefined;
  const outcome = nextSegmentId
    ? { type: "evidence" as const, accepted: result.accepted, nextSegmentId }
    : { type: "evidence" as const, accepted: result.accepted };

  return {
    trial: nextSegmentId
      ? forceTrialSegment(trial, { ...state, selectedEvidenceId: evidenceId }, nextSegmentId)
      : { ...state, selectedEvidenceId: evidenceId },
    outcome
  };
}

export function completeTrialMinigame(
  trial: TrialDefinition,
  state: TrialRuntimeState,
  success: boolean
): TrialResolution {
  const segment = findTrialSegment(trial, state.currentSegmentId);
  if (segment?.kind !== "minigame") {
    return { trial: state, outcome: { type: "none" } };
  }

  const nextSegmentId = success ? segment.onSuccess : segment.onFailure;
  const outcome: MinigameOutcome = nextSegmentId
    ? { type: "minigame", success, nextSegmentId }
    : { type: "minigame", success };

  return {
    trial: nextSegmentId ? forceTrialSegment(trial, state, nextSegmentId) : state,
    outcome
  };
}

function applyTrialOutcome(
  trial: TrialDefinition,
  state: TrialRuntimeState,
  outcome: DebateDirectorOutcome,
  keywordPatch: Record<string, "pending" | "broken" | "missed"> | undefined,
  selectedEvidenceId: string | undefined
): TrialRuntimeState {
  const next = outcome.nextSegmentId ? forceTrialSegment(trial, state, outcome.nextSegmentId) : state;
  const updated: TrialRuntimeState = {
    ...next,
    keywordStates: {
      ...state.keywordStates,
      ...(keywordPatch ?? {})
    }
  };
  if (selectedEvidenceId) updated.selectedEvidenceId = selectedEvidenceId;
  return updated;
}

function withDebateNextSegment(
  trial: TrialDefinition,
  segmentId: string,
  outcome: DebateOutcome
): DebateDirectorOutcome {
  const segment = findTrialSegment(trial, segmentId);
  if (segment?.kind !== "debate") return outcome;
  const nextSegmentId =
    outcome.type === "correct" ? segment.onCorrect : outcome.type === "miss" ? segment.onMiss : segment.onTimeout;
  return nextSegmentId ? { ...outcome, nextSegmentId } : outcome;
}

function inputLockForPresentation(presentation: TrialPresentationProfile): TrialRuntimeState["inputLock"] {
  if (presentation === "debate3d") return "trial-targeting";
  if (presentation === "minigame") return "cutscene";
  return "dialog";
}

function outgoingSegmentRefs(segment: TrialSegment): string[] {
  switch (segment.kind) {
    case "discussion":
      return segment.nextSegmentId ? [segment.nextSegmentId] : [];
    case "debate":
      return [segment.onCorrect, segment.onMiss, segment.onTimeout].filter((ref): ref is string => Boolean(ref));
    case "minigame":
      return [segment.onSuccess, segment.onFailure].filter((ref): ref is string => Boolean(ref));
    case "evidence-submit":
      return [segment.onAccepted, segment.onRejected].filter((ref): ref is string => Boolean(ref));
  }
}
