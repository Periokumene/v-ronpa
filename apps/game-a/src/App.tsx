import { useMemo } from "react";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import {
  GameInteractionShell,
  VnRuntimeDispatcher,
  settingsToDialogDisplaySettings,
  settingsToStoryPlayTimingPolicy,
  useGameSettingsAdapter
} from "@v-ronpa/app-vn-shell";
import { gameAContentManifest } from "./contentManifest";
import { useGameAFlowActor } from "./useGameAFlowActor";
import { useGameAOverlayAdapters } from "./useGameAOverlayAdapters";
import { useGameASaveAdapter } from "./useGameASaveAdapter";
import { useGameAVnRuntime } from "./useGameAVnRuntime";

export function App() {
  const flow = useGameAFlowActor();
  const settings = useGameSettingsAdapter({ storageKey: "v-ronpa:game-a:settings:v1" });
  const assetRegistry = useMemo(() => createAssetRegistry(gameAContentManifest), []);
  const storyPlayTiming = useMemo(() => settingsToStoryPlayTimingPolicy(settings.settings), [settings.settings]);
  const dialogDisplay = useMemo(() => settingsToDialogDisplaySettings(settings.settings), [settings.settings]);
  const runtime = useGameAVnRuntime({ storyPlayTiming });
  const save = useGameASaveAdapter({
    getPixiStage: () => runtime.pixiStageRuntime.snapshot,
    getStory: () => runtime.storyRuntime.state,
    onLoad: runtime.restoreFromSave
  });
  const overlayPages = useGameAOverlayAdapters({ flow, runtime, save, settings });

  return (
    <main className="game-a-shell">
      <section className="game-a-playfield" data-testid="game-a-playfield">
        <GameInteractionShell
          dialogDisplay={dialogDisplay}
          flow={flow}
          formatStorySpeaker={displaySpeaker}
          overlayPages={overlayPages}
          runtime={runtime}
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
              onPixiTasksChanged={runtime.updatePixiPresentationTasks}
            />
          </div>
        </GameInteractionShell>
        <div className="game-a-hud">
          <div className="game-a-status">
            <span data-testid="game-a-app-id">game-a</span>
            <strong>VN Framework</strong>
            <small data-testid="game-a-mode">{flow.mode}</small>
          </div>
        </div>
      </section>
    </main>
  );
}

function displaySpeaker(speaker: string): string {
  if (speaker === "Narrator") return "旁白";
  return speaker;
}
