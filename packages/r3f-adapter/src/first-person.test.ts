import { describe, expect, it } from "vitest";
import type { InteractableDef } from "@v-ronpa/contracts";
import { clampVectorToAabb, findFocusedInteractable, yawPitchToFacingVector } from "./first-person";

const bounds = {
  min: [-3, 0, -4] as [number, number, number],
  max: [3, 2, 4] as [number, number, number]
};

const hotspot: InteractableDef = {
  id: "interactable:door",
  label: "Door",
  position: [0, 1, -2],
  radius: 1.2,
  action: { type: "change-map", mapId: "map:classroom" }
};

describe("first-person helpers", () => {
  it("keeps an in-bounds vector unchanged", () => {
    expect(clampVectorToAabb([1, 1.7, -1], bounds)).toEqual([1, 1.7, -1]);
  });

  it("clips below min and above max AABB boundaries", () => {
    expect(clampVectorToAabb([-4, -1, 5], bounds)).toEqual([-3, 0, 4]);
    expect(clampVectorToAabb([4, 3, -5], bounds)).toEqual([3, 2, -4]);
  });

  it("selects an interactable when facing it within radius", () => {
    expect(
      findFocusedInteractable({
        position: [0, 1.7, -0.9],
        facing: yawPitchToFacingVector({ yaw: 0, pitch: 0 }),
        interactables: [hotspot]
      })?.id
    ).toBe("interactable:door");
  });

  it("rejects targets outside radius or outside the facing threshold", () => {
    expect(
      findFocusedInteractable({
        position: [0, 1.7, 2],
        facing: yawPitchToFacingVector({ yaw: 0, pitch: 0 }),
        interactables: [hotspot]
      })
    ).toBeUndefined();

    expect(
      findFocusedInteractable({
        position: [0, 1.7, -0.9],
        facing: yawPitchToFacingVector({ yaw: Math.PI, pitch: 0 }),
        interactables: [hotspot]
      })
    ).toBeUndefined();
  });
});
