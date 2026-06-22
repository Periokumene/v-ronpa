import { describe, expect, it } from "vitest";
import type { WorldMapDef } from "@v-ronpa/contracts";
import {
  applyExplorationOutcome,
  createGameplayState,
  grantEvidence,
  nearestInteractable,
  resolveInteractable
} from "./index";

describe("exploration", () => {
  it("resolves the nearest interactable to an exploration outcome", () => {
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
        }
      ],
      assetRefs: []
    };

    const outcome = resolveInteractable(nearestInteractable(map, [1.2, 0, 0]));

    expect(outcome).toEqual({ type: "grant-evidence", evidenceId: "evidence:keycard" });
  });

  it("resolves trial entry interactables as director-owned outcomes", () => {
    const map: WorldMapDef = {
      id: "map:hall",
      name: "Hall",
      spawn: [0, 0, 0],
      collisionProxyIds: [],
      interactables: [
        {
          id: "i:trial-door",
          label: "Trial Door",
          position: [0, 0, 0],
          radius: 1.5,
          action: { type: "start-trial", trialId: "trial:case-01", segmentId: "debate:door" }
        }
      ],
      assetRefs: []
    };

    expect(resolveInteractable(nearestInteractable(map, [0, 0, 0]))).toEqual({
      type: "start-trial",
      trialId: "trial:case-01",
      segmentId: "debate:door"
    });
  });

  it("selects the closest interactable inside radius while preserving map order for ties", () => {
    const map: WorldMapDef = {
      id: "map:hall",
      name: "Hall",
      spawn: [0, 0, 0],
      collisionProxyIds: [],
      interactables: [
        {
          id: "i:first-tie",
          label: "First Tie",
          position: [-1, 0, 0],
          radius: 2,
          action: { type: "grant-item", itemId: "tool:first", quantity: 1 }
        },
        {
          id: "i:closer",
          label: "Closer",
          position: [0.25, 0, 0],
          radius: 2,
          action: { type: "grant-item", itemId: "tool:closer", quantity: 1 }
        },
        {
          id: "i:second-tie",
          label: "Second Tie",
          position: [1, 0, 0],
          radius: 2,
          action: { type: "grant-item", itemId: "tool:second", quantity: 1 }
        }
      ],
      assetRefs: []
    };

    const firstTie = map.interactables[0];
    const secondTie = map.interactables[2];

    expect(nearestInteractable(map, [0, 0, 0])?.id).toBe("i:closer");
    expect(nearestInteractable({ ...map, interactables: [firstTie!, secondTie!] }, [0, 0, 0])?.id).toBe("i:first-tie");
  });

  it("returns no interactable when every candidate is outside its radius", () => {
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

    expect(nearestInteractable(map, [0, 0, 0])).toBeUndefined();
    expect(resolveInteractable(nearestInteractable(map, [0, 0, 0]))).toEqual({ type: "none" });
  });

  it("applies gameplay-owned outcomes only to gameplay state", () => {
    const item = applyExplorationOutcome(createGameplayState(), {
      type: "grant-item",
      itemId: "gift:coffee",
      quantity: 1
    });
    const evidence = applyExplorationOutcome(item.state, { type: "grant-evidence", evidenceId: "evidence:keycard" });
    const character = applyExplorationOutcome(evidence.state, {
      type: "character-state",
      characterId: "character:felix",
      affinityDelta: 10
    });

    expect(item.state.inventory.items).toEqual({ "gift:coffee": 1 });
    expect(item.state.evidence.ownedEvidenceIds).toEqual([]);
    expect(evidence.state.evidence.ownedEvidenceIds).toEqual(["evidence:keycard"]);
    expect(character.state.characters["character:felix"]?.affinity).toBe(10);
    expect(character.result).toMatchObject({ type: "gameplay-event", owner: "gameplay", applied: true });
  });

  it("returns director-owned start-script results without mutating gameplay", () => {
    const initial = grantEvidence(createGameplayState(), "evidence:keycard");
    const applied = applyExplorationOutcome(initial, {
      type: "start-script",
      script: "case.nani",
      label: "Intro"
    });

    expect(applied.state).toBe(initial);
    expect(applied.result).toEqual({
      type: "start-script",
      owner: "director",
      applied: false,
      script: "case.nani",
      label: "Intro"
    });
  });

  it("returns director-owned start-trial results without mutating gameplay", () => {
    const initial = grantEvidence(createGameplayState(), "evidence:keycard");
    const applied = applyExplorationOutcome(initial, {
      type: "start-trial",
      trialId: "trial:case-01",
      segmentId: "debate:door"
    });

    expect(applied.state).toBe(initial);
    expect(applied.result).toEqual({
      type: "start-trial",
      owner: "director",
      applied: false,
      trialId: "trial:case-01",
      segmentId: "debate:door"
    });
  });

  it("returns director-owned map changes without mutating gameplay", () => {
    const initial = createGameplayState();
    const applied = applyExplorationOutcome(initial, {
      type: "change-map",
      mapId: "map:classroom",
      pose: { position: [0, 1.7, 2], yaw: 3.14, pitch: 0 }
    });

    expect(applied.state).toBe(initial);
    expect(applied.result).toEqual({
      type: "change-map",
      owner: "director",
      applied: false,
      mapId: "map:classroom",
      pose: { position: [0, 1.7, 2], yaw: 3.14, pitch: 0 }
    });
  });

  it("leaves gameplay unchanged for none outcomes", () => {
    const initial = createGameplayState();
    const applied = applyExplorationOutcome(initial, { type: "none" });

    expect(applied.state).toBe(initial);
    expect(applied.result).toEqual({ type: "none", owner: "none", applied: false });
  });
});
