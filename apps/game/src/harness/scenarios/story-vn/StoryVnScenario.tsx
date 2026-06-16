import { useMemo, useState } from "react";
import type { GameplayEvent, StoryEffect } from "@v-ronpa/contracts";
import { parseScenario } from "@v-ronpa/nani-parser";
import {
  advanceToNextStop,
  chooseStoryOption,
  createInitialStoryState,
  selectCurrentStoryLine,
  type StoryStepperDiagnostic
} from "@v-ronpa/story-engine";
import { ScenarioFrame } from "../../ScenarioFrame";
import { verticalSliceScript } from "../../fixtures/verticalSlice";

export function StoryVnScenario() {
  const parsed = useMemo(
    () => parseScenario({ sourceText: verticalSliceScript, scriptPath: "harness/vertical-slice.nani" }),
    []
  );
  const [runtime, setRuntime] = useState(() => ({
    state: createInitialStoryState(parsed.scenario),
    diagnostics: [] as StoryStepperDiagnostic[]
  }));
  const story = runtime.state;
  const currentLine = selectCurrentStoryLine(story);
  const latestEffect = story.effects.at(-1);
  const latestGameplayEffect = selectLatestGameplayEffect(story.effects);

  function advance() {
    setRuntime((current) => advanceToNextStop(current.state, parsed.scenario));
  }

  function choose(index: number) {
    setRuntime((current) => chooseStoryOption(current.state, parsed.scenario, index));
  }

  return (
    <ScenarioFrame
      scenarioId="story-vn"
      title="Story VN Stepper"
      description="Reserved entry for story-engine work: advance-to-next-presentable, local choice branching, ended state, gameplay effects, and no-op invalid choices."
      status={story.ended ? "Story ended" : story.pendingChoices.length > 0 ? "Waiting for choice" : "Stepper ready"}
      log={[
        { id: "statements", label: "Statements", value: String(parsed.scenario.statements.length) },
        { id: "labels", label: "Labels", value: Object.keys(parsed.scenario.labels).join(", ") },
        { id: "pointer", label: "Instruction Pointer", value: String(story.instructionPointer) },
        { id: "ended", label: "Ended", value: String(story.ended) },
        { id: "latest-effect", label: "Latest Effect", value: formatEffect(latestEffect) },
        { id: "diagnostics", label: "Diagnostics", value: formatDiagnostics(runtime.diagnostics) }
      ]}
      commands={
        <>
          <button data-testid="story-vn-advance" type="button" onClick={advance}>
            Advance
          </button>
          {story.pendingChoices.map((choice, index) => (
            <button key={`${choice.text}-${index}`} data-testid={choiceTestId(index)} type="button" onClick={() => choose(index)}>
              {choice.text}
            </button>
          ))}
        </>
      }
    >
      <div className="harness-placeholder" data-testid="story-vn-shell">
        <h1>Story VN Stepper</h1>
        <p>
          Pointer <strong data-testid="story-vn-pointer">{story.instructionPointer}</strong> · Ended{" "}
          <strong data-testid="story-vn-ended">{String(story.ended)}</strong>
        </p>
        <p>
          Variables:{" "}
          <strong data-testid="story-vn-variables">
            {Object.entries(story.variables)
              .map(([key, value]) => `${key}: ${String(value)}`)
              .join(", ") || "none"}
          </strong>
        </p>
        <p>
          Pending Choices:{" "}
          <strong data-testid="story-vn-pending-choices">
            {story.pendingChoices.map((choice) => choice.text).join(" | ") || "none"}
          </strong>
        </p>
        <p>
          Latest Effect: <strong data-testid="story-vn-latest-effect">{formatEffect(latestEffect)}</strong>
        </p>
        <p>
          Latest Gameplay:{" "}
          <strong data-testid="story-vn-latest-gameplay-effect">{formatEffect(latestGameplayEffect)}</strong>
        </p>
        <p>
          Diagnostics: <strong data-testid="story-vn-diagnostics">{formatDiagnostics(runtime.diagnostics)}</strong>
        </p>
      </div>
      <div className="dialog-box" data-testid="story-vn-dialog">
        <div className="dialog-speaker" data-testid="story-vn-speaker">
          {currentLine?.speaker ?? "System"}
        </div>
        <p data-testid="story-vn-text">{currentLine?.text ?? "Advance to the first readable stop."}</p>
        {story.pendingChoices.length > 0 ? (
          <div className="choice-row" data-testid="story-vn-choice-row">
            {story.pendingChoices.map((choice, index) => (
              <button
                key={`${choice.text}-dialog-${index}`}
                data-testid={`${choiceTestId(index)}-dialog`}
                type="button"
                onClick={() => choose(index)}
              >
                {choice.text}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </ScenarioFrame>
  );
}

function choiceTestId(index: number): string {
  if (index === 0) return "story-vn-choice-a";
  if (index === 1) return "story-vn-choice-b";
  return `story-vn-choice-${index}`;
}

function selectLatestGameplayEffect(effects: StoryEffect[]): StoryEffect | undefined {
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index];
    if (effect?.type === "gameplay-event") return effect;
  }
  return undefined;
}

function formatDiagnostics(diagnostics: StoryStepperDiagnostic[]): string {
  return diagnostics.map((diagnostic) => diagnostic.code).join(", ") || "none";
}

function formatEffect(effect: StoryEffect | undefined): string {
  if (!effect) return "none";
  if (effect.type === "gameplay-event") return formatGameplayEvent(effect.event);
  if (effect.type === "presentation") return `${effect.command.type}${"text" in effect.command ? ` ${effect.command.text}` : ""}`;
  return effect.type;
}

function formatGameplayEvent(effect: GameplayEvent): string {
  switch (effect.type) {
    case "grant-evidence":
    case "remove-evidence":
      return `${effect.type} ${effect.evidenceId}`;
    case "grant-item":
    case "remove-item":
    case "consume-item":
      return `${effect.type} ${effect.itemId}`;
    case "change-character-affinity":
    case "add-character-status":
    case "remove-character-status":
    case "unlock-character-skill":
      return `${effect.type} ${effect.characterId}`;
  }
}
