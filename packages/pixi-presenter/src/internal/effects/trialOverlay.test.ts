import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { TrialOverlaySystem } from "./trialOverlay";

describe("TrialOverlaySystem", () => {
  it("owns Trial hints independently from transient effects", () => {
    let width = 960;
    const root = new Container();
    const trial = new TrialOverlaySystem({ root, width: () => width, height: () => 540 });

    trial.run([
      { type: "flash", color: "#fff", durationMs: 10 },
      { type: "trial-keyword", keywordId: "k1", text: "Contradiction" }
    ]);
    const layer = root.getChildByLabel("trial-overlay") as Container;
    expect(layer.children).toHaveLength(1);
    expect(layer.children[0]?.x).toBe(600);

    width = 800;
    trial.relayoutViewport();
    expect(layer.children[0]?.x).toBe(440);
    trial.clear();
    expect(layer.children).toHaveLength(0);

    expect(() => trial.clear()).not.toThrow();
    trial.destroy();
    expect(root.getChildByLabel("trial-overlay")).toBeNull();
  });
});
