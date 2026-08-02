import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import {
  GameInteractionShell,
  VnPixiPresenterHost,
  settingsToStoryTextDisplaySettings,
  settingsToDialogueBleepRuntimeSettings,
  settingsToStoryPlayTimingPolicy,
  settingsToVoiceRuntimeSettings,
  useGameSettingsAdapter,
  usePixiVnScriptPreparation
} from "@v-ronpa/app-vn-shell";
import { SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS } from "@v-ronpa/media-save";
import { RichTextFontStyles } from "@v-ronpa/ui-kit";
import { gameAContentManifest } from "./contentManifest";
import { gameAStoryDefinition, type GameAStoryDefinition } from "./gameAScripts";
import { useGameAFlowActor } from "./useGameAFlowActor";
import { useGameAOverlayAdapters } from "./useGameAOverlayAdapters";
import { useGameASaveAdapter } from "./useGameASaveAdapter";
import { useGameAVnRuntime } from "./useGameAVnRuntime";
import { createGameASurfaces, type GameASurfaceNavigation } from "./ui/GameASurfaces";
import { gameAUiConfig } from "./ui/gameAUiConfig";
import { resolveGameAUiAssets } from "./ui/resolveGameAUiAssets";
import { useGameAUiAudio } from "./ui/useGameAUiAudio";

const GameADevApp = import.meta.env.DEV
  ? lazy(() => import("./devtools/GameADevApp").then((module) => ({ default: module.GameADevApp })))
  : undefined;

export interface GameAAppContext {
  runtime: ReturnType<typeof useGameAVnRuntime>;
  flow: ReturnType<typeof useGameAFlowActor>;
}

export function App() {
  if (!GameADevApp) {
    return (
      <GameAAppCore
        storyDefinition={gameAStoryDefinition}
      />
    );
  }
  return (
    <Suspense fallback={null}>
      <GameADevApp
        initialStoryDefinition={gameAStoryDefinition}
      />
    </Suspense>
  );
}

interface GameAAppCoreProps {
  storyDefinition: GameAStoryDefinition;
  className?: string;
  renderAfterPlayfield?: (context: GameAAppContext) => ReactNode;
  wrapPlayfield?: (playfield: ReactNode) => ReactNode;
}

export function GameAAppCore({
  storyDefinition,
  className,
  renderAfterPlayfield,
  wrapPlayfield
}: GameAAppCoreProps) {
  const settings = useGameSettingsAdapter({ storageKey: "v-ronpa:game-a:settings:v2" });
  const assetRegistry = useMemo(() => createAssetRegistry(gameAContentManifest), []);
  const storyPlayTiming = useMemo(() => settingsToStoryPlayTimingPolicy(settings.settings), [settings.settings]);
  const storyTextDisplay = useMemo(() => settingsToStoryTextDisplaySettings(settings.settings), [settings.settings]);
  const storyTextRevealSettings = useMemo(() => ({ textSpeed: storyTextDisplay.textSpeed }), [storyTextDisplay.textSpeed]);
  const dialogueBleepSettings = useMemo(() => settingsToDialogueBleepRuntimeSettings(settings.settings), [settings.settings]);
  const voiceSettings = useMemo(() => settingsToVoiceRuntimeSettings(settings.settings), [settings.settings]);
  const startPromiseRef = useRef<Promise<boolean> | undefined>(undefined);
  const pixiPreparation = usePixiVnScriptPreparation({
    initialScriptPath: storyDefinition.entry.initialScriptPath,
    plansByScriptPath: storyDefinition.characterPreloadPlanByScriptPath
  });
  const pixiStage = pixiPreparation.stage;
  const runtime = useGameAVnRuntime({
    entry: storyDefinition.entry,
    catalog: storyDefinition.catalog,
    prepareScriptPresentation: pixiPreparation.prepareScriptPresentation,
    assetResolver: assetRegistry,
    ...(gameAContentManifest.audio?.dialogueBleep ? { dialogueBleepConfig: gameAContentManifest.audio.dialogueBleep } : {}),
    dialogueBleepSettings,
    storyTextRevealSettings,
    storyPlayTiming,
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
        if (!(await runtime.startNewGame())) return false;
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

  useEffect(() => {
    gameAUiAssets.diagnostics.forEach(runtime.diagnostics.observeAssetDiagnostic);
  }, [gameAUiAssets.diagnostics, runtime.diagnostics.observeAssetDiagnostic]);

  useEffect(() => {
    if (flow.mode !== "vn" || !runtime.shell.interactionFacts.storyEnded) return;
    runtime.lifecycle.resetRuntime();
    flow.send({ type: "RETURN_TITLE" });
  }, [flow.mode, flow.send, runtime.lifecycle, runtime.shell.interactionFacts.storyEnded]);

  const assetDiagnosticCount = runtime.diagnostics.runtimeDiagnostics.filter(
    (diagnostic) => diagnostic.source === "asset"
  ).length;

  const playfield = (
    <section className="game-a-playfield" data-testid="game-a-playfield">
      <GameInteractionShell
        dialogAppearance={gameAUiConfig.dialog.appearance}
        storyTextDisplay={storyTextDisplay}
        flow={flow}
        overlayPages={overlayPages}
        runtime={runtime.shell}
        surfaces={gameASurfaces}
      >
        <div className="game-a-scene" data-testid="game-a-vn-shell">
          <VnPixiPresenterHost
            active={flow.mode === "vn" && runtime.shell.storyRuntime.active}
            assetResolver={assetRegistry}
            characterOutlineEnabled={true}
            characterPreloadPlan={pixiPreparation.initialCharacterPreloadPlan}
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
    </section>
  );

  return (
    <main
      className={className ? `game-a-shell ${className}` : "game-a-shell"}
      data-game-a-asset-diagnostics-count={String(assetDiagnosticCount)}
      {...gameAUiAudioBindings}
    >
      <RichTextFontStyles
        assetResolver={assetRegistry}
        fonts={gameAContentManifest.fonts}
        onDiagnostic={runtime.diagnostics.observeAssetDiagnostic}
      />
      {wrapPlayfield ? wrapPlayfield(playfield) : playfield}
      {renderAfterPlayfield?.({ runtime, flow })}
    </main>
  );
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
