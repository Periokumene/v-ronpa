import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiAssetResolver, PixiPresenterDiagnostic, PixiPresentationTaskSnapshot, PixiStageRenderHint } from "@v-ronpa/pixi-presenter";
import { PixiLayer } from "./PixiLayer";

export interface VnRuntimeDispatcherProps {
  active: boolean;
  assetResolver?: PixiAssetResolver;
  pixiStage: PixiStageSnapshot;
  pixiHints: PixiStageRenderHint[];
  pixiHintSequence: number;
  pixiAnimate: boolean;
  pixiPresentationTasks?: PixiPresentationTaskSnapshot[];
  storySession?: number | string;
  onPixiDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void;
  onPixiTasksChanged?: (tasks: PixiPresentationTaskSnapshot[]) => void;
}

export function VnRuntimeDispatcher({
  active,
  assetResolver,
  pixiStage,
  pixiHints,
  pixiHintSequence,
  pixiAnimate,
  pixiPresentationTasks,
  storySession = "story",
  onPixiDiagnostic,
  onPixiTasksChanged
}: VnRuntimeDispatcherProps) {
  return (
    <PixiLayer
      key={storySession}
      animate={pixiAnimate}
      {...(assetResolver ? { assetResolver } : {})}
      hintSequence={pixiHintSequence}
      hints={pixiHints}
      {...(onPixiDiagnostic ? { onDiagnostic: onPixiDiagnostic } : {})}
      {...(onPixiTasksChanged ? { onTasksChanged: onPixiTasksChanged } : {})}
      {...(pixiPresentationTasks ? { presentationTasks: pixiPresentationTasks } : {})}
      snapshot={pixiStage}
      visible={active}
    />
  );
}
