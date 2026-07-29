import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Filter } from "pixi.js";
import { CHARACTER_TONE_PRESET_IDS } from "@v-ronpa/contracts";
import {
  characterToneTarget,
  createCharacterToneFilter,
  syncCharacterToneFilter
} from "./characterTone";

describe("character tone filter", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns finite OKLab recipes for every public preset and pins the rain reference", () => {
    for (const preset of CHARACTER_TONE_PRESET_IDS) {
      expect(Object.values(characterToneTarget(preset, 3)).every(Number.isFinite)).toBe(true);
    }
    expect(characterToneTarget("rain", 1)).toMatchObject({
      shadowL: expect.closeTo(0.48860085, 7),
      shadowA: expect.closeTo(-0.01424437, 7),
      shadowB: expect.closeTo(-0.04414515, 7),
      midtoneL: expect.closeTo(0.72102229, 7),
      midtoneA: expect.closeTo(-0.03185270, 7),
      midtoneB: expect.closeTo(-0.05002414, 7),
      highlightL: expect.closeTo(0.89076500, 7),
      highlightA: expect.closeTo(-0.01802060, 7),
      highlightB: expect.closeTo(-0.01823667, 7),
      amount: 1
    });
  });

  it("pins the accepted no-shadow-lift algorithm and amount-one half gain", () => {
    const tone = createCharacterToneFilter(characterToneTarget("rain", 1));
    const fragment = (tone.filter as Filter & { glProgram: { fragment: string } }).glProgram.fragment;

    expect(fragment).toContain("smoothstep(0.30, 0.56, baseLab.x)");
    expect(fragment).toContain("smoothstep(0.60, 0.88, baseLab.x)");
    expect(fragment).toContain("bandTarget(baseLab, uToneShadow, 0.38, 0.08)");
    expect(fragment).toContain("bandTarget(baseLab, uToneMidtone, 0.26, 0.05)");
    expect(fragment).toContain("bandTarget(baseLab, uToneHighlight, 0.10, 0.02)");
    expect(fragment).toContain("float gain = uToneAmount * 0.5;");
    expect(fragment).toContain("for (int index = 0; index < 5; index++)");
    expect(fragment).not.toMatch(/shadowLift|liftShadow|uShadowLift/u);
    expect(tone.uniforms.uToneAmount).toBe(1);
  });

  it("keeps supported overdrive uploads finite without clamping the artistic range to two", () => {
    const tone = createCharacterToneFilter(characterToneTarget("alert", 0));
    syncCharacterToneFilter(tone, characterToneTarget("alert", 3.5));
    expect(tone.uniforms.uToneAmount).toBe(3.5);

    syncCharacterToneFilter(tone, characterToneTarget("alert", Number.MAX_VALUE));
    expect(tone.uniforms.uToneAmount).toBe(1_000_000);
    expect(Number.isFinite(tone.uniforms.uToneAmount)).toBe(true);
  });
});
