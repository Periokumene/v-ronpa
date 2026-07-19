import type { VnDevtoolsInspectionDisplay } from "./controllerSafety";
import type { VnDevtoolsDiagnostic, VnDevtoolsStatus } from "./types";

export interface CachedVnDevtoolsScriptAuthority {
  display: VnDevtoolsInspectionDisplay;
  diagnostics: VnDevtoolsDiagnostic[];
  status: VnDevtoolsStatus;
}

export interface VnDevtoolsScriptAuthorityCoordinator {
  view(scriptPath: string): void;
  viewedScriptPath(): string;
  cache(scriptPath: string, value: CachedVnDevtoolsScriptAuthority): void;
  cached(scriptPath: string): CachedVnDevtoolsScriptAuthority | undefined;
  authorizePreview(scriptPath: string, allowed?: boolean): void;
  freezePreview(scriptPath: string): void;
  canPreview(scriptPath: string): boolean;
  install(scriptPath: string, identity: string): void;
  installedIdentity(scriptPath: string): string | undefined;
  clearInstalled(scriptPath: string): void;
  expectHost(identity: string): void;
  rejectHost(identity: string): void;
  observeHost(scriptPath: string, identity: string): boolean;
  markUpdated(scriptPath: string): void;
  clearUpdated(scriptPath: string): void;
  updatedScriptPaths(): ReadonlySet<string>;
  beginTask(scriptPath: string): VnDevtoolsScriptAuthorityTask;
  cancelTasks(): void;
}

export interface VnDevtoolsScriptAuthorityTask {
  readonly generation: number;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
}

/**
 * Owns every script-scoped authorization fact independently from React view
 * state. A fixed point is deliberately absent: it controls replay only and
 * must never authorize or block another catalog record.
 */
export function createVnDevtoolsScriptAuthorityCoordinator(
  initialViewedScriptPath: string
): VnDevtoolsScriptAuthorityCoordinator {
  let viewed = initialViewedScriptPath;
  const cacheByPath = new Map<string, CachedVnDevtoolsScriptAuthority>();
  const previewByPath = new Map<string, boolean>();
  const installedByPath = new Map<string, string>();
  const expectedHostIdentities = new Set<string>();
  const updatedPaths = new Set<string>();
  const tasksByPath = new Map<string, { epoch: number; controller: AbortController }>();
  let taskEpoch = 0;
  return {
    view(scriptPath) {
      viewed = scriptPath;
    },
    viewedScriptPath: () => viewed,
    cache(scriptPath, value) {
      cacheByPath.set(scriptPath, value);
    },
    cached: (scriptPath) => cacheByPath.get(scriptPath),
    authorizePreview(scriptPath, allowed = true) {
      previewByPath.set(scriptPath, allowed);
    },
    freezePreview(scriptPath) {
      previewByPath.set(scriptPath, false);
    },
    canPreview: (scriptPath) => previewByPath.get(scriptPath) === true,
    install(scriptPath, identity) {
      installedByPath.set(scriptPath, identity);
    },
    installedIdentity: (scriptPath) => installedByPath.get(scriptPath),
    clearInstalled(scriptPath) {
      installedByPath.delete(scriptPath);
    },
    expectHost(identity) {
      expectedHostIdentities.add(identity);
    },
    rejectHost(identity) {
      expectedHostIdentities.delete(identity);
    },
    observeHost(scriptPath, identity) {
      if (!expectedHostIdentities.delete(identity)) return false;
      installedByPath.set(scriptPath, identity);
      return true;
    },
    markUpdated(scriptPath) {
      updatedPaths.add(scriptPath);
    },
    clearUpdated(scriptPath) {
      updatedPaths.delete(scriptPath);
    },
    updatedScriptPaths: () => new Set(updatedPaths),
    beginTask(scriptPath) {
      tasksByPath.get(scriptPath)?.controller.abort();
      const task = { epoch: ++taskEpoch, controller: new AbortController() };
      tasksByPath.set(scriptPath, task);
      return {
        generation: task.epoch,
        signal: task.controller.signal,
        isCurrent: () => tasksByPath.get(scriptPath) === task && !task.controller.signal.aborted
      };
    },
    cancelTasks() {
      for (const task of tasksByPath.values()) task.controller.abort();
      tasksByPath.clear();
    }
  };
}
