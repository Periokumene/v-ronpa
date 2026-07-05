import { describe, expect, it } from "vitest";
import { resolveGameAVnLaunchTarget, shouldAutoStartGameAVnLaunchTarget } from "./devVnLaunchTarget";

describe("game-a VN launch target", () => {
  it("resolves a dev vnStart URL parameter into an auto-start label override", () => {
    expect(resolveGameAVnLaunchTarget({ devMode: true, search: "?vnStart=DBG_RAIN" })).toEqual({
      requested: true,
      autoStart: true,
      startLabelOverride: "DBG_RAIN"
    });
  });

  it("normalizes a decoded local label prefix", () => {
    expect(resolveGameAVnLaunchTarget({ devMode: true, search: "?vnStart=%23DBG_RAIN" })).toEqual({
      requested: true,
      autoStart: true,
      startLabelOverride: "DBG_RAIN"
    });
  });

  it("treats an empty vnStart parameter as an invalid requested target", () => {
    expect(resolveGameAVnLaunchTarget({ devMode: true, search: "?vnStart=" })).toEqual({
      requested: true,
      autoStart: false,
      error: {
        code: "empty-start-label",
        message: "VN debug start label is empty. Use ?vnStart=<label>."
      }
    });
  });

  it("ignores vnStart outside dev mode", () => {
    expect(resolveGameAVnLaunchTarget({ devMode: false, search: "?vnStart=DBG_RAIN" })).toEqual({
      requested: false,
      autoStart: false
    });
  });

  it("auto-starts only when a requested label has no runtime start-label error", () => {
    const target = resolveGameAVnLaunchTarget({ devMode: true, search: "?vnStart=DBG_RAIN" });

    expect(shouldAutoStartGameAVnLaunchTarget({ target, hasInvalidStartLabel: false })).toBe(true);
    expect(shouldAutoStartGameAVnLaunchTarget({ target, hasInvalidStartLabel: true })).toBe(false);
    expect(
      shouldAutoStartGameAVnLaunchTarget({
        target: resolveGameAVnLaunchTarget({ devMode: true, search: "?vnStart=" }),
        hasInvalidStartLabel: false
      })
    ).toBe(false);
  });
});
