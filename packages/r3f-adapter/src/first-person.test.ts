import { describe, expect, it } from "vitest";
import { clampVectorToAabb, yawPitchToFacingVector } from "./first-person";

const bounds = {
  min: [-3, 0, -4] as [number, number, number],
  max: [3, 2, 4] as [number, number, number]
};

describe("first-person helpers", () => {
  it("keeps an in-bounds vector unchanged", () => {
    expect(clampVectorToAabb([1, 1.7, -1], bounds)).toEqual([1, 1.7, -1]);
  });

  it("clips below min and above max AABB boundaries", () => {
    expect(clampVectorToAabb([-4, -1, 5], bounds)).toEqual([-3, 0, 4]);
    expect(clampVectorToAabb([4, 3, -5], bounds)).toEqual([3, 2, -4]);
  });

  it("converts yaw and pitch to a facing vector for sensor reports", () => {
    expect(yawPitchToFacingVector({ yaw: 0, pitch: 0 })).toEqual([0, 0, -1]);
    expect(yawPitchToFacingVector({ yaw: Math.PI / 2, pitch: 0 })[0]).toBeCloseTo(1);
  });
});
