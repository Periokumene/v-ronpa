import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Filter, type Ticker } from "pixi.js";
import type { PresentationTaskController } from "../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../systemTypes";
import { LiveParamTransition, type NumericLiveState, type TweenSystem } from "./animation";
import {
  applyGlitchLiveUniforms,
  createGlitchShaderFilter,
  glitchLiveParams,
  setGlitchResolution,
  type GlitchShaderRecord
} from "./glitchShader";
import type { RootFilterStack } from "./rootFilterStack";

interface PersistentGlitchRecord extends GlitchShaderRecord {
  live: NumericLiveState;
  transition: LiveParamTransition;
  snapshot: NonNullable<PixiStageSnapshot["screenFilters"]["glitch"]>;
  removing: boolean;
}

export class PersistentGlitchEffectController {
  private record: PersistentGlitchRecord | undefined;

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly rootFilters: RootFilterStack,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {}

  reconcile(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[]): void {
    const glitch = snapshot.screenFilters.glitch;
    const removal = hints.find(
      (hint): hint is Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> =>
        hint.type === "screen-filter-remove" && hint.kind === "glitch"
    );
    if (!glitch || glitch.power <= 0) {
      this.remove(snapshot.revision, animate, removal);
      return;
    }
    const isNew = !this.record;
    if (!this.record) {
      const shader = createGlitchShaderFilter(this.options.width(), this.options.height());
      const live = glitchLiveParams(glitch);
      if (animate && glitch.transition.durationMs > 0) live.power = 0;
      this.record = { ...shader, live, snapshot: glitch, removing: false, transition: new LiveParamTransition(this.tweens, this.tasks) };
    }
    const record = this.record;
    if (!isNew && !record.removing && sameGlitch(record.snapshot, glitch)) return;
    if (record.removing) record.transition.cancel(false);
    record.snapshot = glitch;
    record.removing = false;
    record.uniforms.uSeed = glitch.seed ?? 0;
    record.uniforms.uProgress = 0;
    if (isNew) applyGlitchLiveUniforms(record.uniforms, record.live);
    record.transition.start({
      state: record.live,
      to: glitchLiveParams(glitch),
      animate,
      durationMs: glitch.transition.durationMs,
      easing: glitch.transition.easing,
      forceTask: glitch.transition.wait,
      task: { kind: "screen-filter-transition", target: "glitch", revision: snapshot.revision },
      onUpdate: () => applyGlitchLiveUniforms(record.uniforms, record.live)
    });
  }

  getFilter(): Filter | undefined { return this.record?.filter as unknown as Filter | undefined; }

  tick(ticker: Ticker): void {
    if (this.record) this.record.uniforms.uTime += Math.max(0, ticker.deltaMS) / 1000;
  }

  relayoutViewport(): void {
    if (this.record) setGlitchResolution(this.record.uniforms, this.options.width(), this.options.height());
  }

  clear(cancelTasks = true): void {
    const record = this.record;
    if (!record) return;
    record.transition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget("glitch");
    this.rootFilters.removeScreenFilter(record.filter as unknown as Filter);
    record.filter.destroy();
    this.record = undefined;
  }

  destroy(): void { this.clear(); }

  private remove(
    revision: number,
    animate: boolean,
    removal: Extract<PixiStageRenderHint, { type: "screen-filter-remove" }> | undefined
  ): void {
    const record = this.record;
    if (!record || record.removing) return;
    if (animate && removal && removal.durationMs > 0) {
      record.removing = true;
      record.transition.start({
        state: record.live,
        to: { ...record.live, power: 0 },
        animate: true,
        durationMs: removal.durationMs,
        easing: removal.easing,
        forceTask: removal.wait,
        task: { kind: "screen-filter-transition", target: "glitch", revision },
        onUpdate: () => applyGlitchLiveUniforms(record.uniforms, record.live),
        onComplete: () => this.clear(false),
        onSettle: () => this.clear(false),
        onCancel: () => this.clear(false)
      });
      return;
    }
    this.clear();
  }
}

function sameGlitch(
  left: NonNullable<PixiStageSnapshot["screenFilters"]["glitch"]>,
  right: NonNullable<PixiStageSnapshot["screenFilters"]["glitch"]>
): boolean {
  return left.power === right.power && left.blockJump === right.blockJump && left.burstJump === right.burstJump &&
    left.pixelScatter === right.pixelScatter && left.colorNoise === right.colorNoise && left.speed === right.speed &&
    left.seed === right.seed;
}
