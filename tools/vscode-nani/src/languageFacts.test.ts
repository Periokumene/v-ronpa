import { describe, expect, it } from "vitest";
import { commandCompletionFacts, paramCompletionFacts } from "./languageFacts";

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
});
