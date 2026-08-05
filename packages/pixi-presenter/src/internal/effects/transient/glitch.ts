import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Filter } from "pixi.js";
import type { PixiPresentationTaskHandle, PresentationTaskController } from "../../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../../systemTypes";
import type { RootFilterStack } from "../rootFilterStack";
import type { TweenHandle, TweenSystem } from "../animation";
import {
  applyGlitchUniforms,
  createGlitchShaderFilter,
  setGlitchResolution,
  type GlitchShaderRecord
} from "../glitchShader";
import type { TransientEffectController } from "./types";

type GlitchHint = Extract<PixiStageRenderHint, { type: "glitch" }>;

export class TransientGlitchEffectController implements TransientEffectController {
  private readonly records = new Set<GlitchShaderRecord>();
  private readonly activeTasks = new Set<PixiPresentationTaskHandle>();

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  run(hint: GlitchHint, revision: number): void {
    let handle: TweenHandle | undefined;
    let record: GlitchShaderRecord | undefined;
    const cleanup = () => {
      handle?.stop();
      if (record) this.remove(record);
    };
    let task!: PixiPresentationTaskHandle;
    task = this.tasks.start({
      kind: "glitch",
      target: "screen",
      revision,
      durationMs: hint.durationMs,
      onCancel: () => {
        this.activeTasks.delete(task);
        cleanup();
      },
      onSettle: () => {
        this.activeTasks.delete(task);
        cleanup();
      }
    });
    this.activeTasks.add(task);
    record = createGlitchShaderFilter(this.options.width(), this.options.height());
    applyGlitchUniforms(record.uniforms, hint, { progress: 0 });
    this.records.add(record);
    this.rootFilters.addTransientFilter(record.filter as unknown as Filter);
    handle = this.tweens.tween(
      record.uniforms as unknown as Record<string, number>,
      { uTime: Math.max(0.001, hint.durationMs / 1000), uProgress: 1 },
      Math.max(1, hint.durationMs),
      "linear",
      () => {
        if (!task.isCurrent()) return;
        cleanup();
        this.activeTasks.delete(task);
        task.complete();
      }
    );
  }

  relayoutViewport(): void {
    for (const record of this.records) setGlitchResolution(record.uniforms, this.options.width(), this.options.height());
  }

  clear(): void {
    for (const task of [...this.activeTasks]) task.cancel();
    this.activeTasks.clear();
    for (const record of [...this.records]) this.remove(record);
  }

  destroy(): void {
    this.clear();
  }

  private remove(record: GlitchShaderRecord): void {
    if (!this.records.delete(record)) return;
    this.rootFilters.removeTransientFilter(record.filter as unknown as Filter);
    record.filter.destroy();
  }
}
