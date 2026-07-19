import { describe, expect, it, vi } from "vitest";
import {
  canRollbackGameADevtoolsCommit,
  createGameADevtoolsCommitSettlement,
  failGameADevtoolsCommit,
  installGameADevtoolsCommit,
  linearizeGameADevtoolsCommitAcceptance,
  reconcileGameADevtoolsEntryRollback,
  type GameADevtoolsDeferredEntryRollback
} from "./gameADevtoolsCommit";

describe("Game A devtools atomic commit", () => {
  it("preserves an accepted restore across host cleanup so a remount can observe its session", () => {
    expect(canRollbackGameADevtoolsCommit("install")).toBe(true);
    expect(canRollbackGameADevtoolsCommit("await-session")).toBe(false);
  });

  it("keeps the old fixed point when a newer save aborts candidate preflight before host acceptance", async () => {
    const abort = new AbortController();
    let finishPreflight!: () => void;
    let installedEntry = "old";
    let fixedPoint = "A";
    const accepted = vi.fn(() => {
      fixedPoint = "B";
    });
    const commit = (async () => {
      await new Promise<void>((resolve) => {
        finishPreflight = resolve;
      });
      return linearizeGameADevtoolsCommitAcceptance({
        signal: abort.signal,
        install: () => {
          installedEntry = "candidate";
        },
        onAccepted: accepted
      });
    })();

    abort.abort();
    const nextSaveReplayTarget = fixedPoint;
    finishPreflight();

    await expect(commit).resolves.toBe(false);
    expect(nextSaveReplayTarget).toBe("A");
    expect(fixedPoint).toBe("A");
    expect(installedEntry).toBe("old");
    expect(accepted).not.toHaveBeenCalled();
  });

  it("enters VN once and waits for the captured story session after a successful restore", async () => {
    const enterVn = vi.fn();
    const restore = vi.fn(async () => ({ ok: true }));

    await expect(
      installGameADevtoolsCommit({
        enterVn,
        restore,
        storySessionBefore: 3
      })
    ).resolves.toEqual({ status: "await-session", storySessionBefore: 3 });
    expect(restore).toHaveBeenCalledOnce();
    expect(enterVn).toHaveBeenCalledOnce();
  });

  it("rejects a failed restore without entering VN", async () => {
    const enterVn = vi.fn();

    await expect(
      installGameADevtoolsCommit({
        enterVn,
        restore: async () => ({ ok: false }),
        storySessionBefore: 4
      })
    ).resolves.toEqual({ status: "failed", reason: "restore-rejected" });
    expect(enterVn).not.toHaveBeenCalled();
  });

  it("turns a restore exception into a failed pre-install transaction", async () => {
    await expect(
      installGameADevtoolsCommit({
        enterVn: vi.fn(),
        restore: async () => {
          throw new Error("restore failed");
        },
        storySessionBefore: 7
      })
    ).resolves.toEqual({ status: "failed", reason: "restore-exception" });
  });

  it("makes a successful restore irrevocable even when its originating task is superseded", async () => {
    const abort = new AbortController();
    const enterVn = vi.fn();

    await expect(
      installGameADevtoolsCommit({
        enterVn,
        restore: async () => {
          abort.abort();
          return { ok: true };
        },
        storySessionBefore: 2
      })
    ).resolves.toEqual({ status: "await-session", storySessionBefore: 2 });
    expect(abort.signal.aborted).toBe(true);
    expect(enterVn).toHaveBeenCalledOnce();
  });

  it("keeps the restored candidate installed when ENTER_VN dispatch throws", async () => {
    await expect(
      installGameADevtoolsCommit({
        enterVn: () => {
          throw new Error("flow failed");
        },
        restore: async () => ({ ok: true }),
        storySessionBefore: 7
      })
    ).resolves.toEqual({
      status: "await-session",
      storySessionBefore: 7,
      flowDispatchError: "flow failed"
    });
  });

  it("settles an unmounted attempt false once without a React state rollback", async () => {
    const settlement = createGameADevtoolsCommitSettlement();
    const rollbackEntryRef = vi.fn();
    const rollbackMountedEntry = vi.fn();

    expect(
      failGameADevtoolsCommit({
        mounted: false,
        rollbackEntryRef,
        rollbackMountedEntry,
        settlement
      })
    ).toBe(true);
    expect(
      failGameADevtoolsCommit({
        mounted: true,
        rollbackEntryRef,
        rollbackMountedEntry,
        settlement
      })
    ).toBe(false);

    await expect(settlement.promise).resolves.toBe(false);
    expect(settlement.settled).toBe(true);
    expect(rollbackEntryRef).toHaveBeenCalledOnce();
    expect(rollbackMountedEntry).not.toHaveBeenCalled();
  });

  it("carries an orphaned rollback through cleanup and restores it on the next mounted layout", async () => {
    const previousEntry = { id: "previous" };
    const candidateEntry = { id: "candidate" };
    const pendingRollback: {
      current: GameADevtoolsDeferredEntryRollback<typeof previousEntry> | undefined;
    } = { current: undefined };
    const settlement = createGameADevtoolsCommitSettlement();
    const setActiveEntry = vi.fn();
    const clearPendingState = vi.fn();

    failGameADevtoolsCommit({
      mounted: false,
      settlement,
      rollbackEntryRef: () => {
        pendingRollback.current = { entry: previousEntry, token: 9 };
      },
      rollbackMountedEntry: setActiveEntry
    });

    await expect(settlement.promise).resolves.toBe(false);
    expect(setActiveEntry).not.toHaveBeenCalled();
    expect(
      reconcileGameADevtoolsEntryRollback({
        activeEntry: candidateEntry,
        clearPendingState,
        pendingRollback,
        setActiveEntry
      })
    ).toBe("requested");
    expect(setActiveEntry).toHaveBeenCalledWith(previousEntry);
    expect(pendingRollback.current).toEqual({ entry: previousEntry, token: 9 });

    expect(
      reconcileGameADevtoolsEntryRollback({
        activeEntry: previousEntry,
        clearPendingState,
        pendingRollback,
        setActiveEntry
      })
    ).toBe("complete");
    expect(pendingRollback.current).toBeUndefined();
    expect(clearPendingState).toHaveBeenCalledTimes(2);
  });

  it("rolls back both the entry ref and mounted state on an ordinary failure", async () => {
    const settlement = createGameADevtoolsCommitSettlement();
    const rollbackEntryRef = vi.fn();
    const rollbackMountedEntry = vi.fn();

    failGameADevtoolsCommit({
      mounted: true,
      rollbackEntryRef,
      rollbackMountedEntry,
      settlement
    });

    await expect(settlement.promise).resolves.toBe(false);
    expect(rollbackEntryRef).toHaveBeenCalledOnce();
    expect(rollbackMountedEntry).toHaveBeenCalledOnce();
  });
});
