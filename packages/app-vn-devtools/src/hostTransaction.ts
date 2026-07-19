export interface VnDevtoolsHostCommitSettlement {
  readonly promise: Promise<boolean>;
  readonly settled: boolean;
  settle(result: boolean): boolean;
}

export interface VnDevtoolsDeferredDefinitionRollback<Definition> {
  definition: Definition;
  token: number;
}

export type VnDevtoolsDefinitionRollbackReconciliation = "none" | "requested" | "complete";

export function canRollbackVnDevtoolsHostCommit(phase: "install" | "await-session"): boolean {
  return phase === "install";
}

export function linearizeVnDevtoolsHostCommitAcceptance({
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

export function createVnDevtoolsHostCommitSettlement(): VnDevtoolsHostCommitSettlement {
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

export type VnDevtoolsHostCommitInstallResult =
  | { status: "await-session"; storySessionBefore: number; flowDispatchError?: string }
  | { status: "failed"; reason: "restore-rejected" | "restore-exception" };

export async function installVnDevtoolsHostCommit({
  enterFlow,
  restore,
  storySessionBefore
}: {
  enterFlow(): void;
  restore(): Promise<{ ok: boolean }>;
  storySessionBefore: number;
}): Promise<VnDevtoolsHostCommitInstallResult> {
  let restored: { ok: boolean };
  try {
    restored = await restore();
  } catch {
    return { status: "failed", reason: "restore-exception" };
  }
  if (!restored.ok) return { status: "failed", reason: "restore-rejected" };
  try {
    enterFlow();
    return { status: "await-session", storySessionBefore };
  } catch (error: unknown) {
    return {
      status: "await-session",
      storySessionBefore,
      flowDispatchError: error instanceof Error ? error.message : String(error)
    };
  }
}

export function reconcileVnDevtoolsDefinitionRollback<Definition>({
  activeDefinition,
  clearPendingState,
  pendingRollback,
  setActiveDefinition
}: {
  activeDefinition: Definition;
  clearPendingState(): void;
  pendingRollback: { current: VnDevtoolsDeferredDefinitionRollback<Definition> | undefined };
  setActiveDefinition(definition: Definition): void;
}): VnDevtoolsDefinitionRollbackReconciliation {
  const rollback = pendingRollback.current;
  if (!rollback) return "none";
  clearPendingState();
  if (activeDefinition !== rollback.definition) {
    setActiveDefinition(rollback.definition);
    return "requested";
  }
  pendingRollback.current = undefined;
  return "complete";
}
