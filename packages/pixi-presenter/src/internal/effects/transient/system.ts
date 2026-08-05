import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Container } from "pixi.js";
import type { PresentationTaskController } from "../../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../../systemTypes";
import type { TweenSystem } from "../animation";
import { TRANSIENT_EFFECT_HINT_TYPES } from "../registries";
import type { RootFilterStack } from "../rootFilterStack";
import { FlashEffectController } from "./flash";
import { TransientGlitchEffectController } from "./glitch";
import { ShakeEffectController } from "./shake";
import type { TransientActorTargetResolver, TransientEffectController } from "./types";

type FlashHint = Extract<PixiStageRenderHint, { type: "flash" }>;
type ShakeHint = Extract<PixiStageRenderHint, { type: "shake" }>;
type GlitchHint = Extract<PixiStageRenderHint, { type: "glitch" }>;
type TransientHint = FlashHint | ShakeHint | GlitchHint;
type TransientHintType = (typeof TRANSIENT_EFFECT_HINT_TYPES)[number];

interface TransientEffectRegistration {
  controller: TransientEffectController;
  run(hint: TransientHint, revision: number): void;
}

/** Static, thin family dispatcher. It owns ordering; controllers own resources. */
export class TransientEffectSystem {
  private readonly layer = new Container({ label: "transient-effects" });
  private readonly registry: Readonly<Record<TransientHintType, TransientEffectRegistration>>;

  constructor(
    options: PixiPresenterSystemsOptions,
    actors: TransientActorTargetResolver,
    rootFilters: RootFilterStack,
    tweens: TweenSystem,
    tasks: PresentationTaskController
  ) {
    this.layer.zIndex = 30;
    options.root.sortableChildren = true;
    options.root.addChild(this.layer);
    const flash = new FlashEffectController(options, this.layer, tweens, tasks);
    const shake = new ShakeEffectController(options, actors, tweens, tasks);
    const glitch = new TransientGlitchEffectController(options, rootFilters, tweens, tasks);
    this.registry = Object.freeze({
      flash: { controller: flash, run: (hint, revision) => flash.run(hint as FlashHint, revision) },
      shake: { controller: shake, run: (hint, revision) => shake.run(hint as ShakeHint, revision) },
      glitch: { controller: glitch, run: (hint, revision) => glitch.run(hint as GlitchHint, revision) }
    } satisfies Record<TransientHintType, TransientEffectRegistration>);
  }

  run(hints: PixiStageRenderHint[], revision: number): void {
    for (const hint of hints) {
      if (!isTransientHint(hint)) continue;
      this.registry[hint.type].run(hint, revision);
    }
  }

  relayoutViewport(): void {
    for (const type of TRANSIENT_EFFECT_HINT_TYPES) this.registry[type].controller.relayoutViewport();
  }

  clear(): void {
    for (const type of TRANSIENT_EFFECT_HINT_TYPES) this.registry[type].controller.clear();
  }

  destroy(): void {
    for (const type of TRANSIENT_EFFECT_HINT_TYPES) this.registry[type].controller.destroy();
    this.layer.removeFromParent();
    this.layer.destroy({ children: true });
  }
}

function isTransientHint(hint: PixiStageRenderHint): hint is TransientHint {
  return TRANSIENT_EFFECT_HINT_TYPES.includes(hint.type as TransientHintType);
}

export type { TransientActorTargetResolver } from "./types";
