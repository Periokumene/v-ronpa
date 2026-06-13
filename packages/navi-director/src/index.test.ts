import { describe, expect, it } from "vitest";
import type { WorldMapDef } from "@v-ronpa/contracts";
import { createGameplayState } from "@v-ronpa/gameplay";
import { createInitialNaviState, naviReducer, resolveNaviInteractable } from "./index";

describe("navi director", () => {
  it("keeps walk, inventory, and vn2d overlay as Navi substates", () => {
    let navi = createInitialNaviState("map:hall");
    navi = naviReducer(navi, { type: "OPEN_INVENTORY" });
    expect(navi).toMatchObject({ substate: "inventory", inputLock: "inventory" });

    navi = naviReducer(navi, { type: "START_VN2D", script: "opening.nani", interactableId: "i:witness" });
    expect(navi).toMatchObject({
      substate: "vn2d-overlay",
      overlayScript: "opening.nani",
      activeInteractableId: "i:witness",
      inputLock: "dialog"
    });
  });

  it("resolves interactables without renderer state", () => {
    const map: WorldMapDef = {
      id: "map:hall",
      name: "Hall",
      spawn: [0, 0, 0],
      collisionProxyIds: [],
      interactables: [
        {
          id: "i:file",
          label: "Case File",
          position: [1, 0, 0],
          radius: 1,
          action: { type: "grant-item", itemId: "evidence:keycard", quantity: 1 }
        }
      ],
      assetRefs: []
    };

    const result = resolveNaviInteractable(createInitialNaviState(map.id), map, createGameplayState(), "i:file");
    expect(result).toMatchObject({
      navi: { substate: "walk", activeInteractableId: "i:file" },
      gameplay: { inventory: { items: { "evidence:keycard": 1 } } },
      outcome: { type: "grant-item" }
    });
  });
});
