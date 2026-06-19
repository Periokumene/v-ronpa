import type { StoryEffect } from "@v-ronpa/contracts";
import { selectCurrentStoryLine, type StoryRuntimeState } from "@v-ronpa/story-engine";
import { VnDialogSurface } from "@v-ronpa/ui-kit";
import { PixiLayer } from "./PixiLayer";
import {
  defaultVnOutputRouteTable,
  selectEffectsForTarget,
  selectNewStoryEffects,
  selectPresentationCommandsForTarget,
  type VnOutputRouteContext,
  type VnOutputRouteTable,
  type VnOutputRouteTarget,
  type VnRuntimeProfile
} from "./vnOutputRoutes";

export interface VnRuntimeDispatcherProps {
  active: boolean;
  story: StoryRuntimeState;
  storySession?: number | string;
  profile?: VnRuntimeProfile;
  routeTable?: VnOutputRouteTable;
  formatSpeaker?: (speaker: string) => string;
  onAdvance: () => void;
  onChoice: (index: number) => void;
  onCancel: () => void;
}

export function VnRuntimeDispatcher({
  active,
  story,
  storySession = "story",
  profile = "vn2d",
  routeTable = defaultVnOutputRouteTable,
  formatSpeaker,
  onAdvance,
  onChoice,
  onCancel
}: VnRuntimeDispatcherProps) {
  const routeContext: VnOutputRouteContext = { profile };
  const currentLine = active ? selectCurrentStoryLine(story) : undefined;
  const pixiCommands = selectPresentationCommandsForTarget(story.presentationCommands, "pixi", routeTable, routeContext);
  const speaker = currentLine?.speaker && formatSpeaker ? formatSpeaker(currentLine.speaker) : currentLine?.speaker;

  return (
    <>
      <PixiLayer key={storySession} commands={pixiCommands} visible={active} />
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

export function selectVnEffectsForTarget(
  effects: StoryEffect[],
  target: VnOutputRouteTarget,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  profile: VnRuntimeProfile = "vn2d"
): StoryEffect[] {
  return selectEffectsForTarget(effects, target, routeTable, { profile });
}

export function selectVnNewEffectsForTarget(
  nextStory: StoryRuntimeState,
  previousStory: StoryRuntimeState,
  target: VnOutputRouteTarget,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  profile: VnRuntimeProfile = "vn2d"
): StoryEffect[] {
  return selectVnEffectsForTarget(
    selectNewStoryEffects(previousStory.effects.length, nextStory.effects),
    target,
    routeTable,
    profile
  );
}
