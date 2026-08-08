import type { PixiActorSnapshot } from "@v-ronpa/contracts";
import { Container, type Ticker } from "pixi.js";
import type { PixiPresenterSystemsOptions } from "../systemTypes";
import { ActorBlurController } from "./blur";
import { SignalMaskEffectController } from "./signalMask";

/** Owns the fixed SignalMask -> Blur -> actor-local transient outer stack. */
export class ActorFilterSystem {
  private readonly actorBlur: ActorBlurController;
  private readonly signalMask: SignalMaskEffectController;

  constructor(options: PixiPresenterSystemsOptions) {
    this.actorBlur = new ActorBlurController(options);
    this.signalMask = new SignalMaskEffectController(options);
  }

  applyActorFilters(
    container: Container,
    actor: PixiActorSnapshot,
    liveFilters: Partial<Record<string, number>> = { blur: actor.filters.blur, bokeh: actor.filters.bokeh }
  ): void {
    this.actorBlur.apply(container, actor, liveFilters);
    this.signalMask.apply(container, actor.filters.signalMask, liveFilters);
  }

  releaseActorFilters(container: Container): void {
    this.signalMask.release(container);
    this.actorBlur.release(container);
  }

  relayoutActorFilterArea(container: Container): void {
    this.actorBlur.relayout(container);
    this.signalMask.relayout(container);
  }

  tick(ticker: Ticker): void { this.signalMask.tick(ticker); }
  clear(): void { this.signalMask.clear(); }
  destroy(): void { this.signalMask.destroy(); }
}
