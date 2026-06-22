import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, NaniCommandSource, NaniCommandStatus, RuntimeCommand, RuntimeScript } from "@v-ronpa/contracts";
import {
  advanceStoryPlay,
  autoDelayForVisibleChars,
  chooseStoryPlayOption,
  createInitialStoryPlayState,
  defaultStoryPlayTimingPolicy,
  selectStoryPlaySchedule,
  stopStoryPlayAutomation,
  toggleAutoStoryPlay,
  toggleSkipStoryPlay
} from "./index";
import { createInitialStoryState } from "@v-ronpa/story-engine";

describe("story play", () => {
  it("toggles AUTO and SKIP as mutually exclusive transient modes", () => {
    let play = createInitialStoryPlayState();

    play = toggleAutoStoryPlay(play);
    expect(play.mode).toBe("auto");
    expect(play.lastStopReason).toBeUndefined();

    play = toggleSkipStoryPlay(play);
    expect(play.mode).toBe("skip");
    expect(play.lastStopReason).toBeUndefined();

    play = toggleSkipStoryPlay(play);
    expect(play).toMatchObject({ mode: "manual", lastStopReason: "toggle-off" });
  });

  it("calculates AUTO delay from visible text length with clamp bounds", () => {
    expect(autoDelayForVisibleChars(0)).toBe(defaultStoryPlayTimingPolicy.autoMinDelayMs);
    expect(autoDelayForVisibleChars(10)).toBe(1450);
    expect(autoDelayForVisibleChars(1000)).toBe(defaultStoryPlayTimingPolicy.autoMaxDelayMs);
  });

  it("treats print autoNext as a one-shot manual schedule without entering AUTO", () => {
    const script = runtimeScript("auto-next.nani", [
      runtimeCommand("print", "text", { speaker: "Felix", text: "Auto next.", autoNext: true }),
      runtimeCommand("print", "text", { speaker: "Mira", text: "Manual again.", autoNext: false })
    ]);
    const step = advanceStoryPlay(createInitialStoryPlayState(), {
      state: createInitialStoryState(script),
      script,
      source: "start"
    });

    expect(step.story.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["print"]);
    expect(step.play.mode).toBe("manual");
    expect(step.play.currentStop).toMatchObject({
      source: "start",
      autoNext: true,
      visibleCharCount: 9
    });
    expect(selectStoryPlaySchedule(step.play, step.story.state)).toEqual({
      type: "wait",
      source: "auto-next",
      delayMs: 1395
    });
  });

  it("stops AUTO/SKIP when manual advance takes over while preserving the story step result", () => {
    const script = runtimeScript("takeover.nani", [
      runtimeCommand("print", "text", { speaker: "Felix", text: "First.", autoNext: false }),
      runtimeCommand("print", "text", { speaker: "Mira", text: "Second.", autoNext: false })
    ]);
    const first = advanceStoryPlay(createInitialStoryPlayState(), {
      state: createInitialStoryState(script),
      script,
      source: "start"
    });
    const auto = toggleAutoStoryPlay(first.play);
    const second = advanceStoryPlay(auto, { state: first.story.state, script, source: "manual" });

    expect(second.play.mode).toBe("manual");
    expect(second.play.lastStopReason).toBe("manual-takeover");
    expect(second.story.state.backlog.at(-1)).toEqual({ speaker: "Mira", text: "Second." });
    expect(second.story.emittedRuntimeCommands).toEqual([
      expect.objectContaining({ commandId: "print", params: expect.objectContaining({ text: "Second." }) })
    ]);
  });

  it("keeps SKIP moving forward until choices, then returns to manual", () => {
    const script = runtimeScript(
      "skip-choice.nani",
      [
        runtimeCommand("print", "text", { speaker: "Felix", text: "First.", autoNext: false }),
        runtimeCommand("print", "text", { speaker: "Mira", text: "Second.", autoNext: false }),
        runtimeCommand("choice", "choice", { text: "A", goto: "#A" }, { source: "naninovel" }),
        runtimeCommand("choice", "choice", { text: "B", goto: "#B" }, { source: "naninovel" })
      ],
      { Start: 0, A: 4, B: 4 }
    );
    const first = advanceStoryPlay(createInitialStoryPlayState(), {
      state: createInitialStoryState(script),
      script,
      source: "start"
    });
    let play = toggleSkipStoryPlay(first.play);
    expect(selectStoryPlaySchedule(play, first.story.state)).toEqual({ type: "wait", source: "skip", delayMs: 80 });

    const second = advanceStoryPlay(play, { state: first.story.state, script, source: "skip" });
    expect(second.intent.pacing).toBe("skip");
    expect(second.play.mode).toBe("skip");

    const choices = advanceStoryPlay(second.play, { state: second.story.state, script, source: "skip" });
    expect(choices.story.state.pendingChoices).toEqual([
      { text: "A", goto: "#A" },
      { text: "B", goto: "#B" }
    ]);
    expect(choices.play).toMatchObject({ mode: "manual", lastStopReason: "choice" });
    expect(selectStoryPlaySchedule(choices.play, choices.story.state)).toEqual({ type: "idle" });
  });

  it("does not schedule AUTO when the host reports blocked or not ready", () => {
    const play = toggleAutoStoryPlay({
      ...createInitialStoryPlayState(),
      currentStop: {
        source: "start",
        autoNext: false,
        visibleCharCount: 20,
        hasChoices: false,
        ended: false
      }
    });
    const script = runtimeScript("blocked.nani", [
      runtimeCommand("print", "text", { speaker: "Felix", text: "Blocked.", autoNext: false })
    ]);
    const story = createInitialStoryState(script);

    expect(selectStoryPlaySchedule(play, story, { hostReadyForAuto: false })).toEqual({ type: "idle" });
    expect(selectStoryPlaySchedule(play, story, { hostBlocked: true })).toEqual({ type: "idle" });
  });

  it("chooses through StoryEngine and returns the combined existing story result shape", () => {
    const script = runtimeScript(
      "choice.nani",
      [
        runtimeCommand("choice", "choice", { text: "Go", goto: "#Go" }, { source: "naninovel" }),
        runtimeCommand("print", "text", { speaker: "Mira", text: "Skipped.", autoNext: false }),
        runtimeCommand("print", "text", { speaker: "Felix", text: "Chosen.", autoNext: false })
      ],
      { Start: 0, Go: 2 }
    );
    const waiting = advanceStoryPlay(createInitialStoryPlayState(), {
      state: createInitialStoryState(script),
      script,
      source: "start"
    });
    const chosen = chooseStoryPlayOption(toggleAutoStoryPlay(waiting.play), {
      state: waiting.story.state,
      script,
      index: 0
    });

    expect(chosen.play.mode).toBe("manual");
    expect(chosen.play.lastStopReason).toBe("choice");
    expect(chosen.story).toEqual({
      state: expect.objectContaining({
        backlog: [{ speaker: "Felix", text: "Chosen." }],
        pendingChoices: []
      }),
      diagnostics: [],
      emittedRuntimeCommands: [
        expect.objectContaining({ commandId: "print", params: expect.objectContaining({ text: "Chosen." }) })
      ]
    });
  });

  it("records explicit automation stop reasons without touching story state", () => {
    const stopped = stopStoryPlayAutomation(
      toggleAutoStoryPlay({
        ...createInitialStoryPlayState(),
        currentStop: {
          source: "start",
          autoNext: true,
          visibleCharCount: 10,
          hasChoices: false,
          ended: false
        }
      }),
      "overlay"
    );

    expect(stopped).toMatchObject({
      mode: "manual",
      lastStopReason: "overlay",
      currentStop: {
        autoNext: false
      }
    });
    expect(selectStoryPlaySchedule(stopped, createInitialStoryState(runtimeScript("stopped.nani", [])))).toEqual({
      type: "idle"
    });
  });
});

function runtimeScript(scriptPath: string, commands: RuntimeCommand[], labels: Record<string, number> = { Start: 0 }): RuntimeScript {
  return { scriptPath, commands, labels, assets: [], dependencies: [] };
}

function runtimeCommand(
  commandId: string,
  category: NaniCommandCategory,
  params: RuntimeCommand["params"] = {},
  options: Partial<Pick<RuntimeCommand, "source" | "status" | "canonicalName">> = {}
): RuntimeCommand {
  const source: NaniCommandSource = options.source ?? "v-ronpa";
  const status: NaniCommandStatus = options.status ?? "implemented";
  return {
    commandId,
    canonicalName: options.canonicalName ?? commandId,
    category,
    source,
    status,
    params,
    loc: { scriptPath: "story-play-test.nani", line: 1, column: 1, raw: commandId }
  };
}
