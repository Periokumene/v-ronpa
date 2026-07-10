import { Application, Container, Rectangle, type Ticker } from "pixi.js";
import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import {
  ActorSystem,
  FilterSystem,
  RootFilterStack,
  ScreenOverlaySystem,
  TransientEffectSystem,
  TweenSystem,
  WeatherSystem
} from "./internal/systems";
import { preloadBuiltInPixiFxAssets } from "./internal/fxAssets";
import type { PixiAssetResolver, PixiPresenterDiagnostic } from "./internal/assetResolver";
import { PresentationTaskController, type PixiPresentationTaskSnapshot } from "./internal/presentationTasks";
import { type PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";

export type { PixiPresentationTaskSnapshot } from "./internal/presentationTasks";
export type { PixiAssetResolver, PixiPresenterDiagnostic };

export interface PixiPresenterOptions {
  host: HTMLElement;
  width?: number;
  height?: number;
  onTasksChanged?: (tasks: PixiPresentationTaskSnapshot[]) => void;
  assetResolver?: PixiAssetResolver;
  onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void;
}

export interface PixiStageReconcileOptions {
  animate?: boolean;
  hints?: PixiStageRenderHint[];
}

export type PixiThumbnailMime = "image/webp" | "image/png";

export interface PixiThumbnailCaptureOptions<Mime extends PixiThumbnailMime = PixiThumbnailMime> {
  width?: number;
  height?: number;
  mime?: Mime;
  quality?: number;
}

export interface PixiThumbnailCaptureResult<Mime extends PixiThumbnailMime = PixiThumbnailMime> {
  metadata: {
    kind: "image";
    mime: Mime;
    width: number;
    height: number;
    byteLength: number;
    capturedAt: string;
  };
  blob: Blob;
}

export interface PixiPresenterPort {
  mount(): Promise<void>;
  reconcile(snapshot: PixiStageSnapshot, options?: PixiStageReconcileOptions): void;
  captureThumbnail<Mime extends PixiThumbnailMime = "image/webp">(
    options?: PixiThumbnailCaptureOptions<Mime>
  ): Promise<PixiThumbnailCaptureResult<Mime> | undefined>;
  clear(): void;
  destroy(): void;
}

interface PendingReconcile {
  snapshot: PixiStageSnapshot;
  options: PixiStageReconcileOptions;
}

export function createPixiPresenter(options: PixiPresenterOptions): PixiPresenterPort {
  const app = new Application();
  const stageRoot = new Container({ label: "pixi-vn-stage" });
  const tweens = new TweenSystem();
  const tasks = new PresentationTaskController(options.onTasksChanged);
  let actors: ActorSystem | undefined;
  let weather: WeatherSystem | undefined;
  let screenOverlays: ScreenOverlaySystem | undefined;
  let effects: TransientEffectSystem | undefined;
  let pendingReconcile: PendingReconcile | undefined;
  let mountStarted = false;
  let initialized = false;
  let mounted = false;
  let destroyed = false;
  let lastRenderedSnapshot: PixiStageSnapshot | undefined;
  let viewportKey = "";
  let resizeObserver: ResizeObserver | undefined;
  let listeningForWindowResize = false;
  let resizeFrame: number | undefined;

  const size = {
    width: () => Math.max(1, options.host.clientWidth || (initialized ? app.renderer.width : 0) || options.width || 960),
    height: () => Math.max(1, options.host.clientHeight || (initialized ? app.renderer.height : 0) || options.height || 540)
  };
  const rootFilters = new RootFilterStack({ root: stageRoot, width: size.width, height: size.height });
  const filters = new FilterSystem({ root: stageRoot, width: size.width, height: size.height }, rootFilters, tweens, tasks);

  const tick = (ticker: Ticker) => {
    tweens.tick(ticker);
    tasks.tick(ticker.deltaMS);
    filters.tick(ticker);
    weather?.tick(ticker);
  };

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
    await preloadBuiltInPixiFxAssets(options.assetResolver, options.onDiagnostic);
    initialized = true;
    if (destroyed) {
      app.destroy(true);
      initialized = false;
      return;
    }
    app.canvas.dataset.testid = "pixi-canvas";
    options.host.appendChild(app.canvas);
    app.stage.addChild(stageRoot);
    const systemOptions = {
      root: stageRoot,
      width: size.width,
      height: size.height,
      renderer: app.renderer,
      ...(options.assetResolver ? { assetResolver: options.assetResolver } : {}),
      ...(options.onDiagnostic ? { onDiagnostic: options.onDiagnostic } : {})
    };
    actors = new ActorSystem(systemOptions, filters, tweens, tasks);
    weather = new WeatherSystem(systemOptions, filters, tweens, tasks);
    screenOverlays = new ScreenOverlaySystem(systemOptions, tweens, tasks);
    effects = new TransientEffectSystem(systemOptions, actors, rootFilters, tweens, tasks);
    app.ticker.add(tick);
    mounted = true;
    viewportKey = currentViewportKey();
    startResizeObservation();
    if (pendingReconcile) {
      const pending = pendingReconcile;
      pendingReconcile = undefined;
      renderSnapshot(pending.snapshot, pending.options);
    }
  }

  function reconcile(snapshot: PixiStageSnapshot, reconcileOptions: PixiStageReconcileOptions = {}) {
    if (!mounted) {
      pendingReconcile = { snapshot, options: reconcileOptions };
      return;
    }
    renderSnapshot(snapshot, reconcileOptions);
  }

  function renderSnapshot(snapshot: PixiStageSnapshot, reconcileOptions: PixiStageReconcileOptions) {
    const animate = reconcileOptions.animate ?? false;
    if (!animate) {
      tweens.clear();
      tasks.settleAllNonHold();
      effects?.clear();
    }
    actors?.reconcile(snapshot, animate && snapshot.revision !== lastRenderedSnapshot?.revision);
    weather?.reconcile(snapshot, animate && snapshot.revision !== lastRenderedSnapshot?.revision, reconcileOptions.hints ?? []);
    screenOverlays?.reconcile(snapshot, animate && snapshot.revision !== lastRenderedSnapshot?.revision, reconcileOptions.hints ?? []);
    filters.applyScreenFilters(snapshot, animate && snapshot.revision !== lastRenderedSnapshot?.revision, reconcileOptions.hints ?? []);
    effects?.clearTrialOverlays();
    if (animate) effects?.run(reconcileOptions.hints ?? [], snapshot.revision);
    lastRenderedSnapshot = snapshot;
    viewportKey = currentViewportKey();
  }

  async function captureThumbnail<Mime extends PixiThumbnailMime = "image/webp">(
    options: PixiThumbnailCaptureOptions<Mime> = {}
  ): Promise<PixiThumbnailCaptureResult<Mime> | undefined> {
    if (!mounted || destroyed || typeof document === "undefined") return undefined;
    const { height = 180, quality = 0.8, width = 320 } = options;
    const mime = options.mime ?? ("image/webp" as Mime);
    const targetWidth = Math.max(1, Math.floor(width));
    const targetHeight = Math.max(1, Math.floor(height));
    const rendererWithExtract = app.renderer as typeof app.renderer & {
      extract?: {
        canvas(options: {
          target: Container;
          frame?: Rectangle;
          resolution?: number;
          clearColor?: [number, number, number, number];
          antialias?: boolean;
        }): unknown;
      };
    };
    const sourceCanvas = rendererWithExtract.extract?.canvas({
      target: stageRoot,
      frame: new Rectangle(0, 0, size.width(), size.height()),
      resolution: 1,
      clearColor: [0, 0, 0, 0],
      antialias: true
    });
    if (!sourceCanvas) return undefined;
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = targetWidth;
    outputCanvas.height = targetHeight;
    const context = outputCanvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(sourceCanvas as CanvasImageSource, 0, 0, targetWidth, targetHeight);
    const blob = await canvasToBlob(outputCanvas, mime, quality);
    if (!blob) return undefined;
    return {
      metadata: {
        kind: "image",
        mime,
        width: targetWidth,
        height: targetHeight,
        byteLength: blob.size,
        capturedAt: new Date().toISOString()
      },
      blob
    };
  }

  function relayoutViewport() {
    if (!mounted || destroyed) return;
    const nextViewportKey = currentViewportKey();
    if (nextViewportKey === viewportKey) return;
    viewportKey = nextViewportKey;
    actors?.relayoutViewport();
    filters.relayoutViewport();
    weather?.relayoutViewport();
    screenOverlays?.relayoutViewport();
    effects?.relayoutViewport();
  }

  function currentViewportKey(): string {
    return `${size.width()}x${size.height()}`;
  }

  function startResizeObservation() {
    if (resizeObserver || listeningForWindowResize || destroyed) return;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleViewportRelayout);
      resizeObserver.observe(options.host);
      return;
    }
    if (typeof globalThis.addEventListener === "function") {
      globalThis.addEventListener("resize", scheduleViewportRelayout);
      listeningForWindowResize = true;
    }
  }

  function stopResizeObservation() {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    if (listeningForWindowResize && typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("resize", scheduleViewportRelayout);
    }
    listeningForWindowResize = false;
    if (resizeFrame !== undefined) {
      cancelFrame(resizeFrame);
      resizeFrame = undefined;
    }
  }

  function scheduleViewportRelayout() {
    if (!mounted || destroyed || resizeFrame !== undefined) return;
    resizeFrame = requestFrame(() => {
      resizeFrame = undefined;
      relayoutViewport();
    });
  }

  function clear() {
    pendingReconcile = undefined;
    tasks.cancelAll();
    tweens.clear();
    filters.clear();
    actors?.clear();
    weather?.clear();
    screenOverlays?.clear();
    effects?.clear();
    lastRenderedSnapshot = undefined;
    viewportKey = currentViewportKey();
  }

  function destroy() {
    destroyed = true;
    stopResizeObservation();
    clear();
    if (!initialized) return;
    app.ticker.remove(tick);
    app.destroy(true);
    initialized = false;
    mounted = false;
  }

  return { mount, reconcile, captureThumbnail, clear, destroy };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: PixiThumbnailMime, quality: number): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), mime, quality);
  });
}

function requestFrame(callback: FrameRequestCallback): number {
  if (typeof globalThis.requestAnimationFrame === "function") return globalThis.requestAnimationFrame(callback);
  return globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

function cancelFrame(handle: number): void {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
    return;
  }
  globalThis.clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}
