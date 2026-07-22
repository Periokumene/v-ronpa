import { useRef, useState } from "react";
import type { SaveableVnState } from "@v-ronpa/contracts";
import type { VnDevtoolsHostCommitSettlement, VnDevtoolsDeferredDefinitionRollback } from "./hostTransaction";

export interface VnDevtoolsPendingHostCommit<Definition> {
  token: number;
  phase: "install" | "await-session";
  candidate: Definition;
  previous: Definition;
  checkpoint: SaveableVnState;
  settlement: VnDevtoolsHostCommitSettlement;
  storySessionBefore?: number;
}

export interface VnDevtoolsDefinitionState<Definition> {
  activeDefinition: Definition;
  activeDefinitionRef: { current: Definition };
  commitSequenceRef: { current: number };
  pendingCommitRef: { current: VnDevtoolsPendingHostCommit<Definition> | undefined };
  pendingRollbackRef: { current: VnDevtoolsDeferredDefinitionRollback<Definition> | undefined };
  setActiveDefinition(definition: Definition): void;
}

export function useVnDevtoolsDefinitionState<Definition>(
  initialDefinition: Definition
): VnDevtoolsDefinitionState<Definition> {
  const [activeDefinition, setActiveDefinition] = useState(initialDefinition);
  const activeDefinitionRef = useRef(initialDefinition);
  const commitSequenceRef = useRef(0);
  const pendingCommitRef = useRef<VnDevtoolsPendingHostCommit<Definition> | undefined>(undefined);
  const pendingRollbackRef = useRef<VnDevtoolsDeferredDefinitionRollback<Definition> | undefined>(undefined);
  if (!pendingRollbackRef.current) activeDefinitionRef.current = activeDefinition;
  return {
    activeDefinition,
    activeDefinitionRef,
    commitSequenceRef,
    pendingCommitRef,
    pendingRollbackRef,
    setActiveDefinition
  };
}
