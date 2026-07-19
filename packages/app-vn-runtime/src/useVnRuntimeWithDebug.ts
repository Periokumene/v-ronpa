import { useMemo } from "react";
import { createVnRuntimeDebugSnapshot } from "./runtimeDebugSnapshot";
import {
  useVnRuntime,
  type UseVnRuntimeOptions
} from "./useVnRuntime";
import type { UseVnRuntimeWithDebugResult } from "./runtimeTypes";

/** Explicit debug entry used by harnesses that need detached, read-only observations. */
export function useVnRuntimeWithDebug(options: UseVnRuntimeOptions): UseVnRuntimeWithDebugResult {
  const runtime = useVnRuntime(options);
  const debug = useMemo(
    () =>
      createVnRuntimeDebugSnapshot({
        storyRuntime: runtime.shell.storyRuntime,
        pixiStageRuntime: runtime.presentation.pixiStageRuntime,
        uiRuntime: runtime.shell.uiRuntime,
        runtimeDiagnostics: runtime.diagnostics.runtimeDiagnostics
      }),
    [
      runtime.diagnostics.runtimeDiagnostics,
      runtime.presentation.pixiStageRuntime,
      runtime.shell.storyRuntime,
      runtime.shell.uiRuntime
    ]
  );

  return { ...runtime, debug };
}
