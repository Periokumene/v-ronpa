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
          action: { type: "grant-evidence", evidenceId: "evidence:keycard" }
        }
      ],
      assetRefs: []
    };

    const result = resolveNaviInteractable(createInitialNaviState(map.id), map, createGameplayState(), "i:file");
    expect(result).toMatchObject({
      navi: { substate: "walk", activeInteractableId: "i:file" },
      gameplay: { evidence: { ownedEvidenceIds: ["evidence:keycard"] } },
      outcome: { type: "grant-evidence" }
    });
  });

  it("resolves map changes as Navi-owned state", () => {
    const map: WorldMapDef = {
      id: "map:hall",
      name: "Hall",
      spawn: [0, 0, 0],
      collisionProxyIds: [],
      interactables: [
        {
          id: "i:door",
          label: "Door",
          position: [0, 0, -1],
          radius: 1,
          action: {
            type: "change-map",
            mapId: "map:classroom",
            pose: { position: [0, 1.7, 2], yaw: 3.14, pitch: 0 }
          }
        }
      ],
      assetRefs: []
    };

    const gameplay = createGameplayState();
    const result = resolveNaviInteractable(createInitialNaviState(map.id), map, gameplay, "i:door");

    expect(result.gameplay).toBe(gameplay);
    expect(result).toMatchObject({
      navi: {
        substate: "walk",
        activeMapId: "map:classroom",
        playerPose: { position: [0, 1.7, 2], yaw: 3.14, pitch: 0 },
        inputLock: "none"
      },
      outcome: { type: "change-map", mapId: "map:classroom" }
    });
  });
});
