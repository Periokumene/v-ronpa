import { describe, expect, it } from "vitest";
import { SurfaceFrame } from "./SurfaceFrame";

describe("SurfaceFrame", () => {
  it("defaults display surfaces to click-through and allows explicit interactive override", () => {
    expect(
      SurfaceFrame({
        "aria-label": "Dialog",
        children: "Text",
        style: { zIndex: 9 }
      }).props.style
    ).toMatchObject({ zIndex: 9, pointerEvents: "none" });

    expect(
      SurfaceFrame({
        "aria-label": "Toolbar",
        interaction: "interactive"
      }).props.style
    ).toMatchObject({ pointerEvents: "auto" });

    expect(
      SurfaceFrame({
        "aria-label": "Custom",
        pointerEvents: "all"
      }).props.style
    ).toMatchObject({ pointerEvents: "all" });
  });
});
