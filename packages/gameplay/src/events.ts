import type { GameplayEvent } from "@v-ronpa/contracts";
import type { CharacterEventResult } from "./characters";
import {
  addCharacterStatusWithResult,
  changeCharacterAffinityWithResult,
  removeCharacterStatusWithResult,
  unlockCharacterSkillWithResult
} from "./characters";
import type { EvidenceMutationResult } from "./evidence";
import { grantEvidenceWithResult, removeEvidenceWithResult } from "./evidence";
import type { ConsumeItemResult, InventoryMutationResult } from "./inventory";
import { consumeItem, grantItemWithResult, removeItemWithResult } from "./inventory";
import type { GameplayState } from "./state";

export type GameplayEventResult =
  | InventoryMutationResult
  | ConsumeItemResult
  | EvidenceMutationResult
  | CharacterEventResult;

export interface GameplayEventApplication {
  state: GameplayState;
  result: GameplayEventResult;
}

export function applyGameplayEvent(state: GameplayState, event: GameplayEvent): GameplayEventApplication {
  switch (event.type) {
    case "grant-item":
      return grantItemWithResult(state, event.itemId, event.quantity);
    case "remove-item":
      return removeItemWithResult(state, event.itemId, event.quantity);
    case "consume-item":
      return consumeItem(state, event.itemId, event.quantity);
    case "grant-evidence":
      return grantEvidenceWithResult(state, event.evidenceId);
    case "remove-evidence":
      return removeEvidenceWithResult(state, event.evidenceId);
    case "change-character-affinity":
      return changeCharacterAffinityWithResult(state, event.characterId, event.affinityDelta);
    case "add-character-status":
      return addCharacterStatusWithResult(state, event.characterId, event.status);
    case "remove-character-status":
      return removeCharacterStatusWithResult(state, event.characterId, event.status);
    case "unlock-character-skill":
      return unlockCharacterSkillWithResult(state, event.characterId, event.skillId);
  }
}
