import type { RichTextDocument } from "@v-ronpa/contracts";

export type StoryTextRevealStatus = "revealing" | "complete";

export type StoryTextRevealEvent =
  | { type: "reveal-start"; lineKey: string; atMs: number }
  | { type: "reveal-tick"; lineKey: string; atMs: number; unit: string; unitIndex: number; visibleUnitCount: number }
  | { type: "reveal-finish"; lineKey: string; atMs: number };

export interface StoryTextRevealEventCursor {
  started: boolean;
  tickUnitCount: number;
  finished: boolean;
}

export interface StoryTextRevealState {
  lineKey: string;
  text: string;
  units: string[];
  visibleUnitCount: number;
  startedAtMs: number;
  durationMs: number;
  status: StoryTextRevealStatus;
  eventCursor: StoryTextRevealEventCursor;
}

export interface CreateStoryTextRevealStateInput {
  lineKey: string;
  text: string;
  startedAtMs: number;
  durationMs: number;
}

export interface StoryTextRevealStep {
  state: StoryTextRevealState;
  events: StoryTextRevealEvent[];
}

export interface StoryTextPacingPlanInput {
  unitCount: number;
  textSpeed: number;
  scriptSpeed?: number;
  totalDelayMs?: number;
  revealBudgetRatio?: number;
  baseUnitDelayMs?: number;
}

export interface StoryTextPacingPlan {
  revealDurationMs: number;
  rawRevealDurationMs: number;
  revealBudgetRatio: number;
  unitDelayMs: number;
  totalDelayMs?: number;
}

const DEFAULT_SCRIPT_SPEED = 1;
const DEFAULT_REVEAL_BUDGET_RATIO = 0.75;
const DEFAULT_REVEAL_UNIT_DELAY_MS = 45;

type GraphemeSegmenter = new (
  locale?: string | string[],
  options?: { granularity: "grapheme" }
) => { segment(input: string): Iterable<{ segment: string }> };

export function createStoryTextRevealState({
  durationMs,
  lineKey,
  startedAtMs,
  text
}: CreateStoryTextRevealStateInput): StoryTextRevealState {
  const units = segmentStoryTextRevealUnits(text);
  const normalizedDurationMs = Math.max(0, Math.round(durationMs));
  const complete = units.length === 0 || normalizedDurationMs === 0;
  return {
    lineKey,
    text,
    units,
    visibleUnitCount: complete ? units.length : 0,
    startedAtMs,
    durationMs: normalizedDurationMs,
    status: complete ? "complete" : "revealing",
    eventCursor: { started: false, tickUnitCount: 0, finished: false }
  };
}

export function advanceStoryTextReveal(state: StoryTextRevealState, nowMs: number): StoryTextRevealStep {
  if (state.status === "complete") return emitStoryTextRevealEvents(state, nowMs, { emitTicks: false });

  const visibleUnitCount = nextVisibleUnitCount(state, nowMs);
  const complete = visibleUnitCount >= state.units.length;
  return emitStoryTextRevealEvents(
    {
      ...state,
      visibleUnitCount,
      status: complete ? "complete" : "revealing"
    },
    nowMs
  );
}

export function completeStoryTextReveal(state: StoryTextRevealState, nowMs: number): StoryTextRevealStep {
  return emitStoryTextRevealEvents(
    {
      ...state,
      visibleUnitCount: state.units.length,
      status: "complete"
    },
    nowMs,
    { emitTicks: false }
  );
}

export function selectVisibleRevealText(state: StoryTextRevealState | undefined): string | undefined {
  if (!state) return undefined;
  if (state.status === "complete") return state.text;
  return state.units.slice(0, state.visibleUnitCount).join("");
}

export function selectVisibleRevealRichText(
  document: RichTextDocument | undefined,
  state: StoryTextRevealState | undefined
): RichTextDocument | undefined {
  if (!document) return undefined;
  if (!state) return document;
  if (document.text !== state.text) return undefined;
  const text = selectVisibleRevealText(state) ?? state.text;
  const visibleLength = Array.from(text).length;
  return {
    text,
    runs: document.runs
      .filter((run) => run.start < visibleLength)
      .map((run) => ({
        start: run.start,
        end: Math.min(run.end, visibleLength),
        style: { ...run.style }
      }))
      .filter((run) => run.end > run.start)
  };
}

export function countStoryTextRevealUnits(text: string): number {
  return segmentStoryTextRevealUnits(text).length;
}

export function createStoryTextPacingPlan({
  baseUnitDelayMs = DEFAULT_REVEAL_UNIT_DELAY_MS,
  revealBudgetRatio = DEFAULT_REVEAL_BUDGET_RATIO,
  scriptSpeed = DEFAULT_SCRIPT_SPEED,
  textSpeed,
  totalDelayMs,
  unitCount
}: StoryTextPacingPlanInput): StoryTextPacingPlan {
  const normalizedUnitCount = Math.max(0, Math.floor(unitCount));
  const normalizedTextSpeed = clamp(textSpeed, 0, 1);
  const normalizedScriptSpeed = scriptSpeed > 0 ? scriptSpeed : DEFAULT_SCRIPT_SPEED;
  const normalizedRatio = clamp(revealBudgetRatio, 0, 1);
  const unitDelayMs = Math.max(1, baseUnitDelayMs * speedToDelayMultiplier(normalizedTextSpeed) / normalizedScriptSpeed);
  const rawRevealDurationMs = Math.round(normalizedUnitCount * unitDelayMs);
  const cappedByBudget =
    totalDelayMs !== undefined ? Math.round(Math.max(0, totalDelayMs) * normalizedRatio) : rawRevealDurationMs;
  return {
    revealDurationMs: normalizedUnitCount === 0 ? 0 : Math.max(0, Math.min(rawRevealDurationMs, cappedByBudget)),
    rawRevealDurationMs,
    revealBudgetRatio: normalizedRatio,
    unitDelayMs,
    ...(totalDelayMs !== undefined ? { totalDelayMs: Math.max(0, Math.round(totalDelayMs)) } : {})
  };
}

function emitStoryTextRevealEvents(
  state: StoryTextRevealState,
  nowMs: number,
  options: { emitTicks?: boolean } = {}
): StoryTextRevealStep {
  const events: StoryTextRevealEvent[] = [];
  const eventCursor = { ...state.eventCursor };
  const emitTicks = options.emitTicks ?? true;

  if (!eventCursor.started) {
    events.push({ type: "reveal-start", lineKey: state.lineKey, atMs: nowMs });
    eventCursor.started = true;
  }

  if (emitTicks) {
    for (let index = eventCursor.tickUnitCount; index < state.visibleUnitCount; index += 1) {
      events.push({
        type: "reveal-tick",
        lineKey: state.lineKey,
        atMs: nowMs,
        unit: state.units[index] ?? "",
        unitIndex: index,
        visibleUnitCount: index + 1
      });
    }
  }
  eventCursor.tickUnitCount = Math.max(eventCursor.tickUnitCount, state.visibleUnitCount);

  if (state.status === "complete" && !eventCursor.finished) {
    events.push({ type: "reveal-finish", lineKey: state.lineKey, atMs: nowMs });
    eventCursor.finished = true;
  }

  return { state: { ...state, eventCursor }, events };
}

function nextVisibleUnitCount(state: StoryTextRevealState, nowMs: number): number {
  if (state.units.length === 0 || state.durationMs === 0) return state.units.length;
  const elapsedMs = Math.max(0, nowMs - state.startedAtMs);
  if (elapsedMs >= state.durationMs) return state.units.length;
  return Math.min(state.units.length, Math.floor((elapsedMs / state.durationMs) * state.units.length));
}

function segmentStoryTextRevealUnits(text: string): string[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: GraphemeSegmenter }).Segmenter;
  if (!Segmenter) return Array.from(text);
  const segmenter = new Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (segment) => segment.segment);
}

function speedToDelayMultiplier(speed: number): number {
  return 1.75 - speed * 1.5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
