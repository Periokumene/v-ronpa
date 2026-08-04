import { describe, expect, it } from "vitest";
import {
  advanceVnSession,
  chooseVnSessionOption,
  completeVnSessionPresentationWait,
  completeVnSessionRuntimeWait,
  createVnSessionRestoreSnapshot,
  createVnSession,
  resolveVnSessionChoice,
  resolveVnSessionInput,
  restoreVnSession,
  stepVnSessionInstruction,
  submitVnSessionInput,
  switchVnSessionScript,
  toggleVnSessionAuto,
  toggleVnSessionSkip
} from "./index";

const sourceText = `#Start
Narrator: First.
@choice "Left" goto:#Left
@choice "Right" goto:#Right

#Left
@set route:"left"
Narrator: Left route.
@end

#Right
@set route:"right"
Narrator: Right route.
@end`;

describe("app VN session", () => {
  it("boots and advances a script without renderer state", () => {
    const boot = createVnSession({ scriptPath: "session-test.nani", sourceText, startLabel: "Start" });
    const first = advanceVnSession(boot.session, "start");

    expect(boot.session.diagnostics).toEqual({ parser: [], compiler: [] });
    expect(first.session.story.backlog).toEqual([{ speaker: "Narrator", text: "First." }]);
    expect(first.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["print"]);
  });

  it("steps one instruction without changing play mode and matches batched story state", () => {
    const boot = createVnSession({
      scriptPath: "session-step.nani",
      sourceText: `#Start
@set route:"intro"
@back bg/harness
Narrator: First.`,
      startLabel: "Start"
    });
    const batched = advanceVnSession(boot.session, "start");

    const setStep = stepVnSessionInstruction(boot.session);
    const backStep = stepVnSessionInstruction(setStep.session);
    const printStep = stepVnSessionInstruction(backStep.session);

    expect(setStep.session.story.instructionPointer).toBe(1);
    expect(setStep.session.story.variables.route).toBe("intro");
    expect(backStep.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["back"]);
    expect(printStep.session.story).toEqual(batched.session.story);
    expect(printStep.session.play).toEqual(boot.session.play);
    expect([
      ...setStep.emittedRuntimeCommands,
      ...backStep.emittedRuntimeCommands,
      ...printStep.emittedRuntimeCommands
    ]).toEqual(batched.emittedRuntimeCommands);
  });

  it("chooses branches and keeps session restore snapshots headless", () => {
    const boot = createVnSession({ scriptPath: "session-choice.nani", sourceText, startLabel: "Start" });
    const first = advanceVnSession(boot.session, "start");
    const withChoices = advanceVnSession(first.session, "manual");
    const chosen = chooseVnSessionOption(withChoices.session, 1);
    const snapshot = createVnSessionRestoreSnapshot(chosen.session);
    const restored = restoreVnSession({ script: chosen.session.script, snapshot });

    expect(withChoices.session.story.pendingChoices.map((choice) => choice.text)).toEqual(["Left", "Right"]);
    expect(chosen.session.story.variables.route).toBe("right");
    expect(snapshot.story.variables.route).toBe("right");
    expect(restored.story.variables.route).toBe("right");
  });

  it("switches scripts while preserving story and play state and clearing transient boundaries", () => {
    const first = createVnSession({
      scriptPath: "game/opening.nani",
      sourceText: '#Start\n@set route:"milk"\nNarrator: Before.\n@choice "Continue" goto:game/chapter-02.nani#Start',
      startLabel: "Start"
    });
    const before = advanceVnSession(first.session, "start");
    const choices = advanceVnSession(before.session, "manual");
    const requested = chooseVnSessionOption(toggleVnSessionAuto(choices.session), 0);
    const target = createVnSession({
      scriptPath: "game/chapter-02.nani",
      sourceText: "#Start\nNarrator: After.\n@end"
    });
    const switched = switchVnSessionScript(requested.session, {
      script: target.session.script,
      instructionPointer: target.session.script.labels.Start ?? 0
    });

    expect(requested.playStep.story.navigationRequest).toEqual({ endpoint: "game/chapter-02.nani#Start" });
    expect(switched.story).toMatchObject({
      currentScriptPath: "game/chapter-02.nani",
      instructionPointer: 0,
      variables: { route: "milk" },
      backlog: [{ speaker: "Narrator", text: "Before." }],
      pendingChoices: [],
      ended: false
    });
    expect(switched.story.text?.current?.text).toBe("Before.");
    expect(switched.story.presentationWait).toBeUndefined();
    expect(switched.story.runtimeWait).toBeUndefined();
    expect(switched.play).toEqual(requested.session.play);
  });

  it("resolves choices without advancing and reports invalid decisions", () => {
    const boot = createVnSession({ scriptPath: "session-resolve-choice.nani", sourceText, startLabel: "Start" });
    const first = advanceVnSession(boot.session, "start");
    const withChoices = advanceVnSession(first.session, "manual");
    const resolved = resolveVnSessionChoice(withChoices.session, 1);
    const invalid = resolveVnSessionChoice(withChoices.session, 9);

    expect(resolved.session.story.pendingChoices).toEqual([]);
    expect(resolved.session.story.instructionPointer).toBe(resolved.session.script.labels.Right);
    expect(resolved.session.story.variables.route).toBeUndefined();
    expect(invalid.session.story).toBe(withChoices.session.story);
    expect(invalid.storyStep.diagnostics).toEqual([
      { code: "invalid-choice", message: "Choice index 9 is not available." }
    ]);
  });

  it("toggles AUTO and SKIP in session state without timers", () => {
    const boot = createVnSession({ scriptPath: "session-play.nani", sourceText, startLabel: "Start" });
    expect(toggleVnSessionAuto(boot.session).play.mode).toBe("auto");
    expect(toggleVnSessionSkip(boot.session).play.mode).toBe("skip");
  });

  it("completes runtime waits and input waits without owning browser timers", () => {
    const boot = createVnSession({
      scriptPath: "session-wait.nani",
      sourceText: `#Start
@movie video/session-intro block!
Narrator: After movie.
@input codename type:string summary:"Codename" value:Felix
Narrator: After input.
@end`,
      startLabel: "Start"
    });
    const waiting = advanceVnSession(boot.session, "start");
    const completedWait = completeVnSessionRuntimeWait(waiting.session, "movie");
    const afterMovie = advanceVnSession(completedWait.session, "manual");
    const inputWaiting = advanceVnSession(afterMovie.session, "manual");
    const submitted = submitVnSessionInput(inputWaiting.session, "Mira");

    expect(waiting.session.story.runtimeWait).toMatchObject({ kind: "movie", moviePath: "video/session-intro" });
    expect(completedWait.session.story.runtimeWait).toBeUndefined();
    expect(afterMovie.session.story.backlog.at(-1)?.text).toBe("After movie.");
    expect(inputWaiting.session.story.runtimeWait).toMatchObject({ kind: "input", variableName: "codename" });
    expect(submitted.session.story.variables.codename).toBe("Mira");
    expect(submitted.session.story.backlog.at(-1)?.text).toBe("After input.");
  });

  it("resolves input without advancing and preserves invalid input waits", () => {
    const boot = createVnSession({
      scriptPath: "session-resolve-input.nani",
      sourceText: `#Start
@input score type:number summary:"Score"
@set accepted:true
Narrator: Accepted.`,
      startLabel: "Start"
    });
    const waiting = advanceVnSession(boot.session, "start");
    const resolved = resolveVnSessionInput(waiting.session, "42");
    const invalid = resolveVnSessionInput(waiting.session, "not-a-number");

    expect(resolved.session.story.variables.score).toBe(42);
    expect(resolved.session.story.variables.accepted).toBeUndefined();
    expect(resolved.session.story.instructionPointer).toBe(1);
    expect(resolved.session.story.runtimeWait).toBeUndefined();
    expect(invalid.session.story).toBe(waiting.session.story);
    expect(invalid.session.story.runtimeWait).toEqual(waiting.session.story.runtimeWait);
    expect(invalid.storyStep.diagnostics).toEqual([
      { code: "input-validation", message: "Input value not-a-number is not a valid number.", severity: "warning" }
    ]);
  });

  it("completes presentation waits without storing renderer task state", () => {
    const boot = createVnSession({
      scriptPath: "session-presentation-wait.nani",
      sourceText: `#Start
@char Ema time:0.25 wait!
Narrator: After presentation.
@end`,
      startLabel: "Start"
    });
    const waiting = advanceVnSession(boot.session, "start");
    const completed = completeVnSessionPresentationWait(waiting.session);
    const afterPresentation = advanceVnSession(completed.session, "manual");

    expect(waiting.session.story.presentationWait).toMatchObject({ channel: "pixi", commandId: "char", durationMs: 250 });
    expect(completed.session.story.presentationWait).toBeUndefined();
    expect(afterPresentation.session.story.backlog.at(-1)?.text).toBe("After presentation.");
  });
});
