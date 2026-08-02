import { describe, expect, it } from "vitest";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import {
  harnessScriptSourcesByPath,
  harnessVnEntryLocator
} from "../harness/generatedNaniProduction";
import {
  createInitialHarnessShowcaseTrialRuntime,
  harnessShowcasePosePresets
} from "./useHarnessShowcaseRuntimeAdapter";

const harnessShowcaseScript = harnessScriptSourcesByPath[harnessVnEntryLocator.initialScriptPath]!.sourceText;

describe("harness showcase runtime adapter glue", () => {
  it("keeps the harness-showcase script as a Pixi, media, and rich text command showcase", () => {
    const parsed = parseScenario({ sourceText: harnessShowcaseScript, scriptPath: "harness/harness-showcase.nani" });
    const compiled = compileRuntimeScript(parsed);

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.scenario.assets).toEqual(
      expect.arrayContaining([
        { id: "bg:classroom", kind: "background" },
        { id: "bg:inner-academy-hall", kind: "background" },
        { id: "bg:inner-snow-outskirts", kind: "background" }
      ])
    );
    expect(compiled.diagnostics).toEqual([]);
    const commandIds = new Set(compiled.script.commands.map((command) => command.commandId));
    for (const commandId of [
      "back",
      "inback",
      "char",
      "chartone",
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
      "sfxfast",
      "stopbgm",
      "stopsfx",
      "movie"
    ]) {
      expect(commandIds.has(commandId)).toBe(true);
    }
    const characterToneCommands = compiled.script.commands.filter((command) => command.commandId === "chartone");
    expect(new Set(characterToneCommands.map((command) => command.params.preset).filter(Boolean))).toEqual(
      new Set(["rain", "fog", "sunset", "night", "alert", "fluorescent", "none"])
    );
    expect(characterToneCommands.map((command) => command.params.amount)).toEqual(
      expect.arrayContaining([0.5, 1, 1.25, 1.5, 2, 3, 0])
    );
    expect(characterToneCommands.some((command) => command.params.preset === undefined && command.params.amount === 0.5)).toBe(true);
    expect(harnessShowcaseScript.indexOf("@charTone rain amount:0.5")).toBeLessThan(
      harnessShowcaseScript.indexOf("@char Ema pos:50", harnessShowcaseScript.indexOf("#CharacterToneShowcase"))
    );
    expect(harnessShowcaseScript).toContain("CHECKPOINT TONE SAVE");
    expect(harnessShowcaseScript).toContain("@charTone none time:0.2 wait!");
    expect(
      compiled.script.commands
        .filter((command) => ["bgm", "sfx", "sfxfast", "stopbgm", "stopsfx"].includes(command.commandId))
        .map((command) => ({ commandId: command.commandId, params: command.params }))
    ).toEqual(
      expect.arrayContaining([
        {
          commandId: "bgm",
          params: expect.objectContaining({
            bgmPath: "bgm:validation-main",
            group: "music",
            volume: 0.45,
            fadeMs: 200
          })
        },
        {
          commandId: "sfx",
          params: expect.objectContaining({
            sfxPath: "sfx:rain-inside-car-loop",
            group: "rain",
            loop: true,
            volume: 0.35,
            fadeMs: 200
          })
        },
        {
          commandId: "sfx",
          params: expect.objectContaining({
            sfxPath: "sfx:knock-door",
            volume: 0.9,
            fadeMs: 100
          })
        },
        {
          commandId: "bgm",
          params: expect.objectContaining({
            bgmPath: "",
            group: "music",
            volume: 0.3,
            durationMs: 400
          })
        },
        {
          commandId: "sfx",
          params: expect.objectContaining({
            sfxPath: "",
            group: "rain",
            volume: 0.15,
            durationMs: 400
          })
        },
        {
          commandId: "bgm",
          params: expect.objectContaining({
            bgmPath: "bgm:validation-main",
            group: "music",
            volume: 0.38,
            durationMs: 250
          })
        },
        {
          commandId: "sfx",
          params: expect.objectContaining({
            sfxPath: "sfx:rain-inside-car-loop",
            group: "rain",
            loop: true,
            volume: 0.25,
            durationMs: 250
          })
        },
        {
          commandId: "bgm",
          params: expect.objectContaining({
            bgmPath: "bgm:validation-alt",
            group: "music",
            volume: 0.45,
            fadeMs: 500
          })
        },
        {
          commandId: "bgm",
          params: expect.objectContaining({
            bgmPath: "bgm:validation-layer",
            group: "ambient",
            volume: 0.25,
            fadeMs: 100
          })
        }
      ])
    );
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
    const compiled = compileRuntimeScript(parsed);
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

    const fontFaceComparison = richCommands.find((command) => String(command.params.text ?? "").includes("CHECKPOINT RICH 05"));
    const comparisonSample = "AaGgQq Font ID 123";
    const fontFaceRun = fontFaceComparison?.richText?.runs.find((run) => run.style.fontId === "font:serif");

    expect(fontFaceComparison?.params.text).toContain(
      `默认 ${comparisonSample} / serif ${comparisonSample}`
    );
    expect(fontFaceRun).toBeDefined();
    expect(fontFaceComparison?.richText?.text.slice(fontFaceRun?.start, fontFaceRun?.end)).toBe(comparisonSample);
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
