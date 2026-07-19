import { describe, expect, it, vi } from "vitest";
import {
  canRollbackVnDevtoolsHostCommit,
  createVnDevtoolsHostCommitSettlement,
  installVnDevtoolsHostCommit,
  linearizeVnDevtoolsHostCommitAcceptance,
  reconcileVnDevtoolsDefinitionRollback,
  type VnDevtoolsDeferredDefinitionRollback
} from "./hostTransaction";

describe("shared VN devtools host transaction", () => {
  it("makes restore success the irreversible boundary", () => {
    expect(canRollbackVnDevtoolsHostCommit("install")).toBe(true);
    expect(canRollbackVnDevtoolsHostCommit("await-session")).toBe(false);
  });

  it("does not accept an aborted candidate", () => {
    const abort = new AbortController();
    abort.abort();
    const install = vi.fn();
    const onAccepted = vi.fn();
    expect(linearizeVnDevtoolsHostCommitAcceptance({ signal: abort.signal, install, onAccepted })).toBe(false);
    expect(install).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("restores, enters flow once, and waits for exactly the captured session", async () => {
    const enterFlow = vi.fn();
    const restore = vi.fn(async () => ({ ok: true }));
    await expect(installVnDevtoolsHostCommit({ enterFlow, restore, storySessionBefore: 3 }))
      .resolves.toEqual({ status: "await-session", storySessionBefore: 3 });
    expect(restore).toHaveBeenCalledOnce();
    expect(enterFlow).toHaveBeenCalledOnce();
  });

  it("rejects restore failures and preserves a successful restore when flow dispatch throws", async () => {
    const enterFlow = vi.fn();
    await expect(installVnDevtoolsHostCommit({
      enterFlow,
      restore: async () => ({ ok: false }),
      storySessionBefore: 4
    })).resolves.toEqual({ status: "failed", reason: "restore-rejected" });
    expect(enterFlow).not.toHaveBeenCalled();

    await expect(installVnDevtoolsHostCommit({
      enterFlow: () => { throw new Error("flow failed"); },
      restore: async () => ({ ok: true }),
      storySessionBefore: 7
    })).resolves.toEqual({
      status: "await-session",
      storySessionBefore: 7,
      flowDispatchError: "flow failed"
    });
  });

  it("turns restore exceptions into pre-install failures", async () => {
    await expect(installVnDevtoolsHostCommit({
      enterFlow: vi.fn(),
      restore: async () => { throw new Error("restore failed"); },
      storySessionBefore: 7
    })).resolves.toEqual({ status: "failed", reason: "restore-exception" });
  });

  it("settles once and reconciles an orphaned rollback on the next mounted render", async () => {
    const settlement = createVnDevtoolsHostCommitSettlement();
    expect(settlement.settle(false)).toBe(true);
    expect(settlement.settle(true)).toBe(false);
    await expect(settlement.promise).resolves.toBe(false);

    const previous = { id: "previous" };
    const candidate = { id: "candidate" };
    const pendingRollback: { current: VnDevtoolsDeferredDefinitionRollback<typeof previous> | undefined } = {
      current: { definition: previous, token: 9 }
    };
    const setActiveDefinition = vi.fn();
    const clearPendingState = vi.fn();
    expect(reconcileVnDevtoolsDefinitionRollback({
      activeDefinition: candidate,
      clearPendingState,
      pendingRollback,
      setActiveDefinition
    })).toBe("requested");
    expect(setActiveDefinition).toHaveBeenCalledWith(previous);
    expect(reconcileVnDevtoolsDefinitionRollback({
      activeDefinition: previous,
      clearPendingState,
      pendingRollback,
      setActiveDefinition
    })).toBe("complete");
    expect(pendingRollback.current).toBeUndefined();
  });
});
