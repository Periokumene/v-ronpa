export type VisualEffectKind = "fadeIn" | "flash" | "shake";

export interface VisualEffectTarget {
  alpha?: number;
  x?: number;
  y?: number;
}

export interface VisualEffectRequest {
  kind: VisualEffectKind;
  durationMs: number;
  target?: VisualEffectTarget;
  intensity?: number;
  onStart?: () => void;
  onUpdate?: (progress: number, easedProgress: number) => void;
  onComplete?: () => void;
}

interface ActiveVisualEffect extends VisualEffectRequest {
  elapsedMs: number;
  initialAlpha?: number;
  initialX?: number;
  initialY?: number;
}

export class VisualEffectScheduler {
  private pending: VisualEffectRequest[] = [];
  private active: ActiveVisualEffect[] = [];
  private destroyed = false;

  enqueue(request: VisualEffectRequest): void {
    if (this.destroyed) return;
    this.pending.push(request);
  }

  tick(deltaMs: number): void {
    if (this.destroyed) return;
    this.startPending();
    if (this.active.length === 0) return;

    const survivors: ActiveVisualEffect[] = [];
    for (const effect of this.active) {
      effect.elapsedMs += Math.max(0, deltaMs);
      const progress = Math.min(1, effect.elapsedMs / effect.durationMs);
      const eased = easeOutCubic(progress);
      this.applyEffect(effect, progress, eased);
      effect.onUpdate?.(progress, eased);

      if (progress >= 1) {
        this.finishEffect(effect);
      } else {
        survivors.push(effect);
      }
    }
    this.active = survivors;
  }

  activeCount(): number {
    return this.pending.length + this.active.length;
  }

  clear(): void {
    for (const effect of this.active) {
      this.restoreTarget(effect);
      effect.onComplete?.();
    }
    for (const effect of this.pending) {
      effect.onComplete?.();
    }
    this.pending = [];
    this.active = [];
  }

  destroy(): void {
    this.clear();
    this.destroyed = true;
  }

  private startPending(): void {
    if (this.pending.length === 0) return;
    const starting = this.pending.map((request): ActiveVisualEffect => {
      request.onStart?.();
      const active: ActiveVisualEffect = {
        ...request,
        elapsedMs: 0
      };
      if (request.target?.alpha !== undefined) active.initialAlpha = request.target.alpha;
      if (request.target?.x !== undefined) active.initialX = request.target.x;
      if (request.target?.y !== undefined) active.initialY = request.target.y;
      return active;
    });
    this.pending = [];
    this.active.push(...starting);
  }

  private applyEffect(effect: ActiveVisualEffect, progress: number, eased: number): void {
    if (!effect.target) return;

    if (effect.kind === "fadeIn") {
      const startAlpha = effect.initialAlpha ?? 0;
      effect.target.alpha = startAlpha + (1 - startAlpha) * eased;
      return;
    }

    if (effect.kind === "flash") {
      effect.target.alpha = Math.max(0, 0.5 * (1 - progress));
      return;
    }

    const originX = effect.initialX ?? 0;
    const originY = effect.initialY ?? 0;
    const amplitude = (effect.intensity ?? 0.35) * 28 * (1 - progress);
    effect.target.x = originX + Math.sin(progress * Math.PI * 10) * amplitude;
    effect.target.y = originY + Math.cos(progress * Math.PI * 8) * amplitude * 0.18;
  }

  private finishEffect(effect: ActiveVisualEffect): void {
    if (effect.kind === "fadeIn" && effect.target) {
      effect.target.alpha = 1;
    } else {
      this.restoreTarget(effect);
    }
    effect.onComplete?.();
  }

  private restoreTarget(effect: ActiveVisualEffect): void {
    if (!effect.target) return;
    if (effect.initialAlpha !== undefined) effect.target.alpha = effect.initialAlpha;
    if (effect.initialX !== undefined) effect.target.x = effect.initialX;
    if (effect.initialY !== undefined) effect.target.y = effect.initialY;
  }
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}
