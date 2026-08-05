import type { PixiCharacterToneSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import type { CharacterPresentation } from "../characters";
import { characterToneTarget, copyCharacterToneState, type CharacterToneLiveState } from "../characterTone";
import type { PresentationTaskController } from "../presentationTasks";
import { LiveParamTransition, type TweenSystem } from "./animation";

export class CharacterToneController {
  private readonly presentations = new Set<CharacterPresentation>();
  private readonly transition: LiveParamTransition;
  private live: CharacterToneLiveState | undefined;
  private target: PixiCharacterToneSnapshot | undefined;
  private enabled = false;

  constructor(tweens: TweenSystem, private readonly tasks: PresentationTaskController) {
    this.transition = new LiveParamTransition(tweens, tasks);
  }

  register(presentation: CharacterPresentation): void {
    this.presentations.add(presentation);
    presentation.setTone(this.enabled ? this.live : undefined);
  }

  unregister(presentation: CharacterPresentation): void {
    this.presentations.delete(presentation);
  }

  reconcile(next: PixiCharacterToneSnapshot | undefined, animate: boolean, revision: number, hints: PixiStageRenderHint[]): void {
    if (!next) {
      this.remove(animate, revision, hints);
      return;
    }
    if (animate && sameSnapshot(this.target, next)) return;
    const targetLive = characterToneTarget(next.preset, next.amount);
    const scopeChanged = this.target !== undefined && this.target.scopeScriptPath !== next.scopeScriptPath;
    if (!this.live || !this.enabled || (scopeChanged && animate && next.transition.durationMs > 0)) {
      this.live = copyCharacterToneState(targetLive);
      if (animate && next.transition.durationMs > 0) this.live.amount = 0;
    }
    this.target = next;
    const live = this.live;
    this.transition.start({
      state: live,
      to: targetLive,
      animate,
      durationMs: next.transition.durationMs,
      task: { kind: "character-tone-transition", target: "character-tone", revision },
      onUpdate: () => this.applyLive(true),
      onComplete: () => this.applyLive(true),
      onSettle: () => this.applyLive(true),
      onCancel: () => this.applyLive(this.enabled)
    });
  }

  destroy(): void {
    this.tasks.cancelTarget("character-tone");
    this.transition.cancel(false);
    this.disable();
    this.presentations.clear();
    this.live = undefined;
    this.target = undefined;
  }

  private remove(animate: boolean, revision: number, hints: PixiStageRenderHint[]): void {
    const removal = hints.find(
      (hint): hint is Extract<PixiStageRenderHint, { type: "character-tone-remove" }> =>
        hint.type === "character-tone-remove"
    );
    this.target = undefined;
    if (!this.live || !this.enabled || !animate || !removal || removal.durationMs <= 0) {
      this.tasks.cancelTarget("character-tone");
      this.transition.cancel(false);
      this.disable();
      return;
    }
    const live = this.live;
    this.transition.start({
      state: live,
      to: { ...live, amount: 0 },
      animate: true,
      durationMs: removal.durationMs,
      task: { kind: "character-tone-transition", target: "character-tone", revision },
      onUpdate: () => this.applyLive(true),
      onComplete: () => this.disable(),
      onSettle: () => this.disable(),
      onCancel: () => this.disable()
    });
  }

  private applyLive(enabled: boolean): void {
    this.enabled = enabled && Boolean(this.live);
    for (const presentation of this.presentations) presentation.setTone(this.enabled ? this.live : undefined);
  }

  private disable(): void {
    this.enabled = false;
    for (const presentation of this.presentations) presentation.setTone(undefined);
  }
}

function sameSnapshot(left: PixiCharacterToneSnapshot | undefined, right: PixiCharacterToneSnapshot): boolean {
  return Boolean(
    left && left.preset === right.preset && left.amount === right.amount && left.scopeScriptPath === right.scopeScriptPath
  );
}
