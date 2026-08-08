import { describe, expect, it } from "vitest";
import {
  PERSISTENT_SCREEN_EFFECT_KEYS,
  TRANSIENT_EFFECT_HINT_TYPES,
  WEATHER_EFFECT_KINDS
} from "./registries";

describe("Pixi effect family registries", () => {
  it("pins the complete weather family and macro layer order", () => {
    expect(WEATHER_EFFECT_KINDS).toEqual(["rain", "snow", "sun"]);
  });

  it("pins persistent root filter order", () => {
    expect(PERSISTENT_SCREEN_EFFECT_KEYS).toEqual(["bokeh", "waterVeil", "pulse", "staticFilter", "glitch", "vignette"]);
  });

  it("pins transient hint ownership without Trial overlays", () => {
    expect(TRANSIENT_EFFECT_HINT_TYPES).toEqual([
      "flash", "shake", "glitch", "impact", "afterimage", "shutter", "flicker"
    ]);
    expect(TRANSIENT_EFFECT_HINT_TYPES).not.toContain("trial-keyword");
    expect(TRANSIENT_EFFECT_HINT_TYPES).not.toContain("trial-subtitle");
  });

  it("does not permit duplicate family registration", () => {
    for (const registry of [WEATHER_EFFECT_KINDS, PERSISTENT_SCREEN_EFFECT_KEYS, TRANSIENT_EFFECT_HINT_TYPES]) {
      expect(new Set(registry).size).toBe(registry.length);
    }
  });
});
