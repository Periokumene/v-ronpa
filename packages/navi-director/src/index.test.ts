import { describe, expect, it } from "vitest";
import type { NaviRuntimeState, WorldMapDef } from "@v-ronpa/contracts";
import { createGameplayState } from "@v-ronpa/gameplay";
import {
  confirmFocusedNaviInteraction,
  createInitialNaviState,
  createNaviInteractionConfirmRequest,
  createNaviInteractionView,
  focusNaviInteractionFromSensorReport,
  focusNearestNaviInteractable,
  naviReducer,
  resolveNaviInteractable
} from "./index";

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

    navi = naviReducer(navi, { type: "CLOSE_OVERLAY" });
    expect(navi).toMatchObject({
      substate: "walk",
      activeMapId: "map:hall",
      activeInteractableId: "i:witness",
      inputLock: "none"
    });

    const walk = naviReducer(navi, { type: "CLOSE_OVERLAY" });
    expect(walk).toEqual(navi);
  });

  it("focuses the nearest interactable from the current player pose", () => {
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
          radius: 1.5,
          action: { type: "grant-evidence", evidenceId: "evidence:keycard" }
        },
        {
          id: "i:notebook",
          label: "Notebook",
          position: [0.2, 0, 0],
          radius: 1.5,
          action: { type: "grant-item", itemId: "tool:notebook", quantity: 1 }
        }
      ],
      assetRefs: []
    };
    const navi: NaviRuntimeState = { ...createInitialNaviState(map.id), playerPose: { position: [0, 0, 0], yaw: 0, pitch: 0 } };

    const focused = focusNearestNaviInteractable(navi, map);

    expect(focused).toMatchObject({
      navi: { activeInteractableId: "i:notebook", substate: "walk", inputLock: "none" },
      outcome: { type: "focused", interactableId: "i:notebook" },
      interactable: { id: "i:notebook" }
    });
  });

  it("does not change focus while Navi input is locked by an overlay", () => {
    const map: WorldMapDef = {
      id: "map:hall",
      name: "Hall",
      spawn: [0, 0, 0],
      collisionProxyIds: [],
      interactables: [
        {
          id: "i:notebook",
          label: "Notebook",
          position: [0.2, 0, 0],
          radius: 1.5,
          action: { type: "grant-item", itemId: "tool:notebook", quantity: 1 }
        }
      ],
      assetRefs: []
    };
    const walk: NaviRuntimeState = { ...createInitialNaviState(map.id), playerPose: { position: [0, 0, 0], yaw: 0, pitch: 0 } };
    const inventory = naviReducer(walk, { type: "OPEN_INVENTORY" });

    expect(focusNearestNaviInteractable(inventory, map)).toEqual({
      navi: inventory,
      outcome: { type: "none" }
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

  it("confirms the active focused interactable and keeps missing focus as a no-op", () => {
    const map: WorldMapDef = {
      id: "map:hall",
      name: "Hall",
      spawn: [0, 0, 0],
      collisionProxyIds: [],
      interactables: [
        {
          id: "i:notebook",
          label: "Notebook",
          position: [0, 0, 0],
          radius: 1,
          action: { type: "grant-item", itemId: "tool:notebook", quantity: 1 }
        },
        {
          id: "i:witness",
          label: "Witness",
          position: [1, 0, 0],
          radius: 1,
          action: { type: "start-script", script: "case.nani", label: "Start" }
        }
      ],
      assetRefs: []
    };
    const gameplay = createGameplayState();
    const noFocus = confirmFocusedNaviInteraction(createInitialNaviState(map.id), map, gameplay);
    const invalidNavi = { ...createInitialNaviState(map.id), activeInteractableId: "i:missing" };
    const invalidFocus = confirmFocusedNaviInteraction(invalidNavi, map, gameplay);
    const item = confirmFocusedNaviInteraction(
      { ...createInitialNaviState(map.id), activeInteractableId: "i:notebook" },
      map,
      gameplay
    );
    const script = confirmFocusedNaviInteraction(
      { ...createInitialNaviState(map.id), activeInteractableId: "i:witness" },
      map,
      gameplay
    );

    expect(noFocus).toEqual({ navi: createInitialNaviState(map.id), gameplay, outcome: { type: "none" } });
    expect(invalidFocus).toEqual({ navi: invalidNavi, gameplay, outcome: { type: "none" } });
    expect(item).toMatchObject({
      navi: { activeInteractableId: "i:notebook" },
      gameplay: { inventory: { items: { "tool:notebook": 1 } } },
      outcome: { type: "grant-item" }
    });
    expect(script).toMatchObject({
      navi: {
        substate: "vn2d-overlay",
        inputLock: "dialog",
        overlayScript: "case.nani",
        activeInteractableId: "i:witness"
      },
      gameplay,
      outcome: { type: "start-script", script: "case.nani" }
    });
  });

  it("does not confirm or resolve interactables while Navi input is locked", () => {
    const map: WorldMapDef = {
      id: "map:hall",
      name: "Hall",
      spawn: [0, 0, 0],
      collisionProxyIds: [],
      interactables: [
        {
          id: "i:notebook",
          label: "Notebook",
          position: [0, 0, 0],
          radius: 1,
          action: { type: "grant-item", itemId: "tool:notebook", quantity: 1 }
        }
      ],
      assetRefs: []
    };
    const gameplay = createGameplayState();
    const dialog: NaviRuntimeState = {
      ...createInitialNaviState(map.id),
      activeInteractableId: "i:notebook",
      substate: "vn2d-overlay",
      inputLock: "dialog",
      overlayScript: "case.nani"
    };
    const inventory = naviReducer({ ...createInitialNaviState(map.id), activeInteractableId: "i:notebook" }, {
      type: "OPEN_INVENTORY"
    });

    expect(confirmFocusedNaviInteraction(dialog, map, gameplay)).toEqual({
      navi: dialog,
      gameplay,
      outcome: { type: "none" }
    });
    expect(resolveNaviInteractable(inventory, map, gameplay, "i:notebook")).toEqual({
      navi: inventory,
      gameplay,
      outcome: { type: "none" }
    });
  });

  it("keeps focus safe when player pose or nearby interactables are missing", () => {
    const map: WorldMapDef = {
      id: "map:hall",
      name: "Hall",
      spawn: [0, 0, 0],
      collisionProxyIds: [],
      interactables: [
        {
          id: "i:far",
          label: "Far",
          position: [5, 0, 0],
          radius: 1,
          action: { type: "grant-item", itemId: "tool:far", quantity: 1 }
        }
      ],
      assetRefs: []
    };
    const missingPose = createInitialNaviState(map.id);
    const emptySpace: NaviRuntimeState = { ...missingPose, playerPose: { position: [0, 0, 0], yaw: 0, pitch: 0 } };

    expect(focusNearestNaviInteractable(missingPose, map)).toEqual({
      navi: missingPose,
      outcome: { type: "none" }
    });
    expect(focusNearestNaviInteractable(emptySpace, map)).toEqual({
      navi: emptySpace,
      outcome: { type: "none" }
    });
  });

  it("turns pose/facing sensor reports into Navi-authoritative interaction views", () => {
    const map: WorldMapDef = {
      id: "map:hall",
      name: "Hall",
      spawn: [0, 0, 0],
      collisionProxyIds: [],
      interactables: [
        {
          id: "i:file",
          label: "Case File",
          position: [0.9, 0, 0],
          radius: 1.2,
          action: { type: "grant-evidence", evidenceId: "evidence:keycard" }
        },
        {
          id: "i:notebook",
          label: "Notebook",
          position: [0.2, 0, 0],
          radius: 1,
          action: { type: "grant-item", itemId: "tool:notebook", quantity: 1 }
        }
      ],
      assetRefs: []
    };

    const result = focusNaviInteractionFromSensorReport(createInitialNaviState(map.id), map, {
      mapId: map.id,
      pose: { position: [0, 0, 0], yaw: 0, pitch: 0 },
      facing: [1, 0, 0]
    });

    expect(result).toMatchObject({
      navi: { activeInteractableId: "i:notebook", playerPose: { position: [0, 0, 0] } },
      outcome: { type: "focused", interactableId: "i:notebook" },
      view: { activeInteractableId: "i:notebook", canConfirm: true }
    });
  });

  it("validates sensor reports with Navi-owned facing rules", () => {
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
          radius: 1.2,
          action: { type: "change-map", mapId: "map:classroom" }
        }
      ],
      assetRefs: []
    };

    const away = focusNaviInteractionFromSensorReport(createInitialNaviState(map.id), map, {
      mapId: map.id,
      pose: { position: [0, 0, 0], yaw: 0, pitch: 0 },
      facing: [0, 0, 1]
    });
    const toward = focusNaviInteractionFromSensorReport(createInitialNaviState(map.id), map, {
      mapId: map.id,
      pose: { position: [0, 0, 0], yaw: 0, pitch: 0 },
      facing: [0, 0, -1]
    });

    expect(away.view).toEqual({ canConfirm: false, blockedReason: "no-target" });
    expect(toward.view).toEqual({ activeInteractableId: "i:door", canConfirm: true });
  });

  it("describes blocked and confirmable Navi interaction views", () => {
    const walk: NaviRuntimeState = {
      ...createInitialNaviState("map:hall"),
      playerPose: { position: [0, 0, 0], yaw: 0, pitch: 0 }
    };
    const focused: NaviRuntimeState = { ...walk, activeInteractableId: "i:notebook" };
    const inventory = naviReducer(focused, { type: "OPEN_INVENTORY" });

    expect(createNaviInteractionView(createInitialNaviState("map:hall"))).toEqual({
      canConfirm: false,
      blockedReason: "missing-pose"
    });
    expect(createNaviInteractionView(walk)).toEqual({
      canConfirm: false,
      blockedReason: "no-target"
    });
    expect(createNaviInteractionView(inventory)).toEqual({
      activeInteractableId: "i:notebook",
      canConfirm: false,
      blockedReason: "wrong-substate"
    });
    expect(createNaviInteractionView(focused)).toEqual({
      activeInteractableId: "i:notebook",
      canConfirm: true
    });
    expect(createNaviInteractionConfirmRequest(focused)).toEqual({
      mapId: "map:hall",
      pose: { position: [0, 0, 0], yaw: 0, pitch: 0 }
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

  it("uses the target map spawn when a map change has no explicit pose", () => {
    const hall: WorldMapDef = {
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
            mapId: "map:classroom"
          }
        }
      ],
      assetRefs: []
    };
    const classroom: WorldMapDef = {
      id: "map:classroom",
      name: "Classroom",
      spawn: [2, 1.7, -3],
      collisionProxyIds: [],
      interactables: [],
      assetRefs: []
    };

    const result = resolveNaviInteractable(createInitialNaviState(hall.id), hall, createGameplayState(), "i:door", [
      hall,
      classroom
    ]);

    expect(result).toMatchObject({
      navi: {
        activeMapId: "map:classroom",
        playerPose: { position: [2, 1.7, -3], yaw: 0, pitch: 0 },
        inputLock: "none"
      },
      outcome: { type: "change-map", mapId: "map:classroom" }
    });
  });
});
