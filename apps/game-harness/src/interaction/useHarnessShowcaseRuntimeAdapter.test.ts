import { describe, expect, it } from "vitest";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { createInitialStoryState } from "@v-ronpa/story-engine";
import { harnessShowcaseScript } from "../harness/showcase";
import {
  createHarnessShowcaseInteractionContext,
  createInitialHarnessShowcaseTrialRuntime,
  harnessShowcasePosePresets,
  type TrialRuntime
} from "./useHarnessShowcaseRuntimeAdapter";

describe("harness showcase runtime adapter glue", () => {
  it("keeps the harness-showcase script as a Pixi, media, and rich text command showcase", () => {
    const parsed = parseScenario({ sourceText: harnessShowcaseScript, scriptPath: "harness/harness-showcase.nani" });
    const compiled = compileRuntimeScript(parsed.scenario);

    expect(parsed.diagnostics).toEqual([]);
    expect(compiled.diagnostics).toEqual([]);
    const commandIds = new Set(compiled.script.commands.map((command) => command.commandId));
    for (const commandId of [
      "back",
      "char",
      "arrange",
      "hidechars",
      "slide",
      "shake",
      "flash",
      "blur",
      "bokeh",
      "glitch",
      "rain",
      "snow",
      "sun",
      "bgm",
      "sfx",
      "movie"
    ]) {
      expect(commandIds.has(commandId)).toBe(true);
    }
    expect(
      compiled.script.commands
        .filter((command) => command.commandId === "print" && String(command.params.text ?? "").includes("CHECKPOINT BLEEP"))
        .map((command) => ({ speaker: command.params.speaker, text: command.params.text }))
    ).toEqual([
      { speaker: "Mira", text: expect.stringContaining("CHECKPOINT BLEEP DEFAULT") },
      { speaker: "Felix", text: expect.stringContaining("CHECKPOINT BLEEP OVERRIDE") },
      { speaker: "Narrator", text: expect.stringContaining("CHECKPOINT BLEEP NULL") }
    ]);
  });

  it("keeps the harness-showcase rich text coverage in app content", () => {
    for (const sample of [
      "<b>",
      "<strong>",
      "<i>",
      "<em>",
      "<u>",
      "<s>",
      "<strike>",
      "<del>",
      "<mark>",
      "<small>",
      "<big>",
      "<sub>",
      "<sup>",
      "<br>",
      "<font color='red'>",
      "<font color='#ff5577'>",
      "<font size='1'>",
      "<font size='7'>",
      "<font size='-1'>",
      "<font size='+1'>",
      "<font face='font:serif'>",
      "&nbsp;",
      "&lt;",
      "&gt;",
      "&amp;",
      "&quot;"
    ]) {
      expect(harnessShowcaseScript).toContain(sample);
    }

    const parsed = parseScenario({ sourceText: harnessShowcaseScript, scriptPath: "harness/harness-showcase.nani" });
    const compiled = compileRuntimeScript(parsed.scenario);
    const richCommands = compiled.script.commands.filter((command) => command.richText);
    const styles = richCommands.flatMap((command) => command.richText?.runs.map((run) => run.style) ?? []);

    expect(styles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bold: true }),
        expect.objectContaining({ italic: true }),
        expect.objectContaining({ underline: true }),
        expect.objectContaining({ strike: true }),
        expect.objectContaining({ markColor: "default" }),
        expect.objectContaining({ verticalAlign: "sub" }),
        expect.objectContaining({ verticalAlign: "sup" }),
        expect.objectContaining({ color: "red" }),
        expect.objectContaining({ color: "#ff5577" }),
        expect.objectContaining({ fontId: "font:serif" })
      ])
    );
  });

  it("extracts GameInteractionContext from harness Navi and Trial glue", () => {
    const runtimeScript = compileRuntimeScript(
      parseScenario({ sourceText: "Felix: Hello.\n- Choice A", scriptPath: "context-test.nani" }).scenario
    ).script;
    const storyRuntime = {
      active: true,
      state: {
        ...createInitialStoryState(runtimeScript),
        pendingChoices: [{ text: "Choice A", enabled: true }]
      }
    };
    const trialRuntime: TrialRuntime = {
      definition: {
        id: "trial:door-lock",
        title: "Door Lock Trial",
        initialSegmentId: "debate:door-lock",
        segments: []
      },
      active: true,
      state: {
        trialId: "trial:door-lock",
        currentSegmentId: "debate:door-lock",
        presentation: "debate3d",
        inputLock: "trial-targeting",
        keywordStates: {}
      },
      lastOutcome: "segment:debate:door-lock"
    };

    expect(
      createHarnessShowcaseInteractionContext({
        flowMode: "navi",
        navi: { substate: "vn2d-overlay", inputLock: "dialog" },
        storyRuntime
      })
    ).toEqual({
      mode: "navi",
      overlayStack: [],
      naviSubstate: "vn2d-overlay",
      inputLock: "dialog",
      hasActiveStory: true,
      storyHasChoices: true,
      storyEnded: false,
      isAtStableStop: true
    });

    expect(
      createHarnessShowcaseInteractionContext({
        flowMode: "trial",
        navi: { substate: "walk", inputLock: "none" },
        storyRuntime: { ...storyRuntime, active: false },
        trialRuntime
      })
    ).toEqual({
      mode: "trial",
      overlayStack: [],
      naviSubstate: "walk",
      trialPresentation: "debate3d",
      inputLock: "trial-targeting",
      hasActiveStory: false,
      storyHasChoices: false,
      storyEnded: false,
      isAtStableStop: false
    });
  });

  it("keeps harness-specific pose and Trial defaults in the adapter layer", () => {
    expect(harnessShowcasePosePresets.map((preset) => preset.id)).toEqual([
      "spawn",
      "notebook",
      "keycard",
      "door",
      "hall-door",
      "witness",
      "trial-stand",
      "empty"
    ]);
    expect(createInitialHarnessShowcaseTrialRuntime()).toMatchObject({
      active: false,
      definition: { id: "trial:door-lock" },
      lastOutcome: "none"
    });
  });
});

