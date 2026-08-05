import type { Container } from "pixi.js";

export interface TransientActorTargetResolver {
  getLayerForEffects(target: string): Container | undefined;
}

export interface TransientEffectController {
  clear(): void;
  destroy(): void;
  relayoutViewport(): void;
}
