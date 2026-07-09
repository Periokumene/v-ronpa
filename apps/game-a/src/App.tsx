import { useEffect, useMemo, useRef } from "react";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import {
  GameInteractionShell,
  VnRuntimeDispatcher,
  settingsToDialogDisplaySettings,
  settingsToDialogueBleepRuntimeSettings,
  settingsToStoryPlayTimingPolicy,
  settingsToVoiceRuntimeSettings,
  useGameSettingsAdapter,
  type PixiStageCaptureHandle
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

export function App() {
  const flow = useGameAFlowActor();
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
  const pixiCaptureHandleRef = useRef<PixiStageCaptureHandle | undefined>(undefined);
  const runtime = useGameAVnRuntime({
    assetResolver: assetRegistry,
    ...(gameAContentManifest.audio?.dialogueBleep ? { dialogueBleepConfig: gameAContentManifest.audio.dialogueBleep } : {}),
    dialogueBleepSettings,
    dialogRevealSettings,
    storyPlayTiming,
    ...(devVnLaunchTarget.startLabelOverride ? { startLabelOverride: devVnLaunchTarget.startLabelOverride } : {}),
    voiceSettings
  });
  const save = useGameASaveAdapter({
    capturePreview: () => pixiCaptureHandleRef.current?.captureThumbnail(SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS),
    getPixiStage: () => runtime.pixiStageRuntime.snapshot,
    getStory: () => runtime.storyRuntime.state,
    onLoad: runtime.restoreFromSave
  });
  const overlayPages = useGameAOverlayAdapters({ flow, runtime, save, settings });
  const gameAUiAssets = useMemo(() => resolveGameAUiAssets(assetRegistry, gameAUiConfig), [assetRegistry]);
  const gameASurfaceNavigationRef = useRef<GameASurfaceNavigation | null>(null);
  if (!gameASurfaceNavigationRef.current) {
    gameASurfaceNavigationRef.current = {
      activeOverlay: flow.activeOverlay,
      capabilities: flow.capabilities,
      dispatch: overlayPages.dispatchUiAction
    };
  }
  gameASurfaceNavigationRef.current.activeOverlay = flow.activeOverlay;
  gameASurfaceNavigationRef.current.capabilities = flow.capabilities;
  gameASurfaceNavigationRef.current.dispatch = overlayPages.dispatchUiAction;
  const gameASurfaceNavigation = gameASurfaceNavigationRef.current;
  const gameASurfaces = useMemo(
    () =>
      createGameASurfaces({
        assets: gameAUiAssets,
        config: gameAUiConfig,
        navigation: gameASurfaceNavigation
      }),
    [gameAUiAssets, gameASurfaceNavigation]
  );
  const startLabelError = runtime.startLabelError;
  const startNewGame = runtime.startNewGame;
  const sendFlowEvent = flow.send;

  useEffect(() => {
    gameAUiAssets.diagnostics.forEach(runtime.observeAssetDiagnostic);
  }, [gameAUiAssets.diagnostics, runtime.observeAssetDiagnostic]);

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

    didAutoStartDevLaunch.current = true;
    if (startNewGame()) sendFlowEvent({ type: "ENTER_VN" });
  }, [devVnLaunchTarget, sendFlowEvent, startLabelError, startNewGame]);

  const devVnLaunchError = devVnLaunchTarget.requested
    ? devVnLaunchTarget.error?.message ?? startLabelError?.message
    : undefined;

  return (
    <main className="game-a-shell">
      <RichTextFontStyles
        assetResolver={assetRegistry}
        fonts={gameAContentManifest.fonts}
        onDiagnostic={runtime.observeAssetDiagnostic}
      />
      <section className="game-a-playfield" data-testid="game-a-playfield">
        <GameInteractionShell
          dialogDisplay={dialogDisplay}
          flow={flow}
          formatStorySpeaker={displaySpeaker}
          overlayPages={overlayPages}
          runtime={runtime}
          surfaces={gameASurfaces}
        >
          <div className="game-a-scene" data-testid="game-a-vn-shell">
            <VnRuntimeDispatcher
              active={flow.mode === "vn" && runtime.storyRuntime.active}
              assetResolver={assetRegistry}
              pixiAnimate={runtime.pixiStageRuntime.animate}
              pixiHintSequence={runtime.pixiStageRuntime.hintSequence}
              pixiHints={runtime.pixiStageRuntime.hints}
              pixiPresentationTasks={runtime.pixiStageRuntime.presentationTasks}
              pixiStage={runtime.pixiStageRuntime.snapshot}
              storySession="game-a-opening"
              onPixiCaptureHandleChanged={(handle) => {
                pixiCaptureHandleRef.current = handle;
              }}
              onPixiTasksChanged={runtime.updatePixiPresentationTasks}
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
  if (mode === "saving") return "保存中";
  return mode;
}
