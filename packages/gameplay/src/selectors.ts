import type { CharacterState } from "@v-ronpa/contracts";
import { ownsEvidence } from "./evidence";
import { getInventoryItemQuantity } from "./inventory";
import type { GameplayState } from "./state";
import { createDefaultCharacterState } from "./state";

export function hasItem(state: GameplayState, itemId: string): boolean {
  return getItemQuantity(state, itemId) > 0;
}

export function getItemQuantity(state: GameplayState, itemId: string): number {
  return getInventoryItemQuantity(state, itemId);
}

export function hasEvidence(state: GameplayState, evidenceId: string): boolean {
  return ownsEvidence(state.evidence, evidenceId);
}

export function listOwnedEvidenceIds(state: GameplayState): string[] {
  return [...state.evidence.ownedEvidenceIds];
}

export function getCharacterState(state: GameplayState, characterId: string): CharacterState {
  return state.characters[characterId] ?? createDefaultCharacterState(characterId);
}
