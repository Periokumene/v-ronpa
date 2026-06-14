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
  | { type: "grant-evidence"; evidenceId: string }
  | { type: "character-state"; characterId: string; affinityDelta: number };

export type DebateOutcome =
  | { type: "correct"; keywordId: string }
  | { type: "miss"; keywordId: string }
  | { type: "timeout" };

export function createGameplayState(): GameplayState {
  return {
    inventory: { items: {} },
    evidence: { ownedEvidenceIds: [], submittedEvidenceIds: [] },
    characters: {}
  };
}

export function grantItem(state: GameplayState, itemId: string, quantity = 1): GameplayState {
  const current = state.inventory.items[itemId] ?? 0;
  const inventory = {
    items: { ...state.inventory.items, [itemId]: current + quantity }
  };
  return { ...state, inventory };
}

export function grantEvidence(state: GameplayState, evidenceId: string): GameplayState {
  return {
    ...state,
    evidence: {
      ...state.evidence,
      ownedEvidenceIds: [...new Set([...state.evidence.ownedEvidenceIds, evidenceId])]
    }
  };
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

  if (action.type === "grant-evidence") {
    return { type: "grant-evidence", evidenceId: action.evidenceId };
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
  if (!keyword) return { type: "miss", keywordId };

  if (keyword.correctEvidenceId === evidenceId) {
    return { type: "correct", keywordId };
  }

  return { type: "miss", keywordId };
}

export function resolveTrialTimeout(trial: TrialDefinition, segmentId: string): DebateOutcome {
  const segment = findSegment(trial, segmentId);
  if (segment?.kind !== "debate") return { type: "timeout" };
  return { type: "timeout" };
}

export function submitEvidence(
  segment: TrialSegment,
  evidenceId: string
): { accepted: boolean } {
  if (segment.kind !== "evidence-submit") return { accepted: false };
  return { accepted: segment.acceptedEvidenceIds.includes(evidenceId) };
}

function findSegment(trial: TrialDefinition, segmentId: string): TrialSegment | undefined {
  return trial.segments.find((segment) => segment.id === segmentId);
}

function distance(a: Vector3, b: Vector3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
