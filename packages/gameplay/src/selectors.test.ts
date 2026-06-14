import { describe, expect, it } from "vitest";
import {
  addCharacterStatus,
  createGameplayState,
  getCharacterState,
  getItemQuantity,
  grantEvidence,
  grantItem,
  hasEvidence,
  hasItem,
  listOwnedEvidenceIds
} from "./index";

describe("selectors", () => {
  it("checks item ownership and quantity", () => {
    const state = grantItem(createGameplayState(), "gift:coffee", 2);

    expect(hasItem(state, "gift:coffee")).toBe(true);
    expect(hasItem(state, "gift:tea")).toBe(false);
    expect(getItemQuantity(state, "gift:coffee")).toBe(2);
    expect(getItemQuantity(state, "gift:tea")).toBe(0);
  });

  it("checks evidence ownership and returns stable owned ids", () => {
    const state = grantEvidence(grantEvidence(createGameplayState(), "evidence:keycard"), "evidence:photo");

    expect(hasEvidence(state, "evidence:keycard")).toBe(true);
    expect(hasEvidence(state, "evidence:missing")).toBe(false);
    expect(listOwnedEvidenceIds(state)).toEqual(["evidence:keycard", "evidence:photo"]);
  });

  it("returns existing or default character state without mutating missing lookups", () => {
    const initial = createGameplayState();
    const missing = getCharacterState(initial, "character:felix");
    const withStatus = addCharacterStatus(initial, "character:felix", "focused");

    expect(missing).toEqual({
      characterId: "character:felix",
      affinity: 0,
      statuses: [],
      unlockedSkills: []
    });
    expect(initial.characters).toEqual({});
    expect(getCharacterState(withStatus, "character:felix").statuses).toEqual(["focused"]);
  });
});
