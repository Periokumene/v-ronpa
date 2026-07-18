import { describe, expect, it } from "vitest";
import {
  createVnDevtoolsLatestTaskController,
  createVnDevtoolsMonotonicUpdateGate,
  createVnDevtoolsSerialCommitQueue,
  planVnDevtoolsCandidate,
  shouldAdoptCanonicalInitialEntry
} from "./sourceUpdates";

describe("Nani devtools source update coordination", () => {
  it("chooses one update action without compatibility fallbacks", () => {
    const base = {
      serverRevision: "sha256:new",
      browserRevision: "sha256:new",
      activeRevision: "sha256:old",
      canMaterialize: true,
      hasPinnedTarget: false,
      vnActive: false
    };

    expect(planVnDevtoolsCandidate(base)).toEqual({ kind: "adopt-for-next-start" });
    expect(planVnDevtoolsCandidate({ ...base, vnActive: true })).toEqual({ kind: "require-preview-target" });
    expect(planVnDevtoolsCandidate({ ...base, hasPinnedTarget: true, vnActive: true }))
      .toEqual({ kind: "materialize-pinned-target" });
    expect(planVnDevtoolsCandidate({ ...base, activeRevision: "sha256:new" }))
      .toEqual({ kind: "refresh-source-mapping" });
  });

  it("retains last-known-good state for invalid source and digest disagreement", () => {
    const base = {
      serverRevision: "sha256:new",
      browserRevision: "sha256:new",
      activeRevision: "sha256:old",
      canMaterialize: true,
      hasPinnedTarget: true,
      vnActive: true
    };

    expect(planVnDevtoolsCandidate({ ...base, serverRevision: null, canMaterialize: false }))
      .toEqual({ kind: "retain-last-known-good", reason: "invalid-source" });
    expect(planVnDevtoolsCandidate({ ...base, browserRevision: "sha256:other" }))
      .toEqual({ kind: "retain-last-known-good", reason: "revision-mismatch" });
  });

  it("adopts a canonical initial revision only while inactive and unpinned", () => {
    expect(shouldAdoptCanonicalInitialEntry({
      canMaterialize: true,
      declaredRevisionMatches: false,
      hasPinnedTarget: false,
      vnActive: false
    })).toBe(true);
    expect(shouldAdoptCanonicalInitialEntry({
      canMaterialize: true,
      declaredRevisionMatches: false,
      hasPinnedTarget: false,
      vnActive: true
    })).toBe(false);
    expect(shouldAdoptCanonicalInitialEntry({
      canMaterialize: false,
      declaredRevisionMatches: false,
      hasPinnedTarget: false,
      vnActive: false
    })).toBe(false);
  });

  it("makes rapid tasks latest-wins and aborts prior work", () => {
    const controller = createVnDevtoolsLatestTaskController();
    const first = controller.begin();
    const second = controller.begin();

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);

    controller.cancel();
    expect(second.signal.aborted).toBe(true);
    expect(second.isCurrent()).toBe(false);
  });

  it("rejects duplicate and out-of-order source events", () => {
    const gate = createVnDevtoolsMonotonicUpdateGate();
    expect(gate.accept(2)).toBe(true);
    expect(gate.accept(1)).toBe(false);
    expect(gate.accept(2)).toBe(false);
    expect(gate.accept(3)).toBe(true);
    expect(gate.current()).toBe(3);
  });

  it("finishes an accepted atomic commit, skips superseded queued work, then installs the latest candidate", async () => {
    let finishFirst!: (value: boolean) => void;
    const installed: string[] = [];
    const queue = createVnDevtoolsSerialCommitQueue<string>(async (value) => {
      installed.push(value);
      if (value === "first") return new Promise<boolean>((resolve) => {
        finishFirst = resolve;
      });
      return true;
    });
    const firstSignal = new AbortController();
    const skippedSignal = new AbortController();
    const latestSignal = new AbortController();
    const first = queue.enqueue("first", firstSignal.signal);
    await Promise.resolve();
    const skipped = queue.enqueue("skipped", skippedSignal.signal);
    skippedSignal.abort();
    const latest = queue.enqueue("latest", latestSignal.signal);

    expect(installed).toEqual(["first"]);
    finishFirst(true);
    await expect(first).resolves.toBe(true);
    await expect(skipped).resolves.toBe(false);
    await expect(latest).resolves.toBe(true);
    expect(installed).toEqual(["first", "latest"]);
  });

  it("serializes a latest source adoption behind an accepted host commit instead of reporting a dropped update", async () => {
    type Mutation = { kind: "commit"; revision: string } | { kind: "adopt"; revision: string };
    let finishCommit!: () => void;
    const installed: string[] = [];
    const queue = createVnDevtoolsSerialCommitQueue<Mutation>(async (mutation) => {
      installed.push(`${mutation.kind}:${mutation.revision}`);
      if (mutation.kind === "commit") {
        await new Promise<void>((resolve) => {
          finishCommit = resolve;
        });
      }
      return true;
    });
    const tasks = createVnDevtoolsLatestTaskController();
    const previewTask = tasks.begin();
    const commit = queue.enqueue({ kind: "commit", revision: "sha256:preview" }, previewTask.signal);
    await Promise.resolve();

    const savedSourceTask = tasks.begin();
    const adoption = queue.enqueue({ kind: "adopt", revision: "sha256:latest" }, savedSourceTask.signal);
    expect(installed).toEqual(["commit:sha256:preview"]);

    finishCommit();
    await expect(commit).resolves.toBe(true);
    await expect(adoption).resolves.toBe(true);
    expect(installed).toEqual(["commit:sha256:preview", "adopt:sha256:latest"]);
  });
});
