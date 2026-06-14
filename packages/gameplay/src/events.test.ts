import { describe, expect, it } from "vitest";
import type { GameplayEvent } from "@v-ronpa/contracts";
import { applyGameplayEvent, createGameplayState, grantEvidence, grantItem } from "./index";

describe("gameplay events", () => {
  it("handles every current GameplayEvent variant", () => {
    const events: GameplayEvent[] = [
      { type: "grant-item", itemId: "gift:coffee", quantity: 2 },
      { type: "remove-item", itemId: "gift:coffee", quantity: 1 },
      { type: "consume-item", itemId: "gift:coffee", quantity: 1 },
      { type: "grant-evidence", evidenceId: "evidence:keycard" },
      { type: "remove-evidence", evidenceId: "evidence:keycard" },
      { type: "change-character-affinity", characterId: "character:felix", affinityDelta: 12 },
      { type: "add-character-status", characterId: "character:felix", status: "focused" },
      { type: "remove-character-status", characterId: "character:felix", status: "focused" },
      { type: "unlock-character-skill", characterId: "character:felix", skillId: "skill:logic" }
    ];

    const appliedTypes: string[] = [];
    let state = createGameplayState();
    for (const event of events) {
      const applied = applyGameplayEvent(state, event);
      appliedTypes.push(applied.result.type);
      state = applied.state;
    }

    expect(appliedTypes).toEqual(events.map((event) => event.type));
    expect(state.characters["character:felix"]?.unlockedSkills).toEqual(["skill:logic"]);
  });

  it("returns observable applied results with updated state", () => {
    const result = applyGameplayEvent(createGameplayState(), { type: "grant-item", itemId: "gift:coffee", quantity: 1 });

    expect(result.result).toMatchObject({
      type: "grant-item",
      itemId: "gift:coffee",
      previousQuantity: 0,
      nextQuantity: 1,
      applied: true
    });
    expect(result.state.inventory.items).toEqual({ "gift:coffee": 1 });
  });

  it("returns observable no-op results without hidden mutation", () => {
    const initial = grantEvidence(grantItem(createGameplayState(), "gift:coffee", 1), "evidence:keycard");
    const missingItem = applyGameplayEvent(initial, { type: "consume-item", itemId: "gift:coffee", quantity: 2 });
    const duplicateEvidence = applyGameplayEvent(initial, { type: "grant-evidence", evidenceId: "evidence:keycard" });

    expect(missingItem.state).toBe(initial);
    expect(missingItem.result).toMatchObject({ applied: false, reason: "insufficient-quantity" });
    expect(duplicateEvidence.state).toBe(initial);
    expect(duplicateEvidence.result).toMatchObject({ applied: false, reason: "already-owned" });
  });
});
