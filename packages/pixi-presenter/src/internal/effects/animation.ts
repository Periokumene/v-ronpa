import { Easing, Group, Tween } from "@tweenjs/tween.js";
import type { PixiPresentationTaskKind } from "@v-ronpa/contracts";
import type { Ticker } from "pixi.js";
import type { PixiPresentationTaskHandle, PresentationTaskController } from "../presentationTasks";

export interface TweenHandle {
  stop(): void;
}

export type NumericLiveState = Record<string, number>;

export class TweenSystem {
  private readonly group = new Group();
  private elapsedMs = 0;
  private generation = 0;

  tween(
    target: Record<string, number>,
    to: Record<string, number>,
    durationMs: number,
    easingName?: string,
    onComplete?: () => void,
    delayMs = 0,
    onUpdate?: () => void
  ): TweenHandle {
    if (durationMs <= 0) {
      Object.assign(target, to);
      onUpdate?.();
      onComplete?.();
      return { stop: () => undefined };
    }
    const generation = this.generation;
    const tween = new Tween(target, this.group)
      .to(to, durationMs)
      .easing(resolveEasing(easingName))
      .onUpdate(() => {
        if (generation === this.generation) onUpdate?.();
      })
      .onComplete(() => {
        if (generation === this.generation) onComplete?.();
      });
    if (delayMs > 0) tween.delay(delayMs);
    tween.start(this.elapsedMs);
    return {
      stop: () => {
        tween.stop();
        this.group.remove(tween);
      }
    };
  }

  tick(ticker: Ticker): void {
    this.elapsedMs += Math.max(0, ticker.deltaMS);
    this.group.update(this.elapsedMs);
  }

  clear(): void {
    this.generation += 1;
    this.group.removeAll();
  }
}

interface LiveParamTransitionInput {
  state: NumericLiveState;
  to: NumericLiveState;
  animate: boolean;
  durationMs: number;
  easing?: string | undefined;
  forceTask?: boolean | undefined;
  task?: { kind: PixiPresentationTaskKind; target: string; revision: number };
  onUpdate?: () => void;
  onComplete?: () => void;
  onSettle?: () => void;
  onCancel?: () => void;
}

interface LiveParamTransitionRecord {
  state: NumericLiveState;
  to: NumericLiveState;
  handle: TweenHandle;
  task?: PixiPresentationTaskHandle;
  onUpdate?: () => void;
  onComplete?: () => void;
  onSettle?: () => void;
  onCancel?: () => void;
}

export class LiveParamTransition {
  private active: LiveParamTransitionRecord | undefined;

  constructor(private readonly tweens: TweenSystem, private readonly tasks: PresentationTaskController) {}

  start(input: LiveParamTransitionInput): void {
    const targetState = { ...input.to };
    const hasDelta = hasNumericDelta(input.state, targetState);
    const shouldAnimate = input.animate && input.durationMs > 0 && (hasDelta || Boolean(input.forceTask));
    this.detachActive();
    if (!shouldAnimate) {
      assignLiveState(input.state, targetState);
      input.onUpdate?.();
      input.onComplete?.();
      return;
    }

    const tweenState = hasDelta ? input.state : { value: 0 };
    const tweenTarget = hasDelta ? targetState : { value: 1 };
    const record: LiveParamTransitionRecord = {
      state: input.state,
      to: targetState,
      handle: { stop: () => undefined },
      ...(input.onUpdate ? { onUpdate: input.onUpdate } : {}),
      ...(input.onComplete ? { onComplete: input.onComplete } : {}),
      ...(input.onSettle ? { onSettle: input.onSettle } : {}),
      ...(input.onCancel ? { onCancel: input.onCancel } : {})
    };
    this.active = record;
    if (input.task) {
      record.task = this.tasks.start({
        kind: input.task.kind,
        target: input.task.target,
        revision: input.task.revision,
        durationMs: input.durationMs,
        onCancel: () => {
          if (this.active !== record) return;
          record.handle.stop();
          this.active = undefined;
          record.onCancel?.();
        },
        onSettle: () => {
          if (this.active !== record) return;
          record.handle.stop();
          this.finish(record, "settle");
        }
      });
    }
    input.onUpdate?.();
    record.handle = this.tweens.tween(
      tweenState,
      tweenTarget,
      input.durationMs,
      input.easing,
      () => {
        if (this.active === record) this.finish(record, "complete");
      },
      0,
      hasDelta ? input.onUpdate : undefined
    );
  }

  cancel(applyTarget = false): void {
    const record = this.active;
    if (!record) return;
    record.handle.stop();
    this.active = undefined;
    if (record.task?.isCurrent()) record.task.cancel();
    if (applyTarget) {
      assignLiveState(record.state, record.to);
      record.onUpdate?.();
    }
  }

  private detachActive(): void {
    const record = this.active;
    if (!record) return;
    record.handle.stop();
    this.active = undefined;
    record.task?.settle();
  }

  private finish(record: LiveParamTransitionRecord, status: "complete" | "settle"): void {
    assignLiveState(record.state, record.to);
    record.onUpdate?.();
    this.active = undefined;
    if (status === "complete") {
      record.onComplete?.();
      if (record.task?.isCurrent()) record.task.complete();
    } else record.onSettle?.();
  }
}

function resolveEasing(name: string | undefined): (amount: number) => number {
  if (name === "linear") return Easing.Linear.None;
  if (name === "easeIn") return Easing.Cubic.In;
  if (name === "easeInOut") return Easing.Cubic.InOut;
  return Easing.Cubic.Out;
}

function hasNumericDelta(current: NumericLiveState, target: NumericLiveState): boolean {
  return Object.entries(target).some(([key, value]) => Math.abs((current[key] ?? 0) - value) > 0.001);
}

function assignLiveState(current: NumericLiveState, target: NumericLiveState): void {
  for (const [key, value] of Object.entries(target)) current[key] = value;
}
