import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Filter } from "pixi.js";
import type { PixiPresentationTaskHandle, PresentationTaskController } from "../../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../../systemTypes";
import type { TweenHandle, TweenSystem } from "../animation";
import {
  createEffectLabFilter, setEffectLabColor, setEffectLabResolution,
  type EffectLabShaderMode, type EffectLabShaderRecord
} from "../effectLabShader";
import type { RootFilterStack } from "../rootFilterStack";
import type { TransientActorTargetResolver, TransientEffectController } from "./types";

type LabHint = Extract<PixiStageRenderHint, { type: "impact" | "afterimage" | "shutter" | "flicker" }>;
type LabHintType = LabHint["type"];

export class EffectLabTransientController implements TransientEffectController {
  private readonly records = new Set<EffectLabShaderRecord>();
  private readonly activeTasks = new Set<PixiPresentationTaskHandle>();

  constructor(
    private readonly type: LabHintType,
    private readonly options: PixiPresenterSystemsOptions,
    private readonly actors: TransientActorTargetResolver,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  run(hint: LabHint, revision: number): void {
    // One controller instance owns one semantic family. A retrigger replaces the
    // previous member without disturbing other transient effect families.
    this.clear();
    const mode = hint.type as EffectLabShaderMode;
    const record = createEffectLabFilter(mode, this.options.width(), this.options.height());
    configure(record, hint, this.options);
    this.records.add(record);
    const actorTarget = hint.type === "afterimage" && hint.target !== "stage" && hint.target !== "camera"
      ? this.actors.getLayerForEffects(hint.target)
      : undefined;
    if (actorTarget) actorTarget.filters = [...(actorTarget.filters ?? []), record.filter as unknown as Filter];
    else this.rootFilters.addTransientFilter(record.filter as unknown as Filter);
    let tween: TweenHandle | undefined;
    const cleanup = () => {
      tween?.stop();
      if (!this.records.delete(record)) return;
      if (actorTarget) {
        const remaining = (actorTarget.filters ?? []).filter((filter) => filter !== record.filter as unknown as Filter);
        actorTarget.filters = remaining.length > 0 ? remaining : null;
      } else this.rootFilters.removeTransientFilter(record.filter as unknown as Filter);
      record.filter.destroy();
    };
    let task!: PixiPresentationTaskHandle;
    task = this.tasks.start({
      kind: this.type, target: hint.type === "afterimage" ? hint.target : "screen",
      revision, durationMs: hint.durationMs,
      onCancel: () => { this.activeTasks.delete(task); cleanup(); },
      onSettle: () => { this.activeTasks.delete(task); cleanup(); }
    });
    this.activeTasks.add(task);
    tween = this.tweens.tween(
      record.uniforms as unknown as Record<string, number>,
      { uTime: Math.max(0.001, hint.durationMs / 1000), uProgress: 1 },
      Math.max(1, hint.durationMs), hint.easing ?? "linear",
      () => {
        if (!task.isCurrent()) return;
        cleanup(); this.activeTasks.delete(task); task.complete();
      }
    );
  }

  relayoutViewport(): void {
    for (const record of this.records) setEffectLabResolution(record, this.options.width(), this.options.height());
  }

  clear(): void {
    for (const task of [...this.activeTasks]) task.cancel();
    this.activeTasks.clear();
    for (const record of [...this.records]) {
      // Actor-targeted records are cancelled through their task first, which removes their local filter.
      this.rootFilters.removeTransientFilter(record.filter as unknown as Filter);
      record.filter.destroy();
    }
    this.records.clear();
  }

  destroy(): void { this.clear(); }
}

function configure(record: EffectLabShaderRecord, hint: LabHint, options: PixiPresenterSystemsOptions): void {
  const u = record.uniforms; u.uPower = hint.power; u.uProgress = 0;
  if (hint.type === "impact") {
    u.uOrigin.set(hint.origin); u.uA = hint.direction; u.uB = hint.smear; u.uC = hint.chroma;
  } else if (hint.type === "afterimage") {
    setEffectLabColor(u.uColor, hint.tint); u.uA = hint.count; u.uB = hint.offset[0]; u.uC = hint.offset[1];
    u.uD = hint.decay; u.uE = hint.edge;
    const spacing = hint.count * (0.75 + 0.22 * hint.count);
    record.filter.padding = Math.ceil(Math.max(
      Math.abs(hint.offset[0]) * options.width(),
      Math.abs(hint.offset[1]) * options.height()
    ) * spacing + 16);
  } else if (hint.type === "shutter") {
    setEffectLabColor(u.uColor, hint.color); u.uA = hint.hold;
    u.uB = ["eyelid", "iris", "slice"].indexOf(hint.shape); u.uC = hint.skew;
    u.uH = Math.max(0.001, hint.durationMs / 1000);
  } else {
    u.uA = hint.bursts; u.uB = hint.irregularity; u.uC = hint.invert; u.uD = hint.tear;
    u.uE = hint.white; u.uF = hint.chroma; u.uSeed = hint.seed;
  }
}
