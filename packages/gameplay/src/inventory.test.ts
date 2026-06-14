import { describe, expect, it } from "vitest";
import { applyGameplayEvent, consumeItem, createGameplayState, grantItem, removeItem } from "./index";

describe("inventory", () => {
  it("grants item quantity by incrementing existing entries", () => {
    const state = grantItem(grantItem(createGameplayState(), "gift:coffee", 2), "gift:coffee", 3);

    expect(state.inventory.items).toEqual({ "gift:coffee": 5 });
  });

  it("removes item quantity and keeps remaining entries", () => {
    const state = removeItem(grantItem(createGameplayState(), "tool:lockpick", 4), "tool:lockpick", 2);

    expect(state.inventory.items).toEqual({ "tool:lockpick": 2 });
  });

  it("consumes items with observable success and failure results", () => {
    const initial = grantItem(createGameplayState(), "gift:tea", 2);
    const consumed = consumeItem(initial, "gift:tea", 1);
    const failed = consumeItem(consumed.state, "gift:tea", 2);

    expect(consumed.result).toMatchObject({
      type: "consume-item",
      itemId: "gift:tea",
      previousQuantity: 2,
      nextQuantity: 1,
      applied: true,
      success: true
    });
    expect(failed.result).toMatchObject({
      type: "consume-item",
      previousQuantity: 1,
      nextQuantity: 1,
      applied: false,
      success: false,
      reason: "insufficient-quantity"
    });
    expect(failed.state).toBe(consumed.state);
  });

  it("clamps remove and consume at zero and removes zero-quantity entries", () => {
    const removed = removeItem(grantItem(createGameplayState(), "tool:key", 2), "tool:key", 99);
    const consumed = consumeItem(grantItem(createGameplayState(), "tool:badge", 1), "tool:badge", 1);

    expect(removed.inventory.items).toEqual({});
    expect(consumed.state.inventory.items).toEqual({});
    expect(consumed.result.nextQuantity).toBe(0);
  });

  it("keeps grant-item scoped to inventory without mutating evidence", () => {
    const initial = {
      ...createGameplayState(),
      evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] }
    };
    const result = applyGameplayEvent(initial, { type: "grant-item", itemId: "evidence:fake", quantity: 1 });

    expect(result.state.inventory.items).toEqual({ "evidence:fake": 1 });
    expect(result.state.evidence).toBe(initial.evidence);
  });
});
