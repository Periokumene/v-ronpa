import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Container, Filter, Sprite } from "pixi.js";
import { KawaseBlurFilter } from "pixi-filters";
import { getBuiltInPixiFxTexture } from "../fxAssets";
import type { PresentationTaskController } from "../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../systemTypes";
import { LiveParamTransition, type NumericLiveState, type TweenSystem } from "./animation";
import type { RootFilterStack } from "./rootFilterStack";

interface BokehBlurFilter {
  strength: number;
  destroy(destroyPrograms?: boolean): void;
}

/** Atomically owns the persistent bokeh root blur, overlay, tween and task. */
export class BokehEffectController {
  private readonly layer = new Container({ label: "screen-filter-overlays" });
  private readonly transition: LiveParamTransition;
  private filter: BokehBlurFilter | undefined;
  private live: NumericLiveState = { power: 0 };
  private layoutKey = "";
  private layoutPower = 0;
  private snapshot: NonNullable<PixiStageSnapshot["screenFilters"]["bokeh"]> | undefined;
  private removing = false;

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {
    this.transition = new LiveParamTransition(tweens, tasks);
    this.layer.zIndex = 25;
    options.root.sortableChildren = true;
    options.root.addChild(this.layer);
  }

  reconcile(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[] = []): void {
    const bokeh = snapshot.screenFilters.bokeh;
    const power = clamp01(bokeh?.power ?? 0);
    const removal = hints.find(
      (hint): hint is Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> =>
        hint.type === "screen-filter-remove" && hint.kind === "bokeh"
    );
    if (!bokeh || power <= 0) {
      if (this.removing) return;
      if (this.filter && animate && removal && removal.durationMs > 0) {
        this.removing = true;
        this.transition.start({
          state: this.live,
          to: { power: 0 },
          animate: true,
          durationMs: removal.durationMs,
          easing: removal.easing,
          forceTask: removal.wait,
          task: { kind: "screen-filter-transition", target: "bokeh", revision: snapshot.revision },
          onUpdate: () => this.applyPower(),
          onComplete: () => this.clear(false),
          onSettle: () => this.clear(false),
          onCancel: () => this.clear(false)
        });
        return;
      }
      this.clear();
      return;
    }

    if (!this.removing && this.snapshot && sameBokeh(this.snapshot, bokeh)) return;
    if (this.removing) this.transition.cancel(false);
    this.snapshot = bokeh;
    this.removing = false;

    const isNew = !this.filter;
    if (!this.filter) {
      this.live = { power: animate && bokeh.transition.durationMs > 0 ? 0 : power };
      this.filter = createBokehBlurFilter(this.live.power ?? 0);
    }
    const key = this.makeLayoutKey(power);
    if (key !== this.layoutKey) {
      this.layer.removeChildren().forEach((child) => child.destroy());
      this.layoutPower = power;
      this.populate(power);
      this.layoutKey = key;
    }
    if (isNew) this.applyPower();
    this.transition.start({
      state: this.live,
      to: { power },
      animate,
      durationMs: bokeh.transition.durationMs,
      easing: bokeh.transition.easing,
      forceTask: bokeh.transition.wait,
      task: { kind: "screen-filter-transition", target: "bokeh", revision: snapshot.revision },
      onUpdate: () => this.applyPower()
    });
  }

  getFilter(): Filter | undefined {
    return this.filter as unknown as Filter | undefined;
  }

  relayoutViewport(): void {
    if (!this.filter || this.layer.children.length === 0) return;
    const key = this.makeLayoutKey(this.layoutPower);
    if (key === this.layoutKey) return;
    this.layer.removeChildren().forEach((child) => child.destroy());
    this.populate(this.layoutPower);
    this.layoutKey = key;
    this.applyPower();
  }

  clear(cancelTasks = true): void {
    this.transition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget("bokeh");
    if (this.filter) {
      this.rootFilters.removeScreenFilter(this.filter as unknown as Filter);
      this.filter.destroy();
      this.filter = undefined;
    }
    this.layer.removeChildren().forEach((child) => child.destroy());
    this.live = { power: 0 };
    this.layoutKey = "";
    this.layoutPower = 0;
    this.snapshot = undefined;
    this.removing = false;
  }

  destroy(): void {
    this.clear();
    this.layer.removeFromParent();
    this.layer.destroy({ children: true });
  }

  private populate(power: number): void {
    const width = this.options.width();
    const height = this.options.height();
    let seed = 37;
    const texture = getBuiltInPixiFxTexture("bokeh-disc");
    const count = Math.max(3, Math.round(7 * power));
    for (let index = 0; index < count; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = (seed / 0xffffffff) * width;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const y = (seed / 0xffffffff) * height;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.x = x;
      sprite.y = y;
      sprite.scale.set(0.65 + (seed / 0xffffffff) * 1.35);
      sprite.tint = index % 3 === 0 ? 0xfff4cf : index % 3 === 1 ? 0xbfe8ff : 0xffffff;
      this.layer.addChild(sprite);
    }
  }

  private applyPower(): void {
    const power = clamp01(this.live.power ?? 0);
    if (this.filter) this.filter.strength = bokehBlurStrength(power);
    this.layer.alpha = power <= 0.001 ? 0 : Math.min(0.96, 0.45 + power * 0.45);
    this.layer.children.forEach((child) => {
      if (child instanceof Sprite) child.alpha = 0.32 + power * 0.34;
    });
  }

  private makeLayoutKey(power: number): string {
    return `${this.options.width()}x${this.options.height()}:${Math.round(power * 100)}`;
  }
}

function createBokehBlurFilter(power: number): BokehBlurFilter {
  if (typeof document === "undefined") return { strength: bokehBlurStrength(power), destroy: () => undefined };
  return new KawaseBlurFilter({ strength: bokehBlurStrength(power), quality: 4 });
}

function bokehBlurStrength(power: number): number { return Math.max(0, power) * 8; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function sameBokeh(
  left: NonNullable<PixiStageSnapshot["screenFilters"]["bokeh"]>,
  right: NonNullable<PixiStageSnapshot["screenFilters"]["bokeh"]>
): boolean {
  return left.power === right.power && left.focus === right.focus && left.dist === right.dist;
}
