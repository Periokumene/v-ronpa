import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiPresentationTaskSnapshot, PixiStageRenderHint } from "@v-ronpa/pixi-presenter";
import { PixiLayer } from "./PixiLayer";

export interface VnRuntimeDispatcherProps {
  active: boolean;
  pixiStage: PixiStageSnapshot;
  pixiHints: PixiStageRenderHint[];
  pixiHintSequence: number;
  pixiAnimate: boolean;
  pixiPresentationTasks?: PixiPresentationTaskSnapshot[];
  storySession?: number | string;
  onPixiTasksChanged?: (tasks: PixiPresentationTaskSnapshot[]) => void;
}

export function VnRuntimeDispatcher({
  active,
  pixiStage,
  pixiHints,
  pixiHintSequence,
  pixiAnimate,
  pixiPresentationTasks,
  storySession = "story",
  onPixiTasksChanged
}: VnRuntimeDispatcherProps) {
  return (
    <PixiLayer
      key={storySession}
      animate={pixiAnimate}
      hintSequence={pixiHintSequence}
      hints={pixiHints}
      {...(onPixiTasksChanged ? { onTasksChanged: onPixiTasksChanged } : {})}
      {...(pixiPresentationTasks ? { presentationTasks: pixiPresentationTasks } : {})}
      snapshot={pixiStage}
      visible={active}
    />
  );
}
