import type { VnRuntimeDiagnostic } from "./runtimeDiagnostics";
import type {
  VnPixiStageRuntime,
  VnRuntimeDebugSnapshot,
  VnStoryRuntime,
  VnUiRuntime
} from "./runtimeTypes";

export interface CreateVnRuntimeDebugSnapshotInput {
  storyRuntime: VnStoryRuntime;
  pixiStageRuntime: VnPixiStageRuntime;
  uiRuntime: VnUiRuntime;
  runtimeDiagnostics: VnRuntimeDiagnostic[];
}

/**
 * Detaches debug observations from live React state and freezes every nested
 * object. The explicit debug entry is therefore read-only at runtime as well as
 * in TypeScript, rather than exposing reducer-owned references behind a type.
 */
export function createVnRuntimeDebugSnapshot(
  input: CreateVnRuntimeDebugSnapshotInput
): VnRuntimeDebugSnapshot {
  return cloneAndFreeze(input) as VnRuntimeDebugSnapshot;
}

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndFreeze(item))) as T;
  }
  if (value !== null && typeof value === "object") {
    const clone = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneAndFreeze(item)])
    );
    return Object.freeze(clone) as T;
  }
  return value;
}
