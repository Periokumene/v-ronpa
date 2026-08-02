import { describe, expect, it } from "vitest";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { naniCommandCatalog } from "@v-ronpa/contracts";
import {
  allowedValueCompletionFacts,
  commandCompletionFacts,
  paramCompletionFacts,
  primaryDocumentationFact,
  primaryValueCompletionFacts
} from "./languageFacts";

describe("language facts", () => {
  it("derives command completions from the shared catalog", () => {
    const labels = commandCompletionFacts().map((fact) => fact.label);

    expect(labels).toContain("bgm");
    expect(labels).not.toContain("addChoice");
    expect(labels).toContain("gameplay-event");
    expect(labels).not.toContain("voice");
  });

  it("emits every implemented canonical command and alias exactly once", () => {
    const expected = naniCommandCatalog
      .filter((definition) => definition.status === "implemented")
      .flatMap((definition) => [definition.canonicalName, ...(definition.aliases ?? [])])
      .sort();
    const actual = commandCompletionFacts().map((fact) => fact.label).sort();

    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it("derives every parameter suggestion from consumed catalog metadata", () => {
    for (const definition of naniCommandCatalog.filter((candidate) => candidate.status === "implemented")) {
      const expected = definition.params
        .filter((param) => param.docs?.runtimeSupport !== "declared-not-consumed")
        .flatMap((param) => [
          `${param.name}:`,
          ...(param.type.toLowerCase().includes("boolean") ? [`${param.name}!`, `!${param.name}`] : [])
        ]);
      const actual = paramCompletionFacts(definition.id).map((fact) => fact.label);
      expect(actual, definition.canonicalName).toEqual(expected);
      expect(new Set(actual).size, definition.canonicalName).toBe(actual.length);
    }
  });

  it("covers Cue and HideCue from the canonical command catalog", () => {
    expect(commandCompletionFacts().map((fact) => fact.label)).toEqual(
      expect.arrayContaining(["cue", "hideCue"])
    );
    expect(paramCompletionFacts("cue").map((fact) => fact.label)).toEqual(expect.arrayContaining([
      "text:", "author:", "speed:", "textId:", "autoNext:", "autoNext!", "!autoNext"
    ]));
    expect(paramCompletionFacts("hideCue").map((fact) => fact.label)).toEqual(expect.arrayContaining([
      "time:", "wait:", "wait!", "!wait"
    ]));
    expect(primaryDocumentationFact("cue")?.documentation).toContain("Required.");
  });

  it("derives params and boolean flag variants from command specs", () => {
    const facts = paramCompletionFacts("bgm");
    const labels = facts.map((fact) => fact.label);

    expect(labels).toContain("volume:");
    expect(labels).not.toContain("loop:");
    expect(labels).not.toContain("loop!");
    expect(labels).not.toContain("wait!");
    expect(labels).not.toContain("!wait");
  });

  it("does not suggest params that are already present", () => {
    const labels = paramCompletionFacts("bgm", new Set(["wait"])).map((fact) => fact.label);

    expect(labels).not.toContain("wait:");
    expect(labels).not.toContain("wait!");
    expect(labels).not.toContain("!wait");
  });

  it("derives UI wait params and allowed target values from command specs", () => {
    for (const commandId of ["showui", "hideui"]) {
      const params = paramCompletionFacts(commandId);
      const labels = params.map((fact) => fact.label);
      const wait = params.find((fact) => fact.label === "wait:");

      expect(labels).toEqual(expect.arrayContaining(["wait:", "wait!", "!wait"]));
      expect(wait?.documentation).toContain("Runtime support: consumed");
      expect(allowedValueCompletionFacts(commandId, "target").map((fact) => fact.label)).toEqual([
        "dialog",
        "commandBar",
        "toastLayer"
      ]);
    }
  });

  it("includes Chinese command and parameter docs with range and runtime support notes", () => {
    const bgm = commandCompletionFacts().find((fact) => fact.label === "bgm");
    const volume = paramCompletionFacts("bgm").find((fact) => fact.label === "volume:");
    const intro = paramCompletionFacts("bgm").find((fact) => fact.label === "intro:");

    expect(bgm?.documentation).toContain("播放循环背景音乐");
    expect(volume?.documentation).toContain("播放音量倍率");
    expect(volume?.documentation).toContain("Recommended: 0..1");
    expect(intro).toBeUndefined();
  });

  it("bundles the current compiler default for omitted char transition time", () => {
    const parsed = parseScenario({ sourceText: "@char alice.Default", scriptPath: "char-default.nani" });
    const compiled = compileRuntimeScript(parsed);

    expect(compiled.script.commands[0]?.params).toMatchObject({
      target: "alice",
      appearanceExpression: "Default",
      durationMs: 120
    });
  });

  it("derives character tone command facts entirely from the shared catalog", () => {
    const command = commandCompletionFacts().find((fact) => fact.label === "charTone");
    const params = paramCompletionFacts("chartone");

    expect(command?.documentation).toContain("@charTone rain");
    expect(params.map((fact) => fact.label)).toEqual(
      expect.arrayContaining(["preset:", "amount:", "time:", "wait:", "wait!", "!wait"])
    );
    expect(params.map((fact) => fact.label)).not.toContain("easing:");
    expect(primaryValueCompletionFacts("chartone").map((fact) => fact.label)).toEqual([
      "rain",
      "fog",
      "sunset",
      "night",
      "alert",
      "fluorescent",
      "none"
    ]);
    expect(primaryDocumentationFact("chartone")?.documentation).toContain(
      "Allowed: rain, fog, sunset, night, alert, fluorescent, none"
    );
    expect(allowedValueCompletionFacts("chartone", "preset").map((fact) => fact.label)).toEqual([
      "rain",
      "fog",
      "sunset",
      "night",
      "alert",
      "fluorescent",
      "none"
    ]);
  });
});
