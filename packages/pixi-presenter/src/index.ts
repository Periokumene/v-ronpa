import { Application, Container, Graphics, Text } from "pixi.js";
import type { PresentationCommand } from "@v-ronpa/contracts";
import { createMemoryPresenter, type PresentationSnapshot, type PresenterPort } from "@v-ronpa/presentation-contracts";

export interface PixiPresenterOptions {
  host: HTMLElement;
  width?: number;
  height?: number;
}

export interface PixiPresenterPort extends PresenterPort {
  mount(): Promise<void>;
  destroy(): void;
}

export function createPixiPresenter(options: PixiPresenterOptions): PixiPresenterPort {
  const memory = createMemoryPresenter();
  const app = new Application();
  const backgroundLayer = new Container({ label: "background" });
  const portraitLayer = new Container({ label: "portraits" });
  const effectsLayer = new Container({ label: "effects" });
  const trialLayer = new Container({ label: "trial-overlay" });
  let mountStarted = false;
  let initialized = false;
  let mounted = false;
  let destroyed = false;

  async function mount() {
    if (mountStarted || destroyed) return;
    mountStarted = true;
    const initOptions = {
      resizeTo: options.host,
      backgroundAlpha: 0,
      antialias: true
    };
    await app.init(
      options.width && options.height
        ? { ...initOptions, width: options.width, height: options.height }
        : initOptions
    );
    initialized = true;
    if (destroyed) {
      app.destroy(true);
      initialized = false;
      return;
    }
    app.canvas.dataset.testid = "pixi-canvas";
    options.host.appendChild(app.canvas);
    app.stage.addChild(backgroundLayer, portraitLayer, effectsLayer, trialLayer);
    drawPlate("bg:harness", 0x223044);
    mounted = true;
  }

  function apply(command: PresentationCommand) {
    const perform = memory.apply(command);
    if (!mounted) return perform;

    if (command.type === "set-background") {
      drawPlate(command.backgroundId, 0x26324c);
    }

    if (command.type === "char-enter") {
      drawPortrait(command.characterId, command.slot);
    }

    if (command.type === "trial-keyword") {
      drawTrialKeyword(command.text);
    }

    if (command.type === "trial-subtitle") {
      drawTrialSubtitle(command.text, command.style);
    }

    if (command.type === "flash") {
      drawFlash(command.color);
    }

    if (command.type === "shake") {
      effectsLayer.x = command.intensity * 12;
      window.setTimeout(() => {
        effectsLayer.x = 0;
      }, command.durationMs);
    }

    return perform;
  }

  function drawPlate(label: string, color: number) {
    backgroundLayer.removeChildren();
    const width = app.renderer.width || options.host.clientWidth || 960;
    const height = app.renderer.height || options.host.clientHeight || 540;
    const plate = new Graphics()
      .rect(0, 0, width, height)
      .fill({ color, alpha: 0.62 })
      .rect(32, 32, width - 64, height - 64)
      .stroke({ color: 0x83e4d3, width: 2, alpha: 0.35 });
    const title = new Text({
      text: label,
      style: {
        fill: 0xeef8ff,
        fontSize: 18,
        fontFamily: "Inter, ui-sans-serif, system-ui",
        letterSpacing: 0
      }
    });
    title.x = 48;
    title.y = 42;
    backgroundLayer.addChild(plate, title);
  }

  function drawPortrait(characterId: string, slot: "left" | "center" | "right") {
    const width = app.renderer.width || options.host.clientWidth || 960;
    const height = app.renderer.height || options.host.clientHeight || 540;
    const slotX = slot === "left" ? width * 0.28 : slot === "right" ? width * 0.72 : width * 0.5;
    const group = new Container({ label: characterId });
    const body = new Graphics()
      .roundRect(-70, -180, 140, 260, 18)
      .fill({ color: 0xf0bf70, alpha: 0.88 })
      .roundRect(-46, -150, 92, 84, 46)
      .fill({ color: 0xffe0ad, alpha: 0.95 })
      .rect(-54, -46, 108, 126)
      .fill({ color: 0x3657a8, alpha: 0.92 });
    const name = new Text({
      text: characterId.replace("character:", ""),
      style: { fill: 0x111827, fontSize: 16, fontWeight: "700" }
    });
    name.anchor.set(0.5);
    name.y = 100;
    group.x = slotX;
    group.y = height - 118;
    group.addChild(body, name);
    portraitLayer.addChild(group);
  }

  function drawTrialKeyword(text: string) {
    const width = app.renderer.width || options.host.clientWidth || 960;
    const y = 100 + trialLayer.children.length * 42;
    const group = new Container();
    const pill = new Graphics()
      .roundRect(0, 0, Math.max(180, text.length * 14), 34, 17)
      .fill({ color: 0x1f2937, alpha: 0.82 })
      .stroke({ color: 0xff4f8f, width: 2, alpha: 0.9 });
    const label = new Text({
      text,
      style: { fill: 0xffffff, fontSize: 18, fontWeight: "700" }
    });
    label.x = 18;
    label.y = 6;
    group.x = Math.max(24, width - 360);
    group.y = y;
    group.addChild(pill, label);
    trialLayer.addChild(group);
  }

  function drawTrialSubtitle(text: string, style: "dialog" | "barrage" | "keyword") {
    const width = app.renderer.width || options.host.clientWidth || 960;
    const y = style === "barrage" ? 72 + trialLayer.children.length * 36 : 150 + trialLayer.children.length * 40;
    const group = new Container({ label: `trial-subtitle:${style}` });
    const color = style === "keyword" ? 0xff4f8f : style === "barrage" ? 0x6ee7d8 : 0xffd166;
    const label = new Text({
      text,
      style: {
        fill: color,
        fontSize: style === "barrage" ? 20 : 18,
        fontWeight: "700",
        dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.75 }
      }
    });
    group.x = style === "barrage" ? Math.max(40, width - 520) : 48;
    group.y = y;
    group.addChild(label);
    trialLayer.addChild(group);
  }

  function drawFlash(color: string) {
    effectsLayer.removeChildren();
    const width = app.renderer.width || options.host.clientWidth || 960;
    const height = app.renderer.height || options.host.clientHeight || 540;
    const numeric = Number.parseInt(color.replace("#", ""), 16);
    const flash = new Graphics().rect(0, 0, width, height).fill({ color: numeric, alpha: 0.35 });
    effectsLayer.addChild(flash);
    window.setTimeout(() => effectsLayer.removeChildren(), 180);
  }

  return {
    mount,
    apply,
    snapshot(): PresentationSnapshot {
      return memory.snapshot();
    },
    clear() {
      memory.clear();
      backgroundLayer.removeChildren();
      portraitLayer.removeChildren();
      effectsLayer.removeChildren();
      trialLayer.removeChildren();
    },
    destroy() {
      destroyed = true;
      if (!initialized) return;
      app.destroy(true);
      initialized = false;
      mounted = false;
    }
  };
}
