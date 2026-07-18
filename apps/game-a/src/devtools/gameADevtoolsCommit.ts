export interface GameADevtoolsCommitSettlement {
  readonly promise: Promise<boolean>;
  readonly settled: boolean;
  settle(result: boolean): boolean;
}

export interface GameADevtoolsDeferredEntryRollback<Entry> {
  entry: Entry;
  token: number;
}

export type GameADevtoolsEntryRollbackReconciliation = "none" | "requested" | "complete";

export function canRollbackGameADevtoolsCommit(phase: "install" | "await-session"): boolean {
  return phase === "install";
}

/**
 * Publishes host acceptance only after every async candidate preflight has
 * completed. Installing the app-owned refs and arming the controller fixed
 * point happen in one synchronous, non-interleavable boundary.
 */
export function linearizeGameADevtoolsCommitAcceptance({
  install,
  onAccepted,
  signal
}: {
  install(): void;
  onAccepted(): void;
  signal: AbortSignal;
}): boolean {
  if (signal.aborted) return false;
  install();
  onAccepted();
  return true;
}

export function createGameADevtoolsCommitSettlement(): GameADevtoolsCommitSettlement {
  let settled = false;
  let resolvePromise!: (result: boolean) => void;
  const promise = new Promise<boolean>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    get settled() {
      return settled;
    },
    settle(result) {
      if (settled) return false;
      settled = true;
      resolvePromise(result);
      return true;
    }
  };
}

export type GameADevtoolsCommitInstallResult =
  | { status: "await-session"; storySessionBefore: number; flowDispatchError?: string }
  | { status: "failed"; reason: "restore-rejected" | "restore-exception" };

export function installGameADevtoolsCommit({
  enterVn,
  restore,
  storySessionBefore
}: {
  enterVn(): void;
  restore(): { ok: boolean };
  storySessionBefore: number;
}): GameADevtoolsCommitInstallResult {
  let restored: { ok: boolean };
  try {
    restored = restore();
  } catch {
    return { status: "failed", reason: "restore-exception" };
  }
  if (!restored.ok) return { status: "failed", reason: "restore-rejected" };

  // restoreVnState is the transaction's irreversible linearization point. A
  // superseding devtools task may cancel work that has not reached the host,
  // but it must never roll back only the entry after Story/Pixi/UI/media were
  // already installed. Flow dispatch is best-effort here; storySession still
  // confirms the accepted restore on the next render.
  try {
    enterVn();
    return { status: "await-session", storySessionBefore };
  } catch (error: unknown) {
    return {
      status: "await-session",
      storySessionBefore,
      flowDispatchError: error instanceof Error ? error.message : String(error)
    };
  }
}

export function failGameADevtoolsCommit({
  mounted,
  rollbackEntryRef,
  rollbackMountedEntry,
  settlement
}: {
  mounted: boolean;
  rollbackEntryRef(): void;
  rollbackMountedEntry(): void;
  settlement: GameADevtoolsCommitSettlement;
}): boolean {
  if (!settlement.settle(false)) return false;
  rollbackEntryRef();
  if (mounted) rollbackMountedEntry();
  return true;
}

export function reconcileGameADevtoolsEntryRollback<Entry>({
  activeEntry,
  clearPendingState,
  pendingRollback,
  setActiveEntry
}: {
  activeEntry: Entry;
  clearPendingState(): void;
  pendingRollback: { current: GameADevtoolsDeferredEntryRollback<Entry> | undefined };
  setActiveEntry(entry: Entry): void;
}): GameADevtoolsEntryRollbackReconciliation {
  const rollback = pendingRollback.current;
  if (!rollback) return "none";

  clearPendingState();
  if (activeEntry !== rollback.entry) {
    setActiveEntry(rollback.entry);
    return "requested";
  }

  pendingRollback.current = undefined;
  return "complete";
}
