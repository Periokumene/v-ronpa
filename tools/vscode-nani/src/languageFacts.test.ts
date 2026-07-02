import { describe, expect, it } from "vitest";
import { allowedValueCompletionFacts, commandCompletionFacts, paramCompletionFacts } from "./languageFacts";

describe("language facts", () => {
  it("derives command completions from the shared catalog", () => {
    const labels = commandCompletionFacts().map((fact) => fact.label);

    expect(labels).toContain("bgm");
    expect(labels).toContain("addChoice");
    expect(labels).toContain("gameplay-event");
  });

  it("derives params and boolean flag variants from command specs", () => {
    const facts = paramCompletionFacts("bgm");
    const labels = facts.map((fact) => fact.label);

    expect(labels).toContain("volume:");
    expect(labels).toContain("wait!");
    expect(labels).toContain("!wait");
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

    expect(bgm?.documentation).toContain("播放背景音乐");
    expect(volume?.documentation).toContain("播放音量倍率");
    expect(volume?.documentation).toContain("Recommended: 0..1");
    expect(intro?.documentation).toContain("declared-not-consumed");
    expect(intro?.documentation).toContain("暂未消费");
  });
});
