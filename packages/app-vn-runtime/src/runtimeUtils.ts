import type { StoryPresentationWaitTask, StoryRuntimeSnapshot } from "@v-ronpa/contracts";
import { dismissToast, type UiRuntimeState } from "@v-ronpa/app-vn-dispatch";
import { createInitialPixiStageSnapshot, type PixiPresentationTaskSnapshot } from "@v-ronpa/pixi-presenter";
import type { StoryPlayAdvanceSource, StoryPlayPacing, StoryPlayState } from "@v-ronpa/story-play";
import type { VnPixiStageRuntime, VnStoryRuntime } from "./runtimeTypes";

export const DEFAULT_VN_TOAST_DURATION_MS = 2500;

export interface SyncVnRuntimeToastDismissalTimersInput {
  state: UiRuntimeState;
  timeouts: Record<string, number>;
  setTimeoutFn: (callback: () => void, durationMs: number) => number;
  clearTimeoutFn: (timeoutId: number) => void;
  dismissToastId: (toastId: string) => void;
  defaultDurationMs?: number;
}

export function createInitialVnPixiStageRuntime(): VnPixiStageRuntime {
  return {
    snapshot: createInitialPixiStageSnapshot(),
    hints: [],
    hintSequence: 0,
    animate: false,
    presentationTasks: []
  };
}

export function syncVnRuntimeToastDismissalTimers({
  state,
  timeouts,
  setTimeoutFn,
  clearTimeoutFn,
  dismissToastId,
  defaultDurationMs = DEFAULT_VN_TOAST_DURATION_MS
}: SyncVnRuntimeToastDismissalTimersInput) {
  const activeToastIds = new Set(state.toasts.map((toast) => toast.id));
  for (const [toastId, timeout] of Object.entries(timeouts)) {
    if (!activeToastIds.has(toastId)) {
      clearTimeoutFn(timeout);
      delete timeouts[toastId];
    }
  }
  for (const toast of state.toasts) {
    if (timeouts[toast.id]) continue;
    timeouts[toast.id] = setTimeoutFn(() => {
      delete timeouts[toast.id];
      dismissToastId(toast.id);
    }, toast.durationMs ?? defaultDurationMs);
  }
}

export function dismissVnRuntimeToast(state: UiRuntimeState, toastId: string): UiRuntimeState {
  return dismissToast(state, toastId);
}

export function canToggleVnStoryAutomation(storyRuntime: VnStoryRuntime): boolean {
  return (
    storyRuntime.active &&
    !storyRuntime.state.ended &&
    storyRuntime.state.pendingChoices.length === 0 &&
    !storyRuntime.state.presentationWait &&
    !storyRuntime.state.runtimeWait
  );
}

export function canAdvanceVnStoryFromSource(storyRuntime: VnStoryRuntime, source: StoryPlayAdvanceSource): boolean {
  if (!storyRuntime.active || storyRuntime.state.ended || storyRuntime.state.pendingChoices.length > 0) return false;
  if (storyRuntime.state.presentationWait) return true;
  const wait = storyRuntime.state.runtimeWait;
  if (!wait) return true;
  if (wait.kind === "pause") return canCompleteVnPauseRuntimeWaitFromSource(wait, source);
  return wait.kind === "movie";
}

export function canCompleteVnPauseRuntimeWaitFromSource(
  wait: Extract<NonNullable<StoryRuntimeSnapshot["runtimeWait"]>, { kind: "pause" }>,
  source: StoryPlayAdvanceSource
): boolean {
  if (source === "system") return true;
  return source === "manual" && wait.mode !== "timer";
}

export function shouldAnimateVnStoryPlayPacing(pacing: StoryPlayPacing): boolean {
  return pacing !== "skip";
}

export function resolveVnPresentationWaitAdvanceSource(
  source: StoryPlayAdvanceSource,
  storyPlay: Pick<StoryPlayState, "mode">
): StoryPlayAdvanceSource {
  return source === "system" && storyPlay.mode === "skip" ? "skip" : source;
}

export function vnPresentationWaitKey(wait: NonNullable<StoryRuntimeSnapshot["presentationWait"]>): string {
  if (wait.channel === "ui") {
    return `${wait.commandIndex ?? "unknown"}:${wait.commandId}:ui:${wait.targets.join(",")}:${String(wait.targetVisible)}`;
  }
  const tasks = (wait.expectedTasks ?? []).map(vnPresentationWaitTaskKey).join("|");
  return `${wait.commandIndex ?? "unknown"}:${wait.commandId}:pixi:${wait.stageRevision ?? "none"}:${tasks}`;
}

export function vnPresentationWaitTaskKey(task: StoryPresentationWaitTask): string {
  return `${task.kind}:${task.target}:${task.revision}`;
}

export function vnPixiPresentationTaskKey(task: PixiPresentationTaskSnapshot): string {
  return `${task.kind}:${task.target}:${task.revision}`;
}

export function readVnRuntimeNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}
