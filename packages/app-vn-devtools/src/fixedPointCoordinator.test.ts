import { describe, expect, it, vi } from "vitest";
import { createVnDevtoolsFixedPointCoordinator } from "./fixedPointCoordinator";
import { createVnDevtoolsLatestTaskController } from "./sourceUpdates";

describe("Nani devtools fixed-point coordination", () => {
  it("publishes host acceptance as the HMR anchor and completes it atomically", () => {
    const changed = vi.fn();
    const coordinator = createVnDevtoolsFixedPointCoordinator(
      { target: "old", checkpoint: "old-state" },
      changed
    );

    const accepted = coordinator.accept("preview");
    expect(coordinator.current()).toEqual({ target: "preview" });
    expect(coordinator.complete(accepted, "preview-state")).toBe(true);
    expect(coordinator.current()).toEqual({ target: "preview", checkpoint: "preview-state" });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("rolls back a rejected host commit only when no later fixed-point action won", () => {
    const coordinator = createVnDevtoolsFixedPointCoordinator(
      { target: "old", checkpoint: "old-state" },
      vi.fn()
    );
    const rejected = coordinator.accept("candidate");

    expect(coordinator.rollback(rejected)).toBe(true);
    expect(coordinator.current()).toEqual({ target: "old", checkpoint: "old-state" });
  });

  it("does not resurrect an accepted target after the user unpins it", () => {
    const coordinator = createVnDevtoolsFixedPointCoordinator<string, string>({ target: "old" }, vi.fn());
    const accepted = coordinator.accept("candidate");

    coordinator.replace(undefined, undefined);

    expect(coordinator.complete(accepted, "candidate-state")).toBe(false);
    expect(coordinator.rollback(accepted)).toBe(false);
    expect(coordinator.current()).toEqual({});
  });

  it("lets an explicit unpin cancel a replay before host acceptance", () => {
    const tasks = createVnDevtoolsLatestTaskController();
    const replay = tasks.begin();
    const coordinator = createVnDevtoolsFixedPointCoordinator<string, string>(
      { target: "old", checkpoint: "old-state" },
      vi.fn()
    );

    tasks.cancel();
    coordinator.replace(undefined, undefined);
    if (replay.isCurrent()) coordinator.accept("stale-replay");

    expect(replay.signal.aborted).toBe(true);
    expect(coordinator.current()).toEqual({});
  });
});
