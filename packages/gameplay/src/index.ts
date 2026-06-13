import type {
  CharacterState,
  EvidenceState,
  InteractableDef,
  InventoryState,
  TrialDefinition,
  TrialSegment,
  Vector3,
  WorldMapDef
} from "@v-ronpa/contracts";

export interface GameplayState {
  inventory: InventoryState;
  evidence: EvidenceState;
  characters: Record<string, CharacterState>;
}

export type ExplorationOutcome =
  | { type: "none" }
  | { type: "start-script"; script: string; label?: string }
  | { type: "grant-item"; itemId: string; quantity: number }
  | { type: "character-state"; characterId: string; affinityDelta: number };

export type DebateOutcome =
  | { type: "correct"; nextSegmentId?: string; keywordId: string }
  | { type: "miss"; nextSegmentId?: string; keywordId: string }
  | { type: "timeout"; nextSegmentId?: string };

export function createGameplayState(): GameplayState {
  return {
    inventory: { items: {} },
    evidence: { availableEvidenceIds: [], submittedEvidenceIds: [] },
    characters: {}
  };
}

export function grantItem(state: GameplayState, itemId: string, quantity = 1): GameplayState {
  const current = state.inventory.items[itemId] ?? 0;
  const inventory = {
    items: { ...state.inventory.items, [itemId]: current + quantity }
  };
  const evidence = itemId.startsWith("evidence:")
    ? {
        ...state.evidence,
        availableEvidenceIds: [...new Set([...state.evidence.availableEvidenceIds, itemId])]
      }
    : state.evidence;

  return { ...state, inventory, evidence };
}

export function changeCharacterAffinity(
  state: GameplayState,
  characterId: string,
  affinityDelta: number
): GameplayState {
  const previous = state.characters[characterId] ?? {
    characterId,
    affinity: 0,
    statuses: [],
    unlockedSkills: []
  };
  const nextAffinity = Math.max(0, Math.min(100, previous.affinity + affinityDelta));
  return {
    ...state,
    characters: {
      ...state.characters,
      [characterId]: { ...previous, affinity: nextAffinity }
    }
  };
}

export function nearestInteractable(map: WorldMapDef, position: Vector3): InteractableDef | undefined {
  return map.interactables.find((interactable) => distance(interactable.position, position) <= interactable.radius);
}

export function resolveInteractable(interactable: InteractableDef | undefined): ExplorationOutcome {
  if (!interactable) return { type: "none" };
  const { action } = interactable;

  if (action.type === "start-script") {
    return action.label
      ? { type: "start-script", script: action.script, label: action.label }
      : { type: "start-script", script: action.script };
  }

  if (action.type === "grant-item") {
    return { type: "grant-item", itemId: action.itemId, quantity: action.quantity };
  }

  return {
    type: "character-state",
    characterId: action.characterId,
    affinityDelta: action.affinityDelta
  };
}

export function resolveDebateKeyword(
  trial: TrialDefinition,
  segmentId: string,
  keywordId: string,
  evidenceId: string
): DebateOutcome {
  const segment = findSegment(trial, segmentId);
  if (!segment || segment.kind !== "debate") {
    return { type: "miss", keywordId };
  }

  const keyword = segment.keywords.find((candidate) => candidate.id === keywordId);
  if (!keyword) return withOptionalNext({ type: "miss", keywordId }, segment.onMiss);

  if (keyword.correctEvidenceId === evidenceId) {
    return withOptionalNext({ type: "correct", keywordId }, segment.onCorrect);
  }

  return withOptionalNext({ type: "miss", keywordId }, segment.onMiss);
}

export function resolveTrialTimeout(trial: TrialDefinition, segmentId: string): DebateOutcome {
  const segment = findSegment(trial, segmentId);
  if (segment?.kind !== "debate") return { type: "timeout" };
  return withOptionalNext({ type: "timeout" }, segment.onTimeout);
}

export function submitEvidence(
  segment: TrialSegment,
  evidenceId: string
): { accepted: boolean; nextSegmentId?: string } {
  if (segment.kind !== "evidence-submit") return { accepted: false };
  const accepted = segment.acceptedEvidenceIds.includes(evidenceId);
  const nextSegmentId = accepted ? segment.onAccepted : segment.onRejected;
  return nextSegmentId ? { accepted, nextSegmentId } : { accepted };
}

function withOptionalNext<T extends DebateOutcome>(outcome: T, nextSegmentId: string | undefined): T {
  return (nextSegmentId ? { ...outcome, nextSegmentId } : outcome) as T;
}

function findSegment(trial: TrialDefinition, segmentId: string): TrialSegment | undefined {
  return trial.segments.find((segment) => segment.id === segmentId);
}

function distance(a: Vector3, b: Vector3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
