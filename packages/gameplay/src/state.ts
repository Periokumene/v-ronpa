import type { CharacterState, EvidenceState, InventoryState } from "@v-ronpa/contracts";

export interface GameplayState {
  inventory: InventoryState;
  evidence: EvidenceState;
  characters: Record<string, CharacterState>;
}

export function createGameplayState(): GameplayState {
  return {
    inventory: { items: {} },
    evidence: { ownedEvidenceIds: [], submittedEvidenceIds: [] },
    characters: {}
  };
}

export function createDefaultCharacterState(characterId: string): CharacterState {
  return {
    characterId,
    affinity: 0,
    statuses: [],
    unlockedSkills: []
  };
}
