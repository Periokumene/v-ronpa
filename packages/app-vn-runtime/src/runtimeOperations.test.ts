import { describe, expect, it } from "vitest";
import { createVnRuntimeOperationCoordinator } from "./runtimeOperations";

describe("runtime operation coordinator", () => {
  it("invalidates superseded and explicitly cancelled operations", () => {
    const coordinator = createVnRuntimeOperationCoordinator<string>();
    const first = coordinator.begin("catalog-a");
    const second = coordinator.begin("catalog-b");

    expect(first.controller.signal.aborted).toBe(true);
    expect(coordinator.isCurrent(first)).toBe(false);
    expect(coordinator.isCurrent(second)).toBe(true);
    coordinator.invalidate();
    expect(second.controller.signal.aborted).toBe(true);
    expect(coordinator.current()).toBeUndefined();
  });
});
