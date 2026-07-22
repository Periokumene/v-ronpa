import type { RuntimeCommand, RuntimeScript, RuntimeValue } from "@v-ronpa/contracts";
import {
  advanceToNextStop,
  chooseStoryOption,
  selectCurrentStoryLine,
  type StoryRuntimeState,
  type StoryStepperResult
} from "@v-ronpa/story-engine";

export type StoryPlayMode = "manual" | "auto" | "skip";

export type StoryPlayAdvanceSource = "start" | "manual" | "auto" | "auto-next" | "skip" | "choice" | "system";

export type StoryPlayPacing = "normal" | "skip";

export type StoryPlayStopReason =
  | "manual-takeover"
  | "choice"
  | "story-ended"
  | "overlay"
  | "reset"
  | "load"
  | "close-story"
  | "toggle-off";

export interface StoryPlayCurrentStop {
  source: StoryPlayAdvanceSource;
  autoNext: boolean;
  visibleCharCount: number;
  hasChoices: boolean;
  ended: boolean;
}

export interface StoryPlayState {
  mode: StoryPlayMode;
  lastStopReason?: StoryPlayStopReason;
  currentStop?: StoryPlayCurrentStop;
}

export interface StoryPlayIntent {
  source: StoryPlayAdvanceSource;
  pacing: StoryPlayPacing;
  stopReason?: StoryPlayStopReason;
}

export type StoryPlaySchedule =
  | { type: "idle" }
  | { type: "wait"; source: "auto" | "auto-next" | "skip"; delayMs: number }
  | { type: "advance"; source: "auto" | "auto-next" | "skip" };

export interface StoryPlayStep {
  story: StoryStepperResult;
  play: StoryPlayState;
  intent: StoryPlayIntent;
}

export interface StoryPlayTimingPolicy {
  autoBaseDelayMs: number;
  autoPerVisibleCharMs: number;
  autoMinDelayMs: number;
  autoMaxDelayMs: number;
  skipDelayMs: number;
}

export const defaultStoryPlayTimingPolicy: StoryPlayTimingPolicy = {
  autoBaseDelayMs: 900,
  autoPerVisibleCharMs: 55,
  autoMinDelayMs: 1200,
  autoMaxDelayMs: 5500,
  skipDelayMs: 80
};

export interface StoryPlayScheduleOptions {
  active?: boolean;
  hostReadyForAuto?: boolean;
  hostBlocked?: boolean;
  timing?: Partial<StoryPlayTimingPolicy>;
}

export interface AdvanceStoryPlayInput {
  state: StoryRuntimeState;
  script: RuntimeScript;
  source?: StoryPlayAdvanceSource;
}

export interface ChooseStoryPlayInput {
  state: StoryRuntimeState;
  script: RuntimeScript;
  index: number;
}

export function createInitialStoryPlayState(): StoryPlayState {
  return { mode: "manual" };
}

export function toggleAutoStoryPlay(play: StoryPlayState): StoryPlayState {
  if (play.mode === "auto") return stopStoryPlayAutomation(play, "toggle-off");
  return { ...withoutStopReason(play), mode: "auto" };
}

export function toggleSkipStoryPlay(play: StoryPlayState): StoryPlayState {
  if (play.mode === "skip") return stopStoryPlayAutomation(play, "toggle-off");
  return { ...withoutStopReason(play), mode: "skip" };
}

export function stopStoryPlayAutomation(play: StoryPlayState, reason: StoryPlayStopReason): StoryPlayState {
  return {
    ...play,
    mode: "manual",
    lastStopReason: reason,
    ...(play.currentStop ? { currentStop: { ...play.currentStop, autoNext: false } } : {})
  };
}

export function advanceStoryPlay(play: StoryPlayState, input: AdvanceStoryPlayInput): StoryPlayStep {
  const source = input.source ?? "manual";
  const playBeforeStep = source === "manual" ? stopStoryPlayAutomation(play, "manual-takeover") : play;
  const story = advanceToNextStop(input.state, input.script);
  const playAfterStep = applyStoryStep(playBeforeStep, story, source);
  return {
    story,
    play: playAfterStep,
    intent: {
      source,
      pacing: source === "skip" ? "skip" : "normal",
      ...(playAfterStep.lastStopReason ? { stopReason: playAfterStep.lastStopReason } : {})
    }
  };
}

export function chooseStoryPlayOption(play: StoryPlayState, input: ChooseStoryPlayInput): StoryPlayStep {
  const chosen = chooseStoryOption(input.state, input.script, input.index);
  const advanced = chosen.navigationRequest
    ? chosen
    : advanceToNextStop(chosen.state, input.script);
  const story: StoryStepperResult = {
    state: advanced.state,
    diagnostics: [...chosen.diagnostics, ...advanced.diagnostics],
    emittedRuntimeCommands: advanced.emittedRuntimeCommands,
    ...(advanced.navigationRequest ? { navigationRequest: advanced.navigationRequest } : {}),
    ...(advanced.stopReason ? { stopReason: advanced.stopReason } : {})
  };
  const stopped = stopStoryPlayAutomation(play, "choice");
  const playAfterStep = applyStoryStep(stopped, story, "choice");
  return {
    story,
    play: playAfterStep,
    intent: {
      source: "choice",
      pacing: "normal",
      ...(playAfterStep.lastStopReason ? { stopReason: playAfterStep.lastStopReason } : {})
    }
  };
}

export function selectStoryPlaySchedule(
  play: StoryPlayState,
  story: StoryRuntimeState,
  options: StoryPlayScheduleOptions = {}
): StoryPlaySchedule {
  const active = options.active ?? true;
  if (!active || story.ended || story.pendingChoices.length > 0 || story.presentationWait || story.runtimeWait) return { type: "idle" };
  if (options.hostBlocked || options.hostReadyForAuto === false) return { type: "idle" };

  const timing = { ...defaultStoryPlayTimingPolicy, ...options.timing };
  if (play.mode === "skip") return { type: "wait", source: "skip", delayMs: timing.skipDelayMs };

  if (play.mode === "auto") {
    return {
      type: "wait",
      source: "auto",
      delayMs: autoDelayForVisibleChars(selectVisibleCharCount(play, story), timing)
    };
  }

  if (play.currentStop?.autoNext) {
    return {
      type: "wait",
      source: "auto-next",
      delayMs: autoDelayForVisibleChars(play.currentStop.visibleCharCount, timing)
    };
  }

  return { type: "idle" };
}

export function autoDelayForVisibleChars(visibleCharCount: number, timing: StoryPlayTimingPolicy = defaultStoryPlayTimingPolicy): number {
  const raw = timing.autoBaseDelayMs + Math.max(0, visibleCharCount) * timing.autoPerVisibleCharMs;
  return Math.min(timing.autoMaxDelayMs, Math.max(timing.autoMinDelayMs, raw));
}

function applyStoryStep(play: StoryPlayState, story: StoryStepperResult, source: StoryPlayAdvanceSource): StoryPlayState {
  const currentStop = createCurrentStop(story, source);
  if (story.navigationRequest) return { ...play, currentStop };
  if (story.state.ended) return { ...play, mode: "manual", lastStopReason: "story-ended", currentStop };
  if (story.state.pendingChoices.length > 0) return { ...play, mode: "manual", lastStopReason: "choice", currentStop };
  return { ...play, currentStop };
}

function withoutStopReason(play: StoryPlayState): Omit<StoryPlayState, "lastStopReason"> {
  const { lastStopReason: _lastStopReason, ...rest } = play;
  void _lastStopReason;
  return rest;
}

function createCurrentStop(story: StoryStepperResult, source: StoryPlayAdvanceSource): StoryPlayCurrentStop {
  const print = latestPrintCommand(story.emittedRuntimeCommands);
  const text = stringParam(print, "text") ?? selectCurrentStoryLine(story.state)?.text ?? "";
  return {
    source,
    autoNext: booleanParam(print, "autoNext") ?? false,
    visibleCharCount: countVisibleChars(text),
    hasChoices: story.state.pendingChoices.length > 0,
    ended: story.state.ended
  };
}

function selectVisibleCharCount(play: StoryPlayState, story: StoryRuntimeState): number {
  return play.currentStop?.visibleCharCount ?? countVisibleChars(selectCurrentStoryLine(story)?.text ?? "");
}

function latestPrintCommand(commands: RuntimeCommand[]): RuntimeCommand | undefined {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index];
    if (command?.commandId === "print") return command;
  }
  return undefined;
}

function stringParam(command: RuntimeCommand | undefined, key: string): string | undefined {
  const value = scalarParam(command, key);
  return value === undefined ? undefined : String(value);
}

function booleanParam(command: RuntimeCommand | undefined, key: string): boolean | undefined {
  const value = scalarParam(command, key);
  return typeof value === "boolean" ? value : undefined;
}

function scalarParam(command: RuntimeCommand | undefined, key: string): string | number | boolean | undefined {
  if (!command) return undefined;
  const value: RuntimeValue | undefined = command.params[key];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}

function countVisibleChars(text: string): number {
  return Array.from(text).filter((char) => /\S/u.test(char)).length;
}
