import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-presenter";
import { selectCurrentStoryLine, type StoryRuntimeState } from "@v-ronpa/story-engine";
import { VnDialogSurface } from "@v-ronpa/ui-kit";
import { PixiLayer } from "./PixiLayer";

export interface VnRuntimeDispatcherProps {
  active: boolean;
  story: StoryRuntimeState;
  pixiStage: PixiStageSnapshot;
  pixiHints: PixiStageRenderHint[];
  pixiHintSequence: number;
  pixiAnimate: boolean;
  storySession?: number | string;
  formatSpeaker?: (speaker: string) => string;
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
  storySession = "story",
  formatSpeaker,
  onAdvance,
  onChoice,
  onCancel
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
        snapshot={pixiStage}
        visible={active}
      />
      {active && currentLine ? (
        <VnDialogSurface
          {...(speaker ? { speaker } : {})}
          text={currentLine.text}
          choices={story.pendingChoices}
          ended={story.ended}
          onAdvance={onAdvance}
          onChoice={onChoice}
          onCancel={onCancel}
        />
      ) : null}
    </>
  );
}
