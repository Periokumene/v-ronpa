import { describe, expect, it } from "vitest";
import { resolveGameADevViewportLayout } from "./gameADevViewportLayout";

describe("Game A DEV viewport layout", () => {
  it("preserves the browser-sized logical viewport and letterboxes the display cell", () => {
    expect(resolveGameADevViewportLayout({
      browser: { width: 1280, height: 720 },
      cell: { width: 845, height: 720 },
      mode: "fidelity"
    })).toEqual({
      logicalWidth: 1280,
      logicalHeight: 720,
      displayWidth: 845,
      displayHeight: 475.3125,
      offsetX: 0,
      offsetY: 122.34375,
      scale: 0.66015625
    });
  });

  it("returns a one-to-one layout when the Dock is collapsed", () => {
    expect(resolveGameADevViewportLayout({
      browser: { width: 1280, height: 720 },
      cell: { width: 1280, height: 720 },
      mode: "fidelity"
    })).toEqual({
      logicalWidth: 1280,
      logicalHeight: 720,
      displayWidth: 1280,
      displayHeight: 720,
      offsetX: 0,
      offsetY: 0,
      scale: 1
    });
  });

  it("uses the remaining cell as the only logical viewport in responsive mode", () => {
    expect(resolveGameADevViewportLayout({
      browser: { width: 1280, height: 720 },
      cell: { width: 845, height: 720 },
      mode: "responsive"
    })).toEqual({
      logicalWidth: 845,
      logicalHeight: 720,
      displayWidth: 845,
      displayHeight: 720,
      offsetX: 0,
      offsetY: 0,
      scale: 1
    });
  });

  it("keeps pre-measurement and invalid sizes finite", () => {
    const layout = resolveGameADevViewportLayout({
      browser: { width: Number.NaN, height: Number.POSITIVE_INFINITY },
      cell: { width: 0, height: -10 },
      mode: "fidelity"
    });
    expect(layout).toEqual({
      logicalWidth: 1,
      logicalHeight: 1,
      displayWidth: 1,
      displayHeight: 1,
      offsetX: 0,
      offsetY: 0,
      scale: 1
    });
  });
});
