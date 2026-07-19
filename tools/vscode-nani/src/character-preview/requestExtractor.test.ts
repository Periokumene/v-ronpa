import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { parseScenario } from "@v-ronpa/nani-parser";
import { describe, expect, it } from "vitest";
import { extractCharacterPreviewTarget } from "./requestExtractor";

describe("character preview request extraction", () => {
  it.each([
    ["@char alice", "alice", ""],
    ["@char alice.EYE1,MOUTH3", "alice", "EYE1,MOUTH3"],
    ["@char id:alice", "alice", ""],
    ["@char idAndAppearance:alice.EYE2,ArmR1", "alice", "EYE2,ArmR1"],
    ["@char ema.Happy id:alice", "alice", "Happy"],
    ["@char alice,EYE1", "alice", ""],
    ["@char alice.EYE1 pos:bad-value time:nope", "alice", "EYE1"],
    ['@char alice.EYE1 time:"unterminated', "alice", "EYE1"]
  ])("extracts %s", (source, characterId, appearanceExpression) => {
    expect(request(source)).toMatchObject({
      kind: "request",
      request: { characterId, appearanceExpression }
    });
  });

  it("uses exact UTF-16 source ranges for the effective identity value", () => {
    const source = "@char idAndAppearance:角色.EYE1 pos:😀";
    const result = request(source);
    expect(result).toMatchObject({ kind: "request" });
    if (result?.kind !== "request") throw new Error("Expected a preview request.");
    expect(source.slice(result.request.identityRange.start.character, result.request.identityRange.end.character))
      .toBe("角色.EYE1");
  });

  it("targets the id value when id is the only identity source", () => {
    const source = "@char id:alice wait!";
    const result = request(source);
    if (result?.kind !== "request") throw new Error("Expected a preview request.");
    expect(source.slice(result.request.identityRange.start.character, result.request.identityRange.end.character))
      .toBe("alice");
  });

  it.each([
    ["@char *", "通配"],
    ["@char {actor}", "动态"],
    ["@char alice.EYE1 id:{actor}", "动态角色 ID"]
  ])("rejects non-static identity in %s", (source, message) => {
    expect(request(source)).toMatchObject({ kind: "unavailable", message: expect.stringContaining(message) });
  });

  it("returns no target for a non-char command or a char command without identity", () => {
    expect(request("@bgm main")).toBeUndefined();
    expect(request("@char wait!")).toBeUndefined();
  });

  it.each([
    "@char alice",
    "@char alice.EYE1,MOUTH3",
    "@char id:alice",
    "@char idAndAppearance:alice.EYE2,ArmR1",
    "@char ema.Happy id:alice",
    "@char alice,EYE1"
  ])("matches compiler target and appearance semantics for %s", (source) => {
    const target = request(source);
    expect(target?.kind).toBe("request");
    if (target?.kind !== "request") return;
    const compiled = compileRuntimeScript(parseScenario({ sourceText: source, scriptPath: "parity.nani" }));
    expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(compiled.script.commands[0]?.params).toMatchObject({
      target: target.request.characterId,
      appearanceExpression: target.request.appearanceExpression
    });
  });
});

function request(source: string) {
  return extractCharacterPreviewTarget(source, {
    documentUri: "file:///story.nani",
    documentVersion: 1,
    line: 0,
    scriptPath: "story.nani"
  });
}
