import type { RuntimeCommand, RuntimeScript, StoryRuntimeSnapshot } from "@v-ronpa/contracts";
import { parseScenario, type NaniParserDiagnostic } from "@v-ronpa/nani-parser";
import { compileRuntimeScript, type RuntimeCompilerDiagnostic } from "@v-ronpa/nani-runtime-compiler";
import {
  createInitialStoryState,
  storyReducer,
  type StoryStepperDiagnostic,
  type StoryStepperResult
} from "@v-ronpa/story-engine";
import {
  advanceStoryPlay,
  chooseStoryPlayOption,
  createInitialStoryPlayState,
  stopStoryPlayAutomation,
  toggleAutoStoryPlay,
  toggleSkipStoryPlay,
  type StoryPlayAdvanceSource,
  type StoryPlayState,
  type StoryPlayStopReason,
  type StoryPlayStep
} from "@v-ronpa/story-play";

export interface VnEntrySource {
  scriptPath: string;
  sourceText: string;
  startLabel?: string;
}

export interface VnSessionDiagnostics {
  parser: NaniParserDiagnostic[];
  compiler: RuntimeCompilerDiagnostic[];
}

export interface VnSessionState {
  active: boolean;
  diagnostics: VnSessionDiagnostics;
  script: RuntimeScript;
  story: StoryRuntimeSnapshot;
  play: StoryPlayState;
}

export interface VnSessionStep {
  session: VnSessionState;
  storyStep: StoryStepperResult;
  emittedRuntimeCommands: RuntimeCommand[];
}

export interface VnSessionPlayStep {
  session: VnSessionState;
  playStep: StoryPlayStep;
  emittedRuntimeCommands: RuntimeCommand[];
}

export interface VnSessionRestoreSnapshot {
  story: StoryRuntimeSnapshot;
  play: StoryPlayState;
}

export interface VnSessionRestoreInput {
  script: RuntimeScript;
  diagnostics?: Partial<VnSessionDiagnostics>;
  snapshot: VnSessionRestoreSnapshot;
  active?: boolean;
}

export function createVnSession(entry: VnEntrySource): VnSessionStep {
  const parsed = parseScenario({ sourceText: entry.sourceText, scriptPath: entry.scriptPath });
  const compiled = compileRuntimeScript(parsed);
  const initialStory = createInitialStoryState(compiled.script);
  const jumped = entry.startLabel
    ? storyReducer(initialStory, { type: "JUMP", script: compiled.script, label: entry.startLabel })
    : { state: initialStory, diagnostics: [], emittedRuntimeCommands: [] };
  const play = createInitialStoryPlayState();
  const session = {
    active: true,
    diagnostics: { parser: [...parsed.diagnostics], compiler: compiled.diagnostics },
    script: compiled.script,
    story: jumped.state,
    play
  };
  return {
    session,
    storyStep: jumped,
    emittedRuntimeCommands: jumped.emittedRuntimeCommands
  };
}

export function advanceVnSession(session: VnSessionState, source: StoryPlayAdvanceSource = "manual"): VnSessionPlayStep {
  const playStep = advanceStoryPlay(session.play, {
    state: session.story,
    script: session.script,
    source
  });
  return toPlayStep(session, playStep);
}

export function chooseVnSessionOption(session: VnSessionState, index: number): VnSessionPlayStep {
  return toPlayStep(session, chooseStoryPlayOption(session.play, { state: session.story, script: session.script, index }));
}

export function submitVnSessionInput(session: VnSessionState, value: string | number | boolean): VnSessionPlayStep {
  const submitted = storyReducer(session.story, { type: "SUBMIT_INPUT", script: session.script, value });
  if (submitted.diagnostics.length > 0) {
    return toDiagnosticPlayStep(session, submitted);
  }
  return toPlayStep(
    { ...session, story: submitted.state },
    advanceStoryPlay(session.play, { state: submitted.state, script: session.script, source: "manual" })
  );
}

export function completeVnSessionPresentationWait(session: VnSessionState): VnSessionStep {
  return toReducerStep(session, storyReducer(session.story, { type: "PRESENTATION_COMPLETE", script: session.script }));
}

export function completeVnSessionRuntimeWait(session: VnSessionState, kind: "pause" | "movie"): VnSessionStep {
  return toReducerStep(session, storyReducer(session.story, { type: "RUNTIME_WAIT_COMPLETE", script: session.script, kind }));
}

export function toggleVnSessionAuto(session: VnSessionState): VnSessionState {
  return { ...session, play: toggleAutoStoryPlay(session.play) };
}

export function toggleVnSessionSkip(session: VnSessionState): VnSessionState {
  return { ...session, play: toggleSkipStoryPlay(session.play) };
}

export function stopVnSessionAutomation(session: VnSessionState, reason: StoryPlayStopReason): VnSessionState {
  return { ...session, play: stopStoryPlayAutomation(session.play, reason) };
}

export function createVnSessionRestoreSnapshot(session: VnSessionState): VnSessionRestoreSnapshot {
  return {
    story: session.story,
    play: session.play
  };
}

export function restoreVnSession({ active = true, diagnostics = {}, script, snapshot }: VnSessionRestoreInput): VnSessionState {
  return {
    active,
    diagnostics: { parser: diagnostics.parser ?? [], compiler: diagnostics.compiler ?? [] },
    script,
    story: snapshot.story,
    play: snapshot.play
  };
}

function toPlayStep(session: VnSessionState, playStep: StoryPlayStep): VnSessionPlayStep {
  return {
    session: {
      ...session,
      active: !playStep.story.state.ended,
      story: playStep.story.state,
      play: playStep.play
    },
    playStep,
    emittedRuntimeCommands: playStep.story.emittedRuntimeCommands
  };
}

function toReducerStep(session: VnSessionState, storyStep: StoryStepperResult): VnSessionStep {
  return {
    session: {
      ...session,
      active: !storyStep.state.ended,
      story: storyStep.state
    },
    storyStep,
    emittedRuntimeCommands: storyStep.emittedRuntimeCommands
  };
}

function toDiagnosticPlayStep(session: VnSessionState, storyStep: StoryStepperResult): VnSessionPlayStep {
  return {
    session: {
      ...session,
      active: !storyStep.state.ended,
      story: storyStep.state
    },
    playStep: {
      story: storyStep,
      play: session.play,
      intent: { source: "manual", pacing: "normal" }
    },
    emittedRuntimeCommands: storyStep.emittedRuntimeCommands
  };
}
