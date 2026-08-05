import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Graphics, type Container } from "pixi.js";
import type { PixiPresentationTaskHandle, PresentationTaskController } from "../../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../../systemTypes";
import type { TweenHandle, TweenSystem } from "../animation";
import type { TransientEffectController } from "./types";

type FlashHint = Extract<PixiStageRenderHint, { type: "flash" }>;

interface ViewportGraphicRecord {
  graphic: Graphics;
  color: number;
  alpha: number;
}

export class FlashEffectController implements TransientEffectController {
  private readonly records = new Set<ViewportGraphicRecord>();
  private readonly activeTasks = new Set<PixiPresentationTaskHandle>();

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly layer: Container,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  run(hint: FlashHint, revision: number): void {
    const flash = new Graphics({ label: "flash-overlay" });
    const record = { graphic: flash, color: Number.parseInt(hint.color.replace("#", ""), 16), alpha: 0.55 };
    this.records.add(record);
    draw(record, this.options.width(), this.options.height());
    flash.alpha = 0.55;
    this.layer.addChild(flash);
    const cleanup = () => {
      this.records.delete(record);
      flash.removeFromParent();
      flash.destroy();
    };
    let handle: TweenHandle | undefined;
    let task!: PixiPresentationTaskHandle;
    task = this.tasks.start({
      kind: "flash",
      target: "screen",
      revision,
      durationMs: hint.durationMs,
      onCancel: () => {
        this.activeTasks.delete(task);
        handle?.stop();
        cleanup();
      },
      onSettle: () => {
        this.activeTasks.delete(task);
        handle?.stop();
        cleanup();
      }
    });
    this.activeTasks.add(task);
    handle = this.tweens.tween(flash as unknown as Record<string, number>, { alpha: 0 }, hint.durationMs, "linear", () => {
      if (!task.isCurrent()) return;
      cleanup();
      this.activeTasks.delete(task);
      task.complete();
    });
  }

  relayoutViewport(): void {
    for (const record of this.records) draw(record, this.options.width(), this.options.height());
  }

  clear(): void {
    for (const task of [...this.activeTasks]) task.cancel();
    this.activeTasks.clear();
    for (const record of [...this.records]) {
      record.graphic.removeFromParent();
      record.graphic.destroy();
    }
    this.records.clear();
  }

  destroy(): void {
    this.clear();
  }
}

function draw(record: ViewportGraphicRecord, width: number, height: number): void {
  record.graphic.clear().rect(0, 0, width, height).fill({ color: record.color, alpha: record.alpha });
}
