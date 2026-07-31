import type { StoryPlaySchedule } from "@v-ronpa/story-play";
import type { StoryTextRevealState } from "./storyTextRevealRuntime";

type SchedulableStoryPlaySchedule =
  | Extract<StoryPlaySchedule, { type: "advance" }>
  | Extract<StoryPlaySchedule, { type: "wait" }>;

export type StoryTextPlaybackScheduleSource = SchedulableStoryPlaySchedule["source"];

export type StoryTextPlaybackBlockedGate = "reveal";
export type StoryTextPlaybackAdvanceBlocker = StoryTextPlaybackBlockedGate | "voice";

export type StoryTextPlaybackAdvanceGate =
  | { ready: true; source: StoryTextPlaybackScheduleSource }
  | { blockedBy: StoryTextPlaybackBlockedGate; ready: false; source: StoryTextPlaybackScheduleSource };

export type StoryTextPlaybackAdvanceRequest =
  | { source: StoryTextPlaybackScheduleSource; type: "advance" }
  | { blockedBy: StoryTextPlaybackAdvanceBlocker; source: StoryTextPlaybackScheduleSource; type: "blocked" };

export type StoryTextPlaybackSchedulePlan =
  | { delayMs: 0; type: "idle" }
  | { advanceGate: StoryTextPlaybackAdvanceGate; delayMs: number; source: StoryTextPlaybackScheduleSource; type: "scheduled" };

export interface CreateStoryTextPlaybackSchedulePlanInput {
  nowMs: number;
  reveal: StoryTextRevealState | undefined;
  schedule: StoryPlaySchedule;
}

export interface SelectStoryTextPlaybackAdvanceGateInput {
  reveal: StoryTextRevealState | undefined;
  source: StoryTextPlaybackScheduleSource;
}

export interface ShouldDriveStoryTextRevealInput {
  active: boolean;
  reveal: StoryTextRevealState | undefined;
}

export interface SelectStoryTextPlaybackAdvanceRequestInput {
  revealGate: StoryTextPlaybackAdvanceGate;
  voiceReady: boolean;
}

export function createStoryTextPlaybackSchedulePlan({
  nowMs,
  reveal,
  schedule
}: CreateStoryTextPlaybackSchedulePlanInput): StoryTextPlaybackSchedulePlan {
  if (schedule.type === "idle") return { type: "idle", delayMs: 0 };
  const source = schedule.source;
  return {
    type: "scheduled",
    source,
    delayMs: storyTextPlaybackScheduleDelayMs(schedule, reveal, nowMs),
    advanceGate: selectStoryTextPlaybackAdvanceGate({ source, reveal })
  };
}

export function storyTextPlaybackScheduleDelayMs(
  schedule: StoryPlaySchedule,
  reveal: StoryTextRevealState | undefined,
  nowMs: number
): number {
  if (schedule.type === "idle") return 0;
  if (schedule.type === "advance") return 0;
  if (schedule.source === "skip") return schedule.delayMs;
  const startedAtMs = reveal?.startedAtMs ?? nowMs;
  return Math.max(0, Math.ceil(startedAtMs + schedule.delayMs - nowMs));
}

export function selectStoryTextPlaybackAdvanceGate({
  reveal,
  source
}: SelectStoryTextPlaybackAdvanceGateInput): StoryTextPlaybackAdvanceGate {
  if (source === "skip" || !reveal || reveal.status === "complete") return { ready: true, source };
  return { ready: false, source, blockedBy: "reveal" };
}

export function selectStoryTextPlaybackAdvanceRequest({
  revealGate,
  voiceReady
}: SelectStoryTextPlaybackAdvanceRequestInput): StoryTextPlaybackAdvanceRequest {
  if (!revealGate.ready) {
    return { type: "blocked", source: revealGate.source, blockedBy: revealGate.blockedBy };
  }
  if (!voiceReady) return { type: "blocked", source: revealGate.source, blockedBy: "voice" };
  return { type: "advance", source: revealGate.source };
}

export function shouldDriveStoryTextReveal({ active, reveal }: ShouldDriveStoryTextRevealInput): boolean {
  return active && reveal?.status === "revealing";
}
