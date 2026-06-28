import { describe, expect, it } from "vitest";
import { VisualEffectScheduler } from "./effects";

describe("visual effect scheduler", () => {
  it("ticks queued fade flash and shake effects to completion", () => {
    const scheduler = new VisualEffectScheduler();
    const target = { alpha: 0, x: 0, y: 0 };
    const flash = { alpha: 0.5, x: 0, y: 0 };
    const shaken = { alpha: 1, x: 0, y: 0 };
    let flashCompleted = false;

    scheduler.enqueue({ kind: "fadeIn", durationMs: 100, target });
    scheduler.enqueue({
      kind: "flash",
      durationMs: 80,
      target: flash,
      onComplete: () => {
        flashCompleted = true;
      }
    });
    scheduler.enqueue({ kind: "shake", durationMs: 100, target: shaken, intensity: 0.5 });

    expect(scheduler.activeCount()).toBe(3);
    scheduler.tick(25);

    expect(target.alpha).toBeGreaterThan(0);
    expect(flash.alpha).toBeLessThan(0.5);
    expect(shaken.x).not.toBe(0);

    scheduler.tick(100);

    expect(scheduler.activeCount()).toBe(0);
    expect(target.alpha).toBe(1);
    expect(shaken.x).toBe(0);
    expect(shaken.y).toBe(0);
    expect(flashCompleted).toBe(true);
  });

  it("cleans active and pending effects on clear and destroy", () => {
    const scheduler = new VisualEffectScheduler();
    const target = { alpha: 0, x: 0, y: 0 };
    let completed = 0;

    scheduler.enqueue({
      kind: "fadeIn",
      durationMs: 500,
      target,
      onComplete: () => {
        completed += 1;
      }
    });
    scheduler.tick(50);
    expect(scheduler.activeCount()).toBe(1);

    scheduler.clear();
    expect(scheduler.activeCount()).toBe(0);
    expect(completed).toBe(1);

    scheduler.enqueue({ kind: "flash", durationMs: 100, target });
    scheduler.destroy();
    scheduler.enqueue({ kind: "shake", durationMs: 100, target });
    expect(scheduler.activeCount()).toBe(0);
  });
});
