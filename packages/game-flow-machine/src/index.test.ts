import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { gameFlowMachine, modeFromSnapshotValue } from "./index";

describe("game flow machine", () => {
  it("moves through top-level game modes", () => {
    const actor = createActor(gameFlowMachine).start();
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("loading");

    actor.send({ type: "BOOT" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("navi");

    actor.send({ type: "ENTER_TRIAL" });
    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("trial");

    actor.send({ type: "ENTER_NAVI" });
    actor.send({ type: "PAUSE" });
    actor.send({ type: "RESUME" });

    expect(modeFromSnapshotValue(actor.getSnapshot().value)).toBe("navi");
  });
});
