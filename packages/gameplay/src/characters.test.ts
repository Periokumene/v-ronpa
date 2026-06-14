import { describe, expect, it } from "vitest";
import {
  addCharacterStatus,
  addCharacterStatusWithResult,
  changeCharacterAffinity,
  createGameplayState,
  removeCharacterStatus,
  removeCharacterStatusWithResult,
  unlockCharacterSkill,
  unlockCharacterSkillWithResult
} from "./index";

describe("characters", () => {
  it("clamps affinity changes to 0-100", () => {
    const high = changeCharacterAffinity(createGameplayState(), "character:felix", 140);
    const low = changeCharacterAffinity(high, "character:felix", -200);

    expect(high.characters["character:felix"]?.affinity).toBe(100);
    expect(low.characters["character:felix"]?.affinity).toBe(0);
  });

  it("leaves affinity no-ops unmutated when clamping prevents changes", () => {
    const initial = createGameplayState();
    const state = changeCharacterAffinity(initial, "character:felix", -10);

    expect(state).toBe(initial);
    expect(initial.characters).toEqual({});
  });

  it("adds and removes statuses idempotently", () => {
    const first = addCharacterStatus(createGameplayState(), "character:felix", "focused");
    const duplicate = addCharacterStatusWithResult(first, "character:felix", "focused");
    const removed = removeCharacterStatus(first, "character:felix", "focused");
    const missing = removeCharacterStatusWithResult(removed, "character:felix", "focused");

    expect(first.characters["character:felix"]?.statuses).toEqual(["focused"]);
    expect(duplicate.state).toBe(first);
    expect(duplicate.result).toMatchObject({ applied: false, reason: "already-present" });
    expect(removed.characters["character:felix"]?.statuses).toEqual([]);
    expect(missing.result).toMatchObject({ applied: false, reason: "not-present" });
  });

  it("unlocks skills without duplicate ids", () => {
    const first = unlockCharacterSkill(createGameplayState(), "character:felix", "skill:logic");
    const duplicate = unlockCharacterSkillWithResult(first, "character:felix", "skill:logic");

    expect(first.characters["character:felix"]?.unlockedSkills).toEqual(["skill:logic"]);
    expect(duplicate.state).toBe(first);
    expect(duplicate.result).toMatchObject({ applied: false, reason: "already-present" });
  });
});
