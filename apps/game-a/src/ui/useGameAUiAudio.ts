import { useCallback, useEffect, useMemo, type MouseEventHandler, type PointerEventHandler } from "react";
import { createHowlerAudioPort, type AudioHandle, type AudioPort } from "@v-ronpa/media-save";
import type { SettingsSoundSnapshot } from "@v-ronpa/contracts";
import type { GameAUiAudioAssets } from "./resolveGameAUiAssets";

const UI_HOVER_CHANNEL_ID = "ui:hover";
const UI_CLICK_CHANNEL_ID = "ui:click";
const DISABLED_CUE_ID = "none";

export type GameAUiAudioPort = Pick<AudioPort, "playSfx" | "stopAll">;

export interface GameAUiAudioController {
  dispose(): void;
  playClick(cueId: string): void;
  playHover(cueId: string, input: { hasUserActivation: boolean; now: number }): void;
  update(input: { assets: GameAUiAudioAssets; sound: SettingsSoundSnapshot }): void;
}

export interface GameAUiAudioBindings {
  onClickCapture: MouseEventHandler<HTMLElement>;
  onPointerOver: PointerEventHandler<HTMLElement>;
}

export function createGameAUiAudioController({
  assets,
  audioPort,
  sound
}: {
  assets: GameAUiAudioAssets;
  audioPort: GameAUiAudioPort;
  sound: SettingsSoundSnapshot;
}): GameAUiAudioController {
  let currentAssets = assets;
  let currentSound = sound;
  let hoverHandle: AudioHandle | undefined;
  let clickHandle: AudioHandle | undefined;
  let lastHoverAt = Number.NEGATIVE_INFINITY;

  function resolvedCue(cueId: string) {
    if (cueId === DISABLED_CUE_ID) return undefined;
    return currentAssets.cues[cueId];
  }

  function volumeFor(gain: number): number {
    if (currentSound.muted) return 0;
    return clampNormalized(currentSound.masterVolume * currentSound.uiVolume * gain);
  }

  return {
    dispose() {
      hoverHandle = undefined;
      clickHandle = undefined;
      audioPort.stopAll();
    },
    playClick(cueId) {
      hoverHandle?.stop();
      hoverHandle = undefined;
      const cue = resolvedCue(cueId);
      if (!cue) return;
      const volume = volumeFor(cue.gain);
      if (volume <= 0) return;
      clickHandle?.stop();
      clickHandle = audioPort.playSfx(UI_CLICK_CHANNEL_ID, cue.uri, { volume });
    },
    playHover(cueId, input) {
      if (!input.hasUserActivation) return;
      const cue = resolvedCue(cueId);
      if (!cue) return;
      const volume = volumeFor(cue.gain);
      if (volume <= 0) return;
      if (input.now - lastHoverAt < currentAssets.hoverThrottleMs) return;
      lastHoverAt = input.now;
      hoverHandle?.stop();
      hoverHandle = audioPort.playSfx(UI_HOVER_CHANNEL_ID, cue.uri, { volume });
    },
    update(input) {
      currentAssets = input.assets;
      currentSound = input.sound;
    }
  };
}

export function useGameAUiAudio({
  assets,
  audioPortFactory = createHowlerAudioPort,
  hasUserActivation = browserHasUserActivation,
  now = monotonicNow,
  sound
}: {
  assets: GameAUiAudioAssets;
  audioPortFactory?: () => GameAUiAudioPort;
  hasUserActivation?: () => boolean;
  now?: () => number;
  sound: SettingsSoundSnapshot;
}): GameAUiAudioBindings {
  const audioPort = useMemo(() => audioPortFactory(), [audioPortFactory]);
  const controller = useMemo(
    () => createGameAUiAudioController({ assets, audioPort, sound }),
    [audioPort]
  );
  controller.update({ assets, sound });

  useEffect(() => () => controller.dispose(), [controller]);

  const onPointerOver = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      const button = resolveGameAButtonHoverTarget({
        currentTarget: event.currentTarget,
        pointerType: event.pointerType,
        relatedTarget: event.relatedTarget,
        target: event.target
      });
      if (!button) return;
      controller.playHover(readGameAButtonCue(button, "hover", assets.defaults.hover), {
        hasUserActivation: hasUserActivation(),
        now: now()
      });
    },
    [assets.defaults.hover, controller, hasUserActivation, now]
  );

  const onClickCapture = useCallback<MouseEventHandler<HTMLElement>>(
    (event) => {
      const button = resolveGameAButtonSoundTarget(event.target, event.currentTarget);
      if (!button) return;
      controller.playClick(readGameAButtonCue(button, "click", assets.defaults.click));
    },
    [assets.defaults.click, controller]
  );

  return { onClickCapture, onPointerOver };
}

export function resolveGameAButtonSoundTarget(
  target: EventTarget | null,
  currentTarget: Pick<HTMLElement, "contains">
): HTMLButtonElement | undefined {
  const closestSource = closestCapableElement(target);
  const button = closestSource?.closest("button") as HTMLButtonElement | null | undefined;
  if (!button || !currentTarget.contains(button)) return undefined;
  if (button.disabled || button.getAttribute("aria-disabled") === "true") return undefined;
  return button;
}

export function resolveGameAButtonHoverTarget(input: {
  currentTarget: Pick<HTMLElement, "contains">;
  pointerType: string;
  relatedTarget: EventTarget | null;
  target: EventTarget | null;
}): HTMLButtonElement | undefined {
  if (input.pointerType !== "mouse") return undefined;
  const button = resolveGameAButtonSoundTarget(input.target, input.currentTarget);
  if (!button || isMovementInsideButton(button, input.relatedTarget)) return undefined;
  return button;
}

export function readGameAButtonCue(
  button: Pick<HTMLButtonElement, "dataset">,
  trigger: "click" | "hover",
  defaultCue: string
): string {
  const configured = trigger === "hover" ? button.dataset.uiSoundHover : button.dataset.uiSoundClick;
  return configured?.trim() || defaultCue;
}

function closestCapableElement(target: EventTarget | null): Pick<Element, "closest"> | undefined {
  if (target && typeof (target as { closest?: unknown }).closest === "function") {
    return target as unknown as Pick<Element, "closest">;
  }
  const parentElement = (target as { parentElement?: unknown } | null)?.parentElement;
  if (parentElement && typeof (parentElement as { closest?: unknown }).closest === "function") {
    return parentElement as Pick<Element, "closest">;
  }
  return undefined;
}

function isMovementInsideButton(button: Pick<HTMLButtonElement, "contains">, relatedTarget: EventTarget | null): boolean {
  if (!relatedTarget) return false;
  try {
    return button.contains(relatedTarget as Node);
  } catch {
    return false;
  }
}

function browserHasUserActivation(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.userActivation?.hasBeenActive ?? true;
}

function monotonicNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function clampNormalized(value: number): number {
  return Math.min(1, Math.max(0, value));
}
