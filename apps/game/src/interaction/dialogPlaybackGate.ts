import type { StoryPlaySchedule } from "@v-ronpa/story-play";
import type { DialogRevealState } from "./dialogRevealRuntime";

type SchedulableStoryPlaySchedule =
  | Extract<StoryPlaySchedule, { type: "advance" }>
  | Extract<StoryPlaySchedule, { type: "wait" }>;

export type DialogPlaybackScheduleSource = SchedulableStoryPlaySchedule["source"];

export type DialogPlaybackBlockedGate = "reveal";
export type DialogPlaybackAdvanceBlocker = DialogPlaybackBlockedGate | "voice";

export type DialogPlaybackAdvanceGate =
  | { ready: true; source: DialogPlaybackScheduleSource }
  | { blockedBy: DialogPlaybackBlockedGate; ready: false; source: DialogPlaybackScheduleSource };

export type DialogPlaybackAdvanceRequest =
  | { source: DialogPlaybackScheduleSource; type: "advance" }
  | { blockedBy: DialogPlaybackAdvanceBlocker; source: DialogPlaybackScheduleSource; type: "blocked" };

export type DialogPlaybackSchedulePlan =
  | { delayMs: 0; type: "idle" }
  | { advanceGate: DialogPlaybackAdvanceGate; delayMs: number; source: DialogPlaybackScheduleSource; type: "scheduled" };

export interface CreateDialogPlaybackSchedulePlanInput {
  nowMs: number;
  reveal: DialogRevealState | undefined;
  schedule: StoryPlaySchedule;
}

export interface SelectDialogPlaybackAdvanceGateInput {
  reveal: DialogRevealState | undefined;
  source: DialogPlaybackScheduleSource;
}

export interface ShouldDriveDialogRevealInput {
  active: boolean;
  reveal: DialogRevealState | undefined;
}

export interface SelectDialogPlaybackAdvanceRequestInput {
  revealGate: DialogPlaybackAdvanceGate;
  voiceReady: boolean;
}

export function createDialogPlaybackSchedulePlan({
  nowMs,
  reveal,
  schedule
}: CreateDialogPlaybackSchedulePlanInput): DialogPlaybackSchedulePlan {
  if (schedule.type === "idle") return { type: "idle", delayMs: 0 };
  const source = schedule.source;
  return {
    type: "scheduled",
    source,
    delayMs: dialogPlaybackScheduleDelayMs(schedule, reveal, nowMs),
    advanceGate: selectDialogPlaybackAdvanceGate({ source, reveal })
  };
}

export function dialogPlaybackScheduleDelayMs(
  schedule: StoryPlaySchedule,
  reveal: DialogRevealState | undefined,
  nowMs: number
): number {
  if (schedule.type === "idle") return 0;
  if (schedule.type === "advance") return 0;
  if (schedule.source === "skip") return schedule.delayMs;
  const startedAtMs = reveal?.startedAtMs ?? nowMs;
  return Math.max(0, Math.ceil(startedAtMs + schedule.delayMs - nowMs));
}

export function selectDialogPlaybackAdvanceGate({
  reveal,
  source
}: SelectDialogPlaybackAdvanceGateInput): DialogPlaybackAdvanceGate {
  if (source === "skip" || !reveal || reveal.status === "complete") return { ready: true, source };
  return { ready: false, source, blockedBy: "reveal" };
}

export function selectDialogPlaybackAdvanceRequest({
  revealGate,
  voiceReady
}: SelectDialogPlaybackAdvanceRequestInput): DialogPlaybackAdvanceRequest {
  if (!revealGate.ready) {
    return { type: "blocked", source: revealGate.source, blockedBy: revealGate.blockedBy };
  }
  if (!voiceReady) return { type: "blocked", source: revealGate.source, blockedBy: "voice" };
  return { type: "advance", source: revealGate.source };
}

export function shouldDriveDialogReveal({ active, reveal }: ShouldDriveDialogRevealInput): boolean {
  return active && reveal?.status === "revealing";
}
