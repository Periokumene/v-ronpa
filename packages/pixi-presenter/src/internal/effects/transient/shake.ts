import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import type { Container } from "pixi.js";
import type { PixiPresentationTaskHandle, PresentationTaskController } from "../../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../../systemTypes";
import type { TweenHandle, TweenSystem } from "../animation";
import type { TransientActorTargetResolver, TransientEffectController } from "./types";

type ShakeHint = Extract<PixiStageRenderHint, { type: "shake" }>;

export class ShakeEffectController implements TransientEffectController {
  private readonly activeTasks = new Set<PixiPresentationTaskHandle>();

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly actors: TransientActorTargetResolver,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  run(hint: ShakeHint, revision: number): void {
    const target = this.actors.getLayerForEffects(hint.target) ?? this.options.root;
    const origin = { x: target.x, y: target.y };
    const iterations = Math.max(1, Math.round(hint.loop ? Math.max(hint.count ?? 3, 6) : hint.count ?? 3));
    const handles: TweenHandle[] = [];
    const cleanup = () => restore(target, origin, handles);
    let task!: PixiPresentationTaskHandle;
    task = this.tasks.start({
      kind: "shake",
      target: hint.target,
      revision,
      durationMs: Math.max(0, hint.durationMs * iterations),
      onCancel: () => {
        this.activeTasks.delete(task);
        cleanup();
      },
      onSettle: () => {
        this.activeTasks.delete(task);
        cleanup();
      }
    });
    // start() settles an older shake with the same target synchronously. Capture
    // the replacement origin after that cleanup has restored the target.
    origin.x = target.x;
    origin.y = target.y;
    this.activeTasks.add(task);
    const tween = (to: Record<string, number>, durationMs: number, onComplete?: () => void) => {
      const handle = this.tweens.tween(target as unknown as Record<string, number>, to, durationMs, "easeOut", () => {
        if (!task.isCurrent()) return;
        onComplete?.();
      });
      handles.push(handle);
    };
    const shakeOnce = (index: number) => {
      if (index >= iterations) {
        tween(origin, Math.min(80, hint.durationMs), () => {
          if (!task.isCurrent()) return;
          this.activeTasks.delete(task);
          task.complete();
        });
        return;
      }
      const amplitude = Math.max(0, hint.intensity + (index % 2 === 0 ? hint.deltaPower ?? 0 : -(hint.deltaPower ?? 0))) * 28;
      const durationMs = Math.max(16, hint.durationMs + (index % 2 === 0 ? hint.deltaTimeMs ?? 0 : -(hint.deltaTimeMs ?? 0)));
      const polarity = index % 2 === 0 ? 1 : -1;
      tween({
        x: hint.hor ? origin.x + amplitude * polarity : origin.x,
        y: hint.ver === false ? origin.y : origin.y + amplitude * polarity
      }, durationMs / 2, () => tween(origin, durationMs / 2, () => shakeOnce(index + 1)));
    };
    shakeOnce(0);
  }

  relayoutViewport(): void {}

  clear(): void {
    for (const task of [...this.activeTasks]) task.cancel();
    this.activeTasks.clear();
  }

  destroy(): void {
    this.clear();
  }
}

function restore(target: Container, origin: { x: number; y: number }, handles: TweenHandle[]): void {
  handles.forEach((handle) => handle.stop());
  target.x = origin.x;
  target.y = origin.y;
}
