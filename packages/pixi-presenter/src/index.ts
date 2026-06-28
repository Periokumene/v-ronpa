import { Application, Container, type Ticker } from "pixi.js";
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
import { builtInPixiFxRuntimeAssets, preloadBuiltInPixiFxAssets } from "./internal/fxAssets";
import type { PixiAssetResolver, PixiPresenterDiagnostic } from "./internal/assetResolver";
import { PresentationTaskController, type PixiPresentationTaskSnapshot } from "./internal/presentationTasks";
import { type PixiStageRenderHint } from "./stageSnapshot";

export {
  MAIN_BACKGROUND_ID,
  createInitialPixiStageSnapshot,
  normalizeActorTransformParams,
  reducePixiRuntimeCommand,
  resolvePixiActorTarget,
  type PixiRuntimeCommandDiagnostic,
  type PixiRuntimeCommandReduction,
  type PixiStageRenderHint
} from "./stageSnapshot";
export type { PixiPresentationTaskSnapshot } from "./internal/presentationTasks";
export { builtInPixiFxRuntimeAssets };
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

  const size = {
    width: () => app.renderer.width || options.host.clientWidth || options.width || 960,
    height: () => app.renderer.height || options.host.clientHeight || options.height || 540
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
      ...(options.assetResolver ? { assetResolver: options.assetResolver } : {}),
      ...(options.onDiagnostic ? { onDiagnostic: options.onDiagnostic } : {})
    };
    actors = new ActorSystem(systemOptions, filters, tweens, tasks);
    weather = new WeatherSystem(systemOptions, filters, tweens, tasks);
    screenOverlays = new ScreenOverlaySystem(systemOptions, tweens, tasks);
    effects = new TransientEffectSystem(systemOptions, actors, rootFilters, tweens, tasks);
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
    if (!animate) {
      tweens.clear();
      tasks.settleAllNonHold();
      effects?.clear();
    }
    actors?.reconcile(snapshot, animate && snapshot.revision !== lastRenderedSnapshot?.revision);
    weather?.reconcile(snapshot, animate && snapshot.revision !== lastRenderedSnapshot?.revision, reconcileOptions.hints ?? []);
    screenOverlays?.reconcile(snapshot, animate && snapshot.revision !== lastRenderedSnapshot?.revision);
    filters.applyScreenFilters(snapshot, animate && snapshot.revision !== lastRenderedSnapshot?.revision, reconcileOptions.hints ?? []);
    effects?.clearTrialOverlays();
    if (animate) effects?.run(reconcileOptions.hints ?? [], snapshot.revision);
    lastRenderedSnapshot = snapshot;
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
