import { describe, expect, it, vi } from "vitest";
import { createDefaultSettingsSnapshot } from "@v-ronpa/contracts";
import type { AudioHandle } from "@v-ronpa/media-save";
import type { GameAUiAudioAssets } from "./resolveGameAUiAssets";
import {
  createGameAUiAudioController,
  readGameAButtonCue,
  resolveGameAButtonHoverTarget,
  resolveGameAButtonSoundTarget,
  type GameAUiAudioPort
} from "./useGameAUiAudio";

describe("game-a UI audio", () => {
  it("plays resolved hover and click cues through separate UI channels at the persisted UI volume", () => {
    const port = createAudioPort();
    const sound = createDefaultSettingsSnapshot().sound;
    sound.masterVolume = 0.8;
    sound.uiVolume = 0.5;
    const controller = createGameAUiAudioController({ assets: createAssets(), audioPort: port, sound });

    controller.playHover("hover", { now: 100 });
    controller.playClick("activate");

    expect(port.playSfx).toHaveBeenNthCalledWith(1, "ui:hover", "/ui-hover.ogg", { volume: 0.2 });
    expect(port.playSfx).toHaveBeenNthCalledWith(2, "ui:click", "/ui-click.ogg", { volume: 0.4 });
    expect(port.handles[0]?.stop).toHaveBeenCalledOnce();
  });

  it("throttles hover, replaces active channels, and disposes the app-owned port", () => {
    const port = createAudioPort();
    const controller = createGameAUiAudioController({
      assets: createAssets(),
      audioPort: port,
      sound: createDefaultSettingsSnapshot().sound
    });

    controller.playHover("hover", { now: 100 });
    controller.playHover("hover", { now: 140 });
    expect(port.playSfx).toHaveBeenCalledTimes(1);

    controller.playHover("hover", { now: 160 });
    expect(port.handles[0]?.stop).toHaveBeenCalledOnce();
    expect(port.playSfx).toHaveBeenCalledTimes(2);

    controller.playClick("activate");
    controller.playClick("activate");
    expect(port.handles[1]?.stop).toHaveBeenCalledOnce();
    expect(port.handles[2]?.stop).toHaveBeenCalledOnce();

    controller.dispose();
    expect(port.stopAll).toHaveBeenCalledOnce();
  });

  it("attempts hover without an activation precondition and safely ignores muted, disabled, and unknown cues", () => {
    const port = createAudioPort();
    const sound = createDefaultSettingsSnapshot().sound;
    const controller = createGameAUiAudioController({ assets: createAssets(), audioPort: port, sound });

    controller.playHover("hover", { now: 100 });
    expect(port.playSfx).toHaveBeenLastCalledWith("ui:hover", "/ui-hover.ogg", { volume: 0.25 });

    controller.playHover("none", { now: 200 });
    controller.playClick("missing");
    expect(port.playSfx).toHaveBeenCalledTimes(1);

    controller.update({ assets: createAssets(), sound: { ...sound, masterVolume: 0.5, uiVolume: 0.4 } });
    controller.playClick("activate");
    expect(port.playSfx).toHaveBeenLastCalledWith("ui:click", "/ui-click.ogg", { volume: 0.2 });

    controller.update({ assets: createAssets(), sound: { ...sound, muted: true } });
    controller.playClick("activate");
    expect(port.playSfx).toHaveBeenCalledTimes(2);
  });

  it("finds enabled native buttons, accepts semantic overrides, and rejects disabled buttons", () => {
    const enabled = createButton({ uiSoundClick: "confirm", uiSoundHover: "none" });
    const child = { closest: vi.fn(() => enabled) } as unknown as EventTarget;
    const root = { contains: vi.fn((candidate) => candidate === enabled) } as Pick<HTMLElement, "contains">;

    expect(resolveGameAButtonSoundTarget(child, root)).toBe(enabled);
    expect(readGameAButtonCue(enabled, "click", "activate")).toBe("confirm");
    expect(readGameAButtonCue(enabled, "hover", "hover")).toBe("none");

    const disabled = createButton({}, { disabled: true });
    expect(resolveGameAButtonSoundTarget({ closest: () => disabled } as unknown as EventTarget, root)).toBeUndefined();
    const ariaDisabled = createButton({}, { ariaDisabled: true });
    expect(resolveGameAButtonSoundTarget({ closest: () => ariaDisabled } as unknown as EventTarget, root)).toBeUndefined();
  });

  it("allows only genuine mouse entry and ignores touch or movement inside one button", () => {
    const insideNode = {} as EventTarget;
    const button = createButton({}, { insideNode });
    const target = { closest: () => button } as unknown as EventTarget;
    const root = { contains: () => true } as Pick<HTMLElement, "contains">;

    expect(
      resolveGameAButtonHoverTarget({ currentTarget: root, pointerType: "mouse", relatedTarget: null, target })
    ).toBe(button);
    expect(
      resolveGameAButtonHoverTarget({ currentTarget: root, pointerType: "touch", relatedTarget: null, target })
    ).toBeUndefined();
    expect(
      resolveGameAButtonHoverTarget({ currentTarget: root, pointerType: "mouse", relatedTarget: insideNode, target })
    ).toBeUndefined();
  });
});

function createAssets(): GameAUiAudioAssets {
  return {
    cues: {
      hover: { gain: 0.5, uri: "/ui-hover.ogg" },
      activate: { gain: 1, uri: "/ui-click.ogg" }
    },
    defaults: { click: "activate", hover: "hover" },
    hoverThrottleMs: 60
  };
}

function createAudioPort() {
  const handles: Array<AudioHandle & { stop: ReturnType<typeof vi.fn> }> = [];
  const playSfx = vi.fn(() => {
    const handle = {
      id: `handle:${handles.length}`,
      finished: Promise.resolve({ reason: "ended" as const }),
      fade: vi.fn(),
      fadeOutAndStop: vi.fn(),
      stop: vi.fn()
    };
    handles.push(handle);
    return handle;
  });
  return { handles, playSfx, stopAll: vi.fn(() => {}) } satisfies GameAUiAudioPort & { handles: AudioHandle[] };
}

function createButton(
  dataset: Record<string, string> = {},
  options: { ariaDisabled?: boolean; disabled?: boolean; insideNode?: EventTarget } = {}
): HTMLButtonElement {
  const button = {
    contains: (candidate: EventTarget) => candidate === options.insideNode,
    dataset,
    disabled: options.disabled ?? false,
    getAttribute: (name: string) => (name === "aria-disabled" && options.ariaDisabled ? "true" : null)
  };
  return button as unknown as HTMLButtonElement;
}
