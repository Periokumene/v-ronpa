import { Application, Assets, Container, Graphics, Sprite, Text, type Texture, type Ticker } from "pixi.js";
import type { PresentationCommand } from "@v-ronpa/contracts";
import { VisualEffectScheduler } from "./internal/effects";
import { createPresenterTraceRecorder } from "./internal/presenterTrace";
import {
  calculatePortraitLayout,
  formatFallbackPortraitLabel,
  resolveHarnessPortraitUrl,
  type PortraitSlot
} from "./internal/portraits";

export interface PixiPresenterOptions {
  host: HTMLElement;
  width?: number;
  height?: number;
}

export interface PixiPresenterPort {
  mount(): Promise<void>;
  apply(command: PresentationCommand): void;
  clear(): void;
  destroy(): void;
}

export function createPixiPresenter(options: PixiPresenterOptions): PixiPresenterPort {
  const traceRecorder = createPresenterTraceRecorder();
  const app = new Application();
  const backgroundLayer = new Container({ label: "background" });
  const portraitLayer = new Container({ label: "portraits" });
  const effectsLayer = new Container({ label: "effects" });
  const trialLayer = new Container({ label: "trial-overlay" });
  const scheduler = new VisualEffectScheduler();
  const slotLayers = new Map<PortraitSlot, Container>();
  const portraitRequestIds: Record<PortraitSlot, number> = {
    left: 0,
    center: 0,
    right: 0
  };
  const pendingVisualCommands: PresentationCommand[] = [];
  let mountStarted = false;
  let initialized = false;
  let mounted = false;
  let destroyed = false;
  const tickEffects = (ticker: Ticker) => scheduler.tick(ticker.deltaMS);

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
    app.ticker.add(tickEffects);
    drawPlate("bg:harness", 0x223044);
    mounted = true;
    for (const command of pendingVisualCommands.splice(0)) {
      executeVisual(command);
    }
  }

  function apply(command: PresentationCommand) {
    traceRecorder.apply(command);
    if (!mounted) {
      pendingVisualCommands.push(command);
      return;
    }

    executeVisual(command);
  }

  function executeVisual(command: PresentationCommand) {
    if (command.type === "set-background") {
      drawPlate(command.backgroundId, 0x26324c);
      return;
    }

    if (command.type === "char-enter") {
      void drawPortrait(command);
      return;
    }

    if (command.type === "trial-keyword") {
      drawTrialKeyword(command.text);
      return;
    }

    if (command.type === "trial-subtitle") {
      drawTrialSubtitle(command.text, command.style);
      return;
    }

    if (command.type === "flash") {
      runFlash(command.color, command.durationMs);
      return;
    }

    if (command.type === "shake") {
      runShake(command.intensity, command.durationMs);
    }
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

  async function drawPortrait(command: Extract<PresentationCommand, { type: "char-enter" }>) {
    const { characterId, portraitId, slot, effect } = command;
    const requestId = ++portraitRequestIds[slot];
    const slotLayer = ensureSlotLayer(slot);
    positionSlotLayer(slotLayer, slot);
    slotLayer.removeChildren();

    const portraitUrl = resolveHarnessPortraitUrl(portraitId);
    if (!portraitUrl) {
      drawFallbackPortrait(slotLayer, characterId, portraitId, slot, effect);
      console.warn(`[pixi-presenter] Missing portrait asset for ${portraitId ?? characterId}; using fallback.`);
      return;
    }

    try {
      const texture = await Assets.load<Texture>(portraitUrl);
      if (portraitRequestIds[slot] !== requestId || destroyed) return;
      slotLayer.removeChildren();
      drawImagePortrait(slotLayer, texture, characterId, portraitId, slot, effect);
    } catch {
      if (portraitRequestIds[slot] !== requestId || destroyed) return;
      slotLayer.removeChildren();
      drawFallbackPortrait(slotLayer, characterId, portraitId, slot, effect);
      console.warn(`[pixi-presenter] Missing portrait asset at ${portraitUrl}; using fallback.`);
    }
  }

  function ensureSlotLayer(slot: PortraitSlot) {
    const existing = slotLayers.get(slot);
    if (existing) return existing;
    const layer = new Container({ label: `portrait-slot:${slot}` });
    slotLayers.set(slot, layer);
    portraitLayer.addChild(layer);
    return layer;
  }

  function positionSlotLayer(layer: Container, slot: PortraitSlot) {
    const width = app.renderer.width || options.host.clientWidth || 960;
    const height = app.renderer.height || options.host.clientHeight || 540;
    const layout = calculatePortraitLayout(width, height, slot);
    layer.x = layout.x;
    layer.y = layout.y;
  }

  function drawImagePortrait(
    layer: Container,
    texture: Texture,
    characterId: string,
    portraitId: string | undefined,
    slot: PortraitSlot,
    effect: string
  ) {
    const layout = getCurrentLayout(slot);
    const group = new Container({ label: portraitId ?? characterId });
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 1);
    const scale = Math.min(layout.maxWidth / sprite.texture.width, layout.maxHeight / sprite.texture.height);
    sprite.scale.set(scale);

    const frame = new Graphics()
      .roundRect(-layout.maxWidth / 2, -layout.maxHeight - 8, layout.maxWidth, layout.maxHeight + 42, 16)
      .fill({ color: 0x0e1726, alpha: 0.18 })
      .stroke({ color: 0x83e4d3, width: 2, alpha: 0.46 });
    const name = drawPortraitNameplate(characterId, slot, 0xeef8ff, 0x121826);
    group.addChild(frame, sprite, name);
    layer.addChild(group);
    runFadeIn(group, effect);
  }

  function drawFallbackPortrait(
    layer: Container,
    characterId: string,
    portraitId: string | undefined,
    slot: PortraitSlot,
    effect: string
  ) {
    const layout = getCurrentLayout(slot);
    const group = new Container({ label: `fallback:${portraitId ?? characterId}` });
    const bodyWidth = Math.min(170, layout.maxWidth);
    const bodyHeight = Math.min(300, layout.maxHeight);
    const body = new Graphics()
      .roundRect(-bodyWidth / 2, -bodyHeight, bodyWidth, bodyHeight, 18)
      .fill({ color: 0x33243d, alpha: 0.94 })
      .stroke({ color: 0xffd166, width: 3, alpha: 0.8 })
      .roundRect(-bodyWidth * 0.27, -bodyHeight + 34, bodyWidth * 0.54, bodyWidth * 0.54, bodyWidth * 0.27)
      .fill({ color: 0x5d486f, alpha: 1 })
      .rect(-bodyWidth * 0.34, -bodyHeight * 0.48, bodyWidth * 0.68, bodyHeight * 0.34)
      .fill({ color: 0x1f4f68, alpha: 0.95 });
    const missing = new Text({
      text: formatFallbackPortraitLabel(characterId, portraitId),
      style: {
        align: "center",
        fill: 0xfff2c2,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 17,
        wordWrap: true,
        wordWrapWidth: bodyWidth - 20
      }
    });
    missing.anchor.set(0.5);
    missing.y = -bodyHeight * 0.18;
    const name = drawPortraitNameplate(characterId, slot, 0x111827, 0xffd166);
    group.addChild(body, missing, name);
    layer.addChild(group);
    runFadeIn(group, effect);
  }

  function drawPortraitNameplate(characterId: string, slot: PortraitSlot, fill: number, plateColor: number) {
    const label = `${characterId.replace(/^character:/, "")} / ${slot}`;
    const group = new Container({ label: `nameplate:${label}` });
    const plateWidth = Math.max(118, label.length * 8 + 20);
    const plate = new Graphics()
      .roundRect(-plateWidth / 2, 0, plateWidth, 28, 14)
      .fill({ color: plateColor, alpha: 0.88 });
    const name = new Text({
      text: label,
      style: { fill, fontSize: 14, fontWeight: "700" }
    });
    name.anchor.set(0.5);
    name.y = 14;
    group.y = 8;
    group.addChild(plate, name);
    return group;
  }

  function getCurrentLayout(slot: PortraitSlot) {
    const width = app.renderer.width || options.host.clientWidth || 960;
    const height = app.renderer.height || options.host.clientHeight || 540;
    return calculatePortraitLayout(width, height, slot);
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

  function runFadeIn(target: Container, effect: string) {
    if (effect !== "fadeIn") return;
    target.alpha = 0;
    scheduler.enqueue({
      kind: "fadeIn",
      durationMs: 280,
      target
    });
  }

  function runFlash(color: string, durationMs: number) {
    const width = app.renderer.width || options.host.clientWidth || 960;
    const height = app.renderer.height || options.host.clientHeight || 540;
    const numeric = Number.parseInt(color.replace("#", ""), 16);
    const flash = new Graphics().rect(0, 0, width, height).fill({ color: numeric, alpha: 0.5 });
    flash.alpha = 0.5;
    effectsLayer.addChild(flash);
    scheduler.enqueue({
      kind: "flash",
      durationMs,
      target: flash,
      onComplete: () => {
        if (!flash.destroyed) flash.destroy();
      }
    });
  }

  function runShake(intensity: number, durationMs: number) {
    scheduler.enqueue({
      kind: "shake",
      durationMs,
      intensity,
      target: portraitLayer
    });
  }

  return {
    mount,
    apply,
    clear() {
      traceRecorder.clear();
      pendingVisualCommands.length = 0;
      portraitRequestIds.left = 0;
      portraitRequestIds.center = 0;
      portraitRequestIds.right = 0;
      scheduler.clear();
      backgroundLayer.removeChildren();
      portraitLayer.removeChildren();
      effectsLayer.removeChildren();
      trialLayer.removeChildren();
      slotLayers.clear();
    },
    destroy() {
      destroyed = true;
      scheduler.destroy();
      if (!initialized) return;
      app.destroy(true);
      initialized = false;
      mounted = false;
    }
  };
}
