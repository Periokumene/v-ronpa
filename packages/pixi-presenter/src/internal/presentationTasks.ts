export type PixiPresentationTaskKind =
  | "actor-transition"
  | "character-tone-transition"
  | "screen-filter-transition"
  | "weather-transition"
  | "flash"
  | "shake"
  | "glitch";

export type PixiPresentationTaskStatus = "running" | "completed" | "cancelled" | "settled";

export interface PixiPresentationTaskSnapshot {
  id: string;
  kind: PixiPresentationTaskKind;
  target: string;
  revision: number;
  durationMs: number;
  status: PixiPresentationTaskStatus;
  startedAtMs: number;
}

export interface PixiPresentationTaskStartInput {
  kind: PixiPresentationTaskKind;
  target?: string;
  revision: number;
  durationMs: number;
  onCancel?: () => void;
  onSettle?: () => void;
  onComplete?: () => void;
}

export interface PixiPresentationTaskHandle extends PixiPresentationTaskSnapshot {
  readonly generation: number;
  complete(): void;
  cancel(): void;
  settle(): void;
  isCurrent(): boolean;
}

type PixiPresentationTaskListener = (tasks: PixiPresentationTaskSnapshot[]) => void;

interface PixiPresentationTaskRecord extends PixiPresentationTaskSnapshot {
  generation: number;
  onCancel?: () => void;
  onSettle?: () => void;
  onComplete?: () => void;
}

export class PresentationTaskController {
  private readonly tasks = new Map<string, PixiPresentationTaskRecord>();
  private readonly subscribers = new Set<PixiPresentationTaskListener>();
  private sequence = 0;
  private generation = 0;
  private elapsedMs = 0;

  constructor(listener?: PixiPresentationTaskListener) {
    if (listener) this.subscribers.add(listener);
  }

  tick(deltaMs: number): void {
    this.elapsedMs += Math.max(0, deltaMs);
  }

  start(input: PixiPresentationTaskStartInput): PixiPresentationTaskHandle {
    const target = input.target ?? "stage";
    this.finishMatching(input.kind, target, "settled", false);
    const id = `${input.kind}:${target}:${input.revision}:${++this.sequence}`;
    const record: PixiPresentationTaskRecord = {
      id,
      kind: input.kind,
      target,
      revision: input.revision,
      durationMs: Math.max(0, input.durationMs),
      status: "running",
      startedAtMs: this.elapsedMs,
      generation: this.generation,
      ...(input.onCancel ? { onCancel: input.onCancel } : {}),
      ...(input.onSettle ? { onSettle: input.onSettle } : {}),
      ...(input.onComplete ? { onComplete: input.onComplete } : {})
    };
    this.tasks.set(id, record);
    this.notify();
    return this.createHandle(record);
  }

  complete(id: string, generation?: number): void {
    this.finish(id, "completed", generation);
  }

  cancel(id: string, generation?: number): void {
    this.finish(id, "cancelled", generation);
  }

  settle(id: string, generation?: number): void {
    this.finish(id, "settled", generation);
  }

  cancelAll(): void {
    this.generation += 1;
    this.finishAll("cancelled");
  }

  cancelTarget(target: string): void {
    let changed = false;
    for (const task of [...this.tasks.values()]) {
      if (task.target !== target) continue;
      this.finishRecord(task, "cancelled");
      changed = true;
    }
    if (changed) this.notify();
  }

  settleAllNonHold(): void {
    this.generation += 1;
    this.finishAll("settled");
  }

  subscribe(listener: PixiPresentationTaskListener): () => void {
    this.subscribers.add(listener);
    listener(this.snapshot());
    return () => {
      this.subscribers.delete(listener);
    };
  }

  snapshot(): PixiPresentationTaskSnapshot[] {
    return [...this.tasks.values()].map(toSnapshot);
  }

  isCurrent(id: string, generation: number): boolean {
    const task = this.tasks.get(id);
    return Boolean(task && task.status === "running" && task.generation === generation);
  }

  private createHandle(record: PixiPresentationTaskRecord): PixiPresentationTaskHandle {
    return {
      ...toSnapshot(record),
      generation: record.generation,
      complete: () => this.complete(record.id, record.generation),
      cancel: () => this.cancel(record.id, record.generation),
      settle: () => this.settle(record.id, record.generation),
      isCurrent: () => this.isCurrent(record.id, record.generation)
    };
  }

  private finishMatching(kind: PixiPresentationTaskKind, target: string, status: PixiPresentationTaskStatus, notify: boolean): void {
    for (const task of [...this.tasks.values()]) {
      if (task.kind === kind && task.target === target) this.finishRecord(task, status);
    }
    if (notify) this.notify();
  }

  private finishAll(status: PixiPresentationTaskStatus): void {
    for (const task of [...this.tasks.values()]) this.finishRecord(task, status);
    this.notify();
  }

  private finish(id: string, status: PixiPresentationTaskStatus, generation?: number): void {
    const task = this.tasks.get(id);
    if (!task || task.status !== "running") return;
    if (generation !== undefined && task.generation !== generation) return;
    this.finishRecord(task, status);
    this.notify();
  }

  private finishRecord(task: PixiPresentationTaskRecord, status: PixiPresentationTaskStatus): void {
    if (!this.tasks.has(task.id)) return;
    task.status = status;
    this.tasks.delete(task.id);
    if (status === "completed") task.onComplete?.();
    else if (status === "settled") task.onSettle?.();
    else if (status === "cancelled") task.onCancel?.();
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}

function toSnapshot(task: PixiPresentationTaskRecord): PixiPresentationTaskSnapshot {
  return {
    id: task.id,
    kind: task.kind,
    target: task.target,
    revision: task.revision,
    durationMs: task.durationMs,
    status: task.status,
    startedAtMs: task.startedAtMs
  };
}
