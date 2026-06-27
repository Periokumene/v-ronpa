import { describe, expect, it } from "vitest";
import { calculatePortraitLayout, formatFallbackPortraitLabel } from "./portraits";

describe("pixi portrait helpers", () => {
  it("computes deterministic left center right slots from renderer size", () => {
    expect(calculatePortraitLayout(1000, 600, "left")).toEqual({
      slot: "left",
      x: 240,
      y: 540,
      maxWidth: 260,
      maxHeight: 408
    });
    expect(calculatePortraitLayout(1000, 600, "center").x).toBe(500);
    expect(calculatePortraitLayout(1000, 600, "right").x).toBe(760);
  });

  it("labels missing portrait fallbacks without requiring a manifest", () => {
    expect(formatFallbackPortraitLabel("character:felix", "portrait:felix:missing")).toContain("MISSING");
    expect(formatFallbackPortraitLabel("character:mira", undefined)).toContain("NO PORTRAIT");
  });
});
