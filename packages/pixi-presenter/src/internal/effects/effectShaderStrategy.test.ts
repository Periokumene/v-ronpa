import { describe, expect, it } from "vitest";
import { PULSE_FRAGMENT_SOURCE } from "./pulse";
import { SIGNAL_MASK_FRAGMENT_SOURCE } from "./signalMask";
import { STATIC_FILTER_FRAGMENT_SOURCE } from "./staticFilter";
import { AFTERIMAGE_FRAGMENT_SOURCE } from "./transient/afterimage";
import { FLICKER_FRAGMENT_SOURCE } from "./transient/flicker";
import { IMPACT_FRAGMENT_SOURCE } from "./transient/impact";
import { SHUTTER_FRAGMENT_SOURCE } from "./transient/shutter";
import { VIGNETTE_FRAGMENT_SOURCE } from "./vignette";
import { WATER_VEIL_FRAGMENT_SOURCE } from "./waterVeil";

const sources = {
  impact: IMPACT_FRAGMENT_SOURCE,
  afterimage: AFTERIMAGE_FRAGMENT_SOURCE,
  shutter: SHUTTER_FRAGMENT_SOURCE,
  flicker: FLICKER_FRAGMENT_SOURCE,
  vignette: VIGNETTE_FRAGMENT_SOURCE,
  staticFilter: STATIC_FILTER_FRAGMENT_SOURCE,
  waterVeil: WATER_VEIL_FRAGMENT_SOURCE,
  pulse: PULSE_FRAGMENT_SOURCE,
  signalMask: SIGNAL_MASK_FRAGMENT_SOURCE,
};

function mainBody(source: string): string {
  return source.slice(source.indexOf("void main"));
}

function expectStrategy(source: string, markers: readonly string[]): void {
  const body = mainBody(source);
  for (const marker of markers) expect(body, `missing shader strategy marker '${marker}'`).toContain(marker);
}

describe("independent effect shader strategies", () => {
  it("keeps every effect independent from the removed Lab mode and anonymous uniforms", () => {
    for (const source of Object.values(sources)) {
      expect(source).not.toContain("uMode");
      expect(source).not.toMatch(/\bu[A-H]\b/u);
    }
  });

  it("preserves the directional impact envelope, rebound, streak and edge flash", () => {
    expectStrategy(IMPACT_FRAGMENT_SOURCE, [
      "rebound",
      "uResolution.x",
      "edgeAt(warped",
      "streak * 2.2",
      "edge * envelope",
    ]);
  });

  it("extracts afterimage edges from four history samples instead of tinting whole frames", () => {
    expectStrategy(AFTERIMAGE_FRAGMENT_SOURCE, [
      "history0",
      "history1",
      "history2",
      "history3",
      "gradientX",
      "echoWeight = edge * uEdge * uPower",
    ]);
  });

  it("preserves shutter eyelid irregularity, lens pinch and desaturation", () => {
    expectStrategy(SHUTTER_FRAGMENT_SOURCE, [
      "sin(uv.x * 9.0",
      "pinched",
      "luminance(lens)",
      "amount * 0.62",
    ]);
  });

  it("preserves flicker afterburn, four operation classes and posterization", () => {
    expectStrategy(FLICKER_FRAGMENT_SOURCE, [
      "afterburn",
      "mod(event + floor(abs(uSeed)), 4.0)",
      "abs(color * 2.0 - 1.0)",
      "posterized",
    ]);
  });

  it("preserves organic vignette boundaries and luminance grading", () => {
    expectStrategy(VIGNETTE_FRAGMENT_SOURCE, [
      "organic",
      "noise21(point * 3.0",
      "luminance(graded)",
      "vignette * uPower * 0.35",
    ]);
  });

  it("preserves static-filter channel separation and seeded discrete noise cadence", () => {
    expectStrategy(STATIC_FILTER_FRAGMENT_SOURCE, [
      "floor(uTime * 47.0)",
      "color.r = currentAt",
      "color.b = currentAt",
      "lineRandom",
    ]);
    expect(STATIC_FILTER_FRAGMENT_SOURCE).toContain("+ uSeed * 311.7");
  });

  it("consumes water drift and blur while retaining smooth flow and droplet trails", () => {
    expectStrategy(WATER_VEIL_FRAGMENT_SOURCE, [
      "uTime * uDrift",
      "noise21(vec2",
      "trail",
      "blurStep",
      "uBlur * uPower",
    ]);
  });

  it("uses full-frame pulse edge shells, distortion and chroma history sampling", () => {
    expectStrategy(PULSE_FRAGMENT_SOURCE, [
      "angularWarp",
      "uDistortion",
      "uResolution",
      "history3",
      "uChroma * 0.003",
      "gradientX",
    ]);
  });

  it("keeps SignalMask full-body while retaining mosaic, posterization and linear speed cadence", () => {
    expect(SIGNAL_MASK_FRAGMENT_SOURCE).not.toContain("region");
    expectStrategy(SIGNAL_MASK_FRAGMENT_SOURCE, [
      "floor(uTime * 18.0)",
      "floor(uTime * 31.0)",
      "mosaic",
      "levels",
      "source.a",
    ]);
  });
});
