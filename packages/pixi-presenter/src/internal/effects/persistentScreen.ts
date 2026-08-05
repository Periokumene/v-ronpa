import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import type { Filter, Ticker } from "pixi.js";
import type { PresentationTaskController } from "../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../systemTypes";
import type { TweenSystem } from "./animation";
import { BokehEffectController } from "./bokeh";
import { PersistentGlitchEffectController } from "./persistentGlitch";
import { PERSISTENT_SCREEN_EFFECT_KEYS } from "./registries";
import type { RootFilterStack } from "./rootFilterStack";

/** Owns persistent registration and the fixed bokeh -> glitch root-filter order. */
export class PersistentScreenEffectSystem {
  private readonly registry: Readonly<Record<PersistentScreenEffectKey, PersistentScreenEffectController>>;

  constructor(
    options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    tweens: TweenSystem,
    tasks: PresentationTaskController
  ) {
    this.registry = Object.freeze({
      bokeh: new BokehEffectController(options, rootFilters, tweens, tasks),
      glitch: new PersistentGlitchEffectController(options, rootFilters, tweens, tasks)
    } satisfies Record<PersistentScreenEffectKey, PersistentScreenEffectController>);
  }

  reconcile(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[]): void {
    for (const key of PERSISTENT_SCREEN_EFFECT_KEYS) this.registry[key].reconcile(snapshot, animate, hints);
    this.rootFilters.setScreenFilters(
      PERSISTENT_SCREEN_EFFECT_KEYS
        .map((key) => this.registry[key].getFilter())
        .filter((filter) => filter !== undefined)
    );
  }

  tick(ticker: Ticker): void {
    for (const key of PERSISTENT_SCREEN_EFFECT_KEYS) this.registry[key].tick?.(ticker);
  }

  relayoutViewport(): void {
    for (const key of PERSISTENT_SCREEN_EFFECT_KEYS) this.registry[key].relayoutViewport();
    this.rootFilters.relayoutViewport();
  }

  clear(): void {
    for (const key of PERSISTENT_SCREEN_EFFECT_KEYS) this.registry[key].clear();
    this.rootFilters.setScreenFilters([]);
  }

  destroy(): void {
    for (const key of PERSISTENT_SCREEN_EFFECT_KEYS) this.registry[key].destroy();
    this.rootFilters.setScreenFilters([]);
  }
}

type PersistentScreenEffectKey = (typeof PERSISTENT_SCREEN_EFFECT_KEYS)[number];

interface PersistentScreenEffectController {
  reconcile(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[]): void;
  getFilter(): Filter | undefined;
  tick?(ticker: Ticker): void;
  relayoutViewport(): void;
  clear(): void;
  destroy(): void;
}
