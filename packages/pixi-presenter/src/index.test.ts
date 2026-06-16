import { describe, expect, it } from "vitest";
import { createPixiPresenter } from "./index";

describe("pixi presenter port", () => {
  it("keeps non-Pixi presentation commands no-op safe while preserving memory snapshots", () => {
    const host = {
      clientWidth: 960,
      clientHeight: 540,
      appendChild() {
        throw new Error("mount should not be required for memory behavior");
      }
    } as unknown as HTMLElement;
    const presenter = createPixiPresenter({ host });
    const command = {
      type: "print",
      speaker: "Felix",
      text: "This stays in the contract-observable command log.",
      autoNext: false
    } as const;

    expect(() => presenter.apply(command)).not.toThrow();
    expect(presenter.snapshot()).toEqual({
      portraits: [],
      commands: [command],
      activeEffects: []
    });

    presenter.clear();
    expect(presenter.snapshot()).toEqual({
      portraits: [],
      commands: [],
      activeEffects: []
    });
  });
});
