import { Application, Container, type Ticker } from "pixi.js";
import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import {
  ActorSystem,
  FilterSystem,
  ScreenOverlaySystem,
  TransientEffectSystem,
  TweenSystem,
  WeatherSystem
} from "./internal/systems";
import { preloadBuiltInPixiFxAssets } from "./internal/fxAssets";
import { type PixiStageRenderHint } from "./stageSnapshot";

export {
  MAIN_BACKGROUND_ID,
  createInitialPixiStageSnapshot,
  normalizeActorTransformParams,
  pixiStageSlots,
  reducePixiRuntimeCommand,
  resolvePixiActorTarget,
  type PixiRuntimeCommandDiagnostic,
  type PixiRuntimeCommandReduction,
  type PixiStageRenderHint
} from "./stageSnapshot";

export interface PixiPresenterOptions {
  host: HTMLElement;
  width?: number;
  height?: number;
}

export interface PixiStageReconcileOptions {
  animate?: boolean;
  hints?: PixiStageRenderHint[];
}

export interface PixiPresenterPort {
  mount(): Promise<void>;
  reconcile(snapshot: PixiStageSnapshot, options?: PixiStageReconcileOptions): void;
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

  const size = {
    width: () => app.renderer.width || options.host.clientWidth || options.width || 960,
    height: () => app.renderer.height || options.host.clientHeight || options.height || 540
  };
  const filters = new FilterSystem(size);

  const tick = (ticker: Ticker) => {
    tweens.tick(ticker);
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
    await preloadBuiltInPixiFxAssets();
    initialized = true;
    if (destroyed) {
      app.destroy(true);
      initialized = false;
      return;
    }
    app.canvas.dataset.testid = "pixi-canvas";
    options.host.appendChild(app.canvas);
    app.stage.addChild(stageRoot);
    const systemOptions = { root: stageRoot, width: size.width, height: size.height };
    actors = new ActorSystem(systemOptions, filters, tweens);
    weather = new WeatherSystem(systemOptions, filters);
    screenOverlays = new ScreenOverlaySystem(systemOptions);
    effects = new TransientEffectSystem(systemOptions, actors, filters, tweens);
    app.ticker.add(tick);
    mounted = true;
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
    effects?.clear();
    actors?.reconcile(snapshot, animate && snapshot.revision !== lastRenderedSnapshot?.revision);
    weather?.reconcile(snapshot);
    screenOverlays?.reconcile(snapshot);
    filters.applyScreenFilters(stageRoot, snapshot);
    if (animate) effects?.run(reconcileOptions.hints ?? []);
    lastRenderedSnapshot = snapshot;
  }

  function clear() {
    pendingReconcile = undefined;
    tweens.clear();
    actors?.clear();
    weather?.clear();
    screenOverlays?.clear();
    effects?.clear();
    lastRenderedSnapshot = undefined;
  }

  function destroy() {
    destroyed = true;
    clear();
    if (!initialized) return;
    app.ticker.remove(tick);
    app.destroy(true);
    initialized = false;
    mounted = false;
  }

  return { mount, reconcile, clear, destroy };
}
