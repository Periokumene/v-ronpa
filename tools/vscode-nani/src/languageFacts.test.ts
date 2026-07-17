import { describe, expect, it } from "vitest";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { allowedValueCompletionFacts, commandCompletionFacts, paramCompletionFacts } from "./languageFacts";

describe("language facts", () => {
  it("derives command completions from the shared catalog", () => {
    const labels = commandCompletionFacts().map((fact) => fact.label);

    expect(labels).toContain("bgm");
    expect(labels).not.toContain("addChoice");
    expect(labels).toContain("gameplay-event");
    expect(labels).not.toContain("voice");
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
    const compiled = compileRuntimeScript(parsed.scenario);

    expect(compiled.script.commands[0]?.params).toMatchObject({
      target: "alice",
      appearanceExpression: "Default",
      durationMs: 120
    });
  });
});
