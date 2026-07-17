import { useCallback, useEffect, useMemo, useRef } from "react";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import {
  GameInteractionShell,
  VnPixiPresenterHost,
  settingsToDialogDisplaySettings,
  settingsToDialogueBleepRuntimeSettings,
  settingsToStoryPlayTimingPolicy,
  settingsToVoiceRuntimeSettings,
  useGameSettingsAdapter,
  usePixiStageReadiness
} from "@v-ronpa/app-vn-shell";
import { SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS } from "@v-ronpa/media-save";
import { RichTextFontStyles } from "@v-ronpa/ui-kit";
import { gameAContentManifest } from "./contentManifest";
import { resolveGameAVnLaunchTarget, shouldAutoStartGameAVnLaunchTarget } from "./devVnLaunchTarget";
import { useGameAFlowActor } from "./useGameAFlowActor";
import { useGameAOverlayAdapters } from "./useGameAOverlayAdapters";
import { useGameASaveAdapter } from "./useGameASaveAdapter";
import { useGameAVnRuntime } from "./useGameAVnRuntime";
import { createGameASurfaces, type GameASurfaceNavigation } from "./ui/GameASurfaces";
import { gameAUiConfig } from "./ui/gameAUiConfig";
import { resolveGameAUiAssets } from "./ui/resolveGameAUiAssets";
import { useGameAUiAudio } from "./ui/useGameAUiAudio";
import { gameAOpeningLaunchDefinition, type GameAVnLaunchDefinition } from "./gameAScripts";

export function App({ launchDefinition = gameAOpeningLaunchDefinition }: { launchDefinition?: GameAVnLaunchDefinition } = {}) {
  const devVnLaunchTarget = useMemo(
    () =>
      resolveGameAVnLaunchTarget({
        devMode: import.meta.env.DEV,
        search: typeof window === "undefined" ? "" : window.location.search
      }),
    []
  );
  const didAutoStartDevLaunch = useRef(false);
  const settings = useGameSettingsAdapter({ storageKey: "v-ronpa:game-a:settings:v1" });
  const assetRegistry = useMemo(() => createAssetRegistry(gameAContentManifest), []);
  const storyPlayTiming = useMemo(() => settingsToStoryPlayTimingPolicy(settings.settings), [settings.settings]);
  const dialogDisplay = useMemo(() => settingsToDialogDisplaySettings(settings.settings), [settings.settings]);
  const dialogRevealSettings = useMemo(() => ({ textSpeed: dialogDisplay.textSpeed }), [dialogDisplay.textSpeed]);
  const dialogueBleepSettings = useMemo(() => settingsToDialogueBleepRuntimeSettings(settings.settings), [settings.settings]);
  const voiceSettings = useMemo(() => settingsToVoiceRuntimeSettings(settings.settings), [settings.settings]);
  const startPromiseRef = useRef<Promise<boolean> | undefined>(undefined);
  const pixiStage = usePixiStageReadiness();
  const runtime = useGameAVnRuntime({
    assetResolver: assetRegistry,
    ...(gameAContentManifest.audio?.dialogueBleep ? { dialogueBleepConfig: gameAContentManifest.audio.dialogueBleep } : {}),
    dialogueBleepSettings,
    dialogRevealSettings,
    entry: launchDefinition.runtimeEntry,
    storyPlayTiming,
    ...(devVnLaunchTarget.startLabelOverride ? { startLabelOverride: devVnLaunchTarget.startLabelOverride } : {}),
    voiceSettings
  });
  const flow = useGameAFlowActor(runtime.shell.interactionFacts);
  const save = useGameASaveAdapter({
    canSave: () => flow.capabilities.canSave,
    capturePreview: () => pixiStage.handle?.captureThumbnail(SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS),
    getCheckpoint: runtime.lifecycle.createVnSaveCheckpoint,
    onLoad: runtime.restoreFromSave
  });
  const beginNewGame = useCallback(() => {
    if (startPromiseRef.current) return startPromiseRef.current;
    const promise = (async () => {
      try {
        if (!(await pixiStage.waitUntilReady())) return false;
        if (!runtime.startNewGame()) return false;
        flow.send({ type: "START_NEW_GAME", mode: "vn" });
        return true;
      } finally {
        startPromiseRef.current = undefined;
      }
    })();
    startPromiseRef.current = promise;
    return promise;
  }, [flow, pixiStage.waitUntilReady, runtime]);
  const overlayPages = useGameAOverlayAdapters({
    flow,
    runtime,
    save,
    settings,
    beginNewGame,
    ensureVnPresentationReady: pixiStage.waitUntilReady
  });
  const gameAUiAssets = useMemo(() => resolveGameAUiAssets(assetRegistry, gameAUiConfig), [assetRegistry]);
  const gameAUiAudioBindings = useGameAUiAudio({
    assets: gameAUiAssets.uiAudio,
    sound: settings.settings.sound
  });
  const gameASurfaceNavigationRef = useRef<GameASurfaceNavigation | null>(null);
  if (!gameASurfaceNavigationRef.current) {
    gameASurfaceNavigationRef.current = {
      pauseSection: flow.pauseSection,
      capabilities: flow.capabilities,
      dispatch: overlayPages.dispatchUiAction
    };
  }
  gameASurfaceNavigationRef.current.pauseSection = flow.pauseSection;
  gameASurfaceNavigationRef.current.capabilities = flow.capabilities;
  gameASurfaceNavigationRef.current.dispatch = overlayPages.dispatchUiAction;
  const gameASurfaceNavigation = gameASurfaceNavigationRef.current;
  const gameASurfaces = useMemo(
    () =>
      createGameASurfaces({
        assets: gameAUiAssets,
        config: gameAUiConfig,
        navigation: gameASurfaceNavigation,
        vnPreparationPending: pixiStage.pending
      }),
    [gameAUiAssets, gameASurfaceNavigation, pixiStage.pending]
  );
  const startLabelError = runtime.startLabelError;

  useEffect(() => {
    gameAUiAssets.diagnostics.forEach(runtime.diagnostics.observeAssetDiagnostic);
  }, [gameAUiAssets.diagnostics, runtime.diagnostics.observeAssetDiagnostic]);

  useEffect(() => {
    if (didAutoStartDevLaunch.current) return;
    if (
      !shouldAutoStartGameAVnLaunchTarget({
        target: devVnLaunchTarget,
        hasInvalidStartLabel: Boolean(startLabelError)
      })
    ) {
      return;
    }

    if (!pixiStage.handle) return;
    didAutoStartDevLaunch.current = true;
    void beginNewGame();
  }, [beginNewGame, devVnLaunchTarget, pixiStage.handle, startLabelError]);

  const devVnLaunchError = devVnLaunchTarget.requested
    ? devVnLaunchTarget.error?.message ?? startLabelError?.message
    : undefined;
  const assetDiagnosticCount = runtime.diagnostics.runtimeDiagnostics.filter(
    (diagnostic) => diagnostic.source === "asset"
  ).length;

  return (
    <main
      className="game-a-shell"
      data-game-a-asset-diagnostics-count={String(assetDiagnosticCount)}
      {...gameAUiAudioBindings}
    >
      <RichTextFontStyles
        assetResolver={assetRegistry}
        fonts={gameAContentManifest.fonts}
        onDiagnostic={runtime.diagnostics.observeAssetDiagnostic}
      />
      <section className="game-a-playfield" data-testid="game-a-playfield">
        <GameInteractionShell
          dialogDisplay={dialogDisplay}
          flow={flow}
          formatStorySpeaker={displaySpeaker}
          overlayPages={overlayPages}
          runtime={runtime.shell}
          surfaces={gameASurfaces}
        >
          <div className="game-a-scene" data-testid="game-a-vn-shell">
            <VnPixiPresenterHost
              active={flow.mode === "vn" && runtime.shell.storyRuntime.active}
              assetResolver={assetRegistry}
              characterOutlineEnabled={true}
              characterPreloadPlan={launchDefinition.characterPreloadPlan}
              diagnostics={runtime.diagnostics}
              presentation={runtime.presentation}
              onStageHandleChanged={pixiStage.onStageHandleChanged}
            />
          </div>
        </GameInteractionShell>
        <div className="game-a-hud">
          <div className="game-a-status">
            <span data-testid="game-a-app-id">game-a</span>
            <strong>视觉小说框架</strong>
            <small data-testid="game-a-mode">{formatGameAMode(flow.mode)}</small>
          </div>
        </div>
        {devVnLaunchError ? (
          <div className="game-a-dev-launch-error" data-testid="game-a-dev-launch-error" role="alert">
            {devVnLaunchError}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function displaySpeaker(speaker: string): string {
  if (speaker === "Narrator") return "旁白";
  return speaker;
}

function formatGameAMode(mode: string): string {
  if (mode === "loading") return "加载中";
  if (mode === "title") return "标题";
  if (mode === "vn") return "视觉小说";
  if (mode === "navi") return "探索";
  if (mode === "trial") return "裁判";
  if (mode === "paused") return "暂停";
  return mode;
}
