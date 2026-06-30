import { describe, expect, it } from "vitest";
import { shouldRenderVnAdvanceHitPlane, type VnAdvanceHitPlaneInput } from "./GameInteractionShell";

describe("GameInteractionShell VN advance hit plane", () => {
  const baseInput: VnAdvanceHitPlaneInput = {
    flowMode: "navi",
    hasActiveOverlay: false,
    hasInputPrompt: false,
    hasMovieOverlay: false,
    naviSubstate: "vn2d-overlay",
    storyActive: true,
    storyEnded: false,
    storyHasChoices: false
  };

  it("renders for primary VN mode or active Navi VN2D lines without blockers", () => {
    expect(shouldRenderVnAdvanceHitPlane(baseInput)).toBe(true);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, flowMode: "vn", naviSubstate: undefined })).toBe(true);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, flowMode: "trial" })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, naviSubstate: "walk" })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, storyActive: false })).toBe(false);
  });

  it("does not depend on dialog visibility so hidden-ui story lines can still advance", () => {
    expect(shouldRenderVnAdvanceHitPlane(baseInput)).toBe(true);
  });

  it("does not render while VN choices or runtime overlays own interaction", () => {
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, storyHasChoices: true })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, storyEnded: true })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, hasActiveOverlay: true })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, hasInputPrompt: true })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, hasMovieOverlay: true })).toBe(false);
  });
});
