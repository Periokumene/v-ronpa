import type { GameplayState } from "./state";

export type InventoryResultReason = "invalid-quantity" | "insufficient-quantity";

export interface InventoryMutationResult {
  type: "grant-item" | "remove-item" | "consume-item";
  itemId: string;
  quantity: number;
  previousQuantity: number;
  nextQuantity: number;
  applied: boolean;
  reason?: InventoryResultReason;
}

export interface ConsumeItemResult extends InventoryMutationResult {
  type: "consume-item";
  success: boolean;
}

export function grantItem(state: GameplayState, itemId: string, quantity = 1): GameplayState {
  return grantItemWithResult(state, itemId, quantity).state;
}

export function grantItemWithResult(
  state: GameplayState,
  itemId: string,
  quantity = 1
): { state: GameplayState; result: InventoryMutationResult } {
  const previousQuantity = getCurrentQuantity(state, itemId);
  if (!isPositiveInteger(quantity)) {
    return {
      state,
      result: {
        type: "grant-item",
        itemId,
        quantity,
        previousQuantity,
        nextQuantity: previousQuantity,
        applied: false,
        reason: "invalid-quantity"
      }
    };
  }

  const nextQuantity = previousQuantity + quantity;
  return {
    state: setItemQuantity(state, itemId, nextQuantity),
    result: {
      type: "grant-item",
      itemId,
      quantity,
      previousQuantity,
      nextQuantity,
      applied: true
    }
  };
}

export function removeItem(state: GameplayState, itemId: string, quantity = 1): GameplayState {
  return removeItemWithResult(state, itemId, quantity).state;
}

export function removeItemWithResult(
  state: GameplayState,
  itemId: string,
  quantity = 1
): { state: GameplayState; result: InventoryMutationResult } {
  const previousQuantity = getCurrentQuantity(state, itemId);
  if (!isPositiveInteger(quantity)) {
    return {
      state,
      result: {
        type: "remove-item",
        itemId,
        quantity,
        previousQuantity,
        nextQuantity: previousQuantity,
        applied: false,
        reason: "invalid-quantity"
      }
    };
  }

  const nextQuantity = Math.max(0, previousQuantity - quantity);
  return {
    state: previousQuantity === nextQuantity ? state : setItemQuantity(state, itemId, nextQuantity),
    result: {
      type: "remove-item",
      itemId,
      quantity,
      previousQuantity,
      nextQuantity,
      applied: previousQuantity !== nextQuantity
    }
  };
}

export function consumeItem(
  state: GameplayState,
  itemId: string,
  quantity = 1
): { state: GameplayState; result: ConsumeItemResult } {
  const previousQuantity = getCurrentQuantity(state, itemId);
  if (!isPositiveInteger(quantity)) {
    return {
      state,
      result: {
        type: "consume-item",
        itemId,
        quantity,
        previousQuantity,
        nextQuantity: previousQuantity,
        applied: false,
        success: false,
        reason: "invalid-quantity"
      }
    };
  }

  if (previousQuantity < quantity) {
    return {
      state,
      result: {
        type: "consume-item",
        itemId,
        quantity,
        previousQuantity,
        nextQuantity: previousQuantity,
        applied: false,
        success: false,
        reason: "insufficient-quantity"
      }
    };
  }

  const nextQuantity = previousQuantity - quantity;
  return {
    state: setItemQuantity(state, itemId, nextQuantity),
    result: {
      type: "consume-item",
      itemId,
      quantity,
      previousQuantity,
      nextQuantity,
      applied: true,
      success: true
    }
  };
}

export function getInventoryItemQuantity(state: GameplayState, itemId: string): number {
  return getCurrentQuantity(state, itemId);
}

function getCurrentQuantity(state: GameplayState, itemId: string): number {
  return state.inventory.items[itemId] ?? 0;
}

function setItemQuantity(state: GameplayState, itemId: string, quantity: number): GameplayState {
  const items = { ...state.inventory.items };
  if (quantity <= 0) {
    delete items[itemId];
  } else {
    items[itemId] = quantity;
  }

  return {
    ...state,
    inventory: { items }
  };
}

function isPositiveInteger(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0;
}
