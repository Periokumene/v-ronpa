import type { GameplayState } from "./state";
import { createDefaultCharacterState } from "./state";

export type CharacterResultReason = "already-present" | "not-present";

export interface CharacterMutationResult {
  type: "change-character-affinity" | "add-character-status" | "remove-character-status" | "unlock-character-skill";
  characterId: string;
  applied: boolean;
  reason?: CharacterResultReason;
}

export interface AffinityMutationResult extends CharacterMutationResult {
  type: "change-character-affinity";
  affinityDelta: number;
  previousAffinity: number;
  nextAffinity: number;
}

export interface StatusMutationResult extends CharacterMutationResult {
  type: "add-character-status" | "remove-character-status";
  status: string;
}

export interface SkillMutationResult extends CharacterMutationResult {
  type: "unlock-character-skill";
  skillId: string;
}

export type CharacterEventResult = AffinityMutationResult | StatusMutationResult | SkillMutationResult;

export function changeCharacterAffinity(
  state: GameplayState,
  characterId: string,
  affinityDelta: number
): GameplayState {
  return changeCharacterAffinityWithResult(state, characterId, affinityDelta).state;
}

export function changeCharacterAffinityWithResult(
  state: GameplayState,
  characterId: string,
  affinityDelta: number
): { state: GameplayState; result: AffinityMutationResult } {
  const previous = state.characters[characterId] ?? createDefaultCharacterState(characterId);
  const nextAffinity = clampAffinity(previous.affinity + affinityDelta);
  const applied = previous.affinity !== nextAffinity;
  if (!applied) {
    return {
      state,
      result: {
        type: "change-character-affinity",
        characterId,
        affinityDelta,
        previousAffinity: previous.affinity,
        nextAffinity,
        applied: false
      }
    };
  }

  return {
    state: {
      ...state,
      characters: {
        ...state.characters,
        [characterId]: {
          ...previous,
          affinity: nextAffinity
        }
      }
    },
    result: {
      type: "change-character-affinity",
      characterId,
      affinityDelta,
      previousAffinity: previous.affinity,
      nextAffinity,
      applied: true
    }
  };
}

export function addCharacterStatus(state: GameplayState, characterId: string, status: string): GameplayState {
  return addCharacterStatusWithResult(state, characterId, status).state;
}

export function addCharacterStatusWithResult(
  state: GameplayState,
  characterId: string,
  status: string
): { state: GameplayState; result: StatusMutationResult } {
  const previous = state.characters[characterId] ?? createDefaultCharacterState(characterId);
  if (previous.statuses.includes(status)) {
    return {
      state,
      result: {
        type: "add-character-status",
        characterId,
        status,
        applied: false,
        reason: "already-present"
      }
    };
  }

  return {
    state: {
      ...state,
      characters: {
        ...state.characters,
        [characterId]: {
          ...previous,
          statuses: [...previous.statuses, status]
        }
      }
    },
    result: {
      type: "add-character-status",
      characterId,
      status,
      applied: true
    }
  };
}

export function removeCharacterStatus(state: GameplayState, characterId: string, status: string): GameplayState {
  return removeCharacterStatusWithResult(state, characterId, status).state;
}

export function removeCharacterStatusWithResult(
  state: GameplayState,
  characterId: string,
  status: string
): { state: GameplayState; result: StatusMutationResult } {
  const previous = state.characters[characterId] ?? createDefaultCharacterState(characterId);
  if (!previous.statuses.includes(status)) {
    return {
      state,
      result: {
        type: "remove-character-status",
        characterId,
        status,
        applied: false,
        reason: "not-present"
      }
    };
  }

  return {
    state: {
      ...state,
      characters: {
        ...state.characters,
        [characterId]: {
          ...previous,
          statuses: previous.statuses.filter((candidate) => candidate !== status)
        }
      }
    },
    result: {
      type: "remove-character-status",
      characterId,
      status,
      applied: true
    }
  };
}

export function unlockCharacterSkill(state: GameplayState, characterId: string, skillId: string): GameplayState {
  return unlockCharacterSkillWithResult(state, characterId, skillId).state;
}

export function unlockCharacterSkillWithResult(
  state: GameplayState,
  characterId: string,
  skillId: string
): { state: GameplayState; result: SkillMutationResult } {
  const previous = state.characters[characterId] ?? createDefaultCharacterState(characterId);
  if (previous.unlockedSkills.includes(skillId)) {
    return {
      state,
      result: {
        type: "unlock-character-skill",
        characterId,
        skillId,
        applied: false,
        reason: "already-present"
      }
    };
  }

  return {
    state: {
      ...state,
      characters: {
        ...state.characters,
        [characterId]: {
          ...previous,
          unlockedSkills: [...previous.unlockedSkills, skillId]
        }
      }
    },
    result: {
      type: "unlock-character-skill",
      characterId,
      skillId,
      applied: true
    }
  };
}

function clampAffinity(affinity: number): number {
  return Math.max(0, Math.min(100, affinity));
}
