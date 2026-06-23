import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiPresentationTaskSnapshot, PixiStageRenderHint } from "@v-ronpa/pixi-presenter";
import { selectCurrentStoryLine, type StoryRuntimeState } from "@v-ronpa/story-engine";
import { VnDialogSurface, type VnDialogDisplaySettings } from "@v-ronpa/ui-kit";
import { PixiLayer } from "./PixiLayer";

export interface VnRuntimeDispatcherProps {
  active: boolean;
  story: StoryRuntimeState;
  pixiStage: PixiStageSnapshot;
  pixiHints: PixiStageRenderHint[];
  pixiHintSequence: number;
  pixiAnimate: boolean;
  pixiPresentationTasks?: PixiPresentationTaskSnapshot[];
  storySession?: number | string;
  dialogDisplay?: VnDialogDisplaySettings;
  formatSpeaker?: (speaker: string) => string;
  onPixiTasksChanged?: (tasks: PixiPresentationTaskSnapshot[]) => void;
  onAdvance: () => void;
  onChoice: (index: number) => void;
  onCancel: () => void;
}

export function VnRuntimeDispatcher({
  active,
  story,
  pixiStage,
  pixiHints,
  pixiHintSequence,
  pixiAnimate,
  pixiPresentationTasks,
  storySession = "story",
  dialogDisplay,
  formatSpeaker,
  onAdvance,
  onChoice,
  onCancel,
  onPixiTasksChanged
}: VnRuntimeDispatcherProps) {
  const currentLine = active ? selectCurrentStoryLine(story) : undefined;
  const speaker = currentLine?.speaker && formatSpeaker ? formatSpeaker(currentLine.speaker) : currentLine?.speaker;

  return (
    <>
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
      {active && currentLine ? (
        <VnDialogSurface
          {...(speaker ? { speaker } : {})}
          text={currentLine.text}
          choices={story.pendingChoices}
          {...(dialogDisplay ? { displaySettings: dialogDisplay } : {})}
          ended={story.ended}
          onAdvance={onAdvance}
          onChoice={onChoice}
          onCancel={onCancel}
        />
      ) : null}
    </>
  );
}
