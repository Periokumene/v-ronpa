import { describe, expect, it } from "vitest";
import { getNaniCompletions } from "./completionProvider";
import type { NaniProjectAssetIndex } from "./projectAssets";

const projectAssets: NaniProjectAssetIndex = {
  assets: [
    { id: "alice", kind: "character-pack", optimizedUri: "/game/characters/alice/character.json" },
    { id: "bg:hall", kind: "background", optimizedUri: "/game/backgrounds/hall.png" },
    { id: "bgm:main", kind: "bgm", optimizedUri: "/game/media/bgm/main.ogg" },
    { id: "sfx:door", kind: "sfx", optimizedUri: "/game/media/sfx/door.ogg" },
    { id: "video:intro", kind: "video", optimizedUri: "/game/media/video/intro.mp4" }
  ],
  characterTokens: {
    alice: ["Default", "EYE0", "EYE1", "MOUTH0"]
  }
};

describe("project resource completions", () => {
  it("combines primary assets and runtime-consumed params at an empty primary", () => {
    const source = "@bgm ";
    const completions = getNaniCompletions(source, { line: 0, character: source.length }, projectAssets);
    const labels = completions.map((completion) => completion.label);

    expect(labels).toContain("bgm:main");
    expect(labels).toContain("volume:");
    expect(labels).not.toContain("sfx:door");
    expect(labels).not.toContain("loop!");
  });

  it("completes colon-form primary IDs and named path params", () => {
    const primary = "@sfx sfx:d";
    expect(getNaniCompletions(primary, { line: 0, character: primary.length }, projectAssets).map(item => item.label)).toEqual([
      "sfx:door"
    ]);

    const named = "@movie moviePath:video:i";
    const completion = getNaniCompletions(named, { line: 0, character: named.length }, projectAssets)[0];
    expect(completion).toMatchObject({
      label: "video:intro",
      insertText: "video:intro",
      range: {
        start: { line: 0, character: "@movie moviePath:".length },
        end: { line: 0, character: named.length }
      }
    });
  });

  it("completes a primary resource after already-entered named params", () => {
    const source = "@bgm group:music bgm:m";
    const completions = getNaniCompletions(source, { line: 0, character: source.length }, projectAssets);

    expect(completions.map((completion) => completion.label)).toEqual(["bgm:main"]);
    expect(completions[0]?.range).toEqual({
      start: { line: 0, character: "@bgm group:music ".length },
      end: { line: 0, character: source.length }
    });
  });

  it("completes character IDs and comma-separated composition tokens", () => {
    const character = "@char al";
    expect(getNaniCompletions(character, { line: 0, character: character.length }, projectAssets)[0]).toMatchObject({
      label: "alice",
      range: {
        start: { line: 0, character: "@char ".length },
        end: { line: 0, character: character.length }
      }
    });

    const tokenSource = "@char alice.Default,E";
    const completions = getNaniCompletions(tokenSource, { line: 0, character: tokenSource.length }, projectAssets);
    expect(completions.map((completion) => completion.label)).toEqual(["EYE0", "EYE1"]);
    expect(completions[0]?.range).toEqual({
      start: { line: 0, character: "@char alice.Default,".length },
      end: { line: 0, character: tokenSource.length }
    });
    expect(completions[0]?.deferredDocumentation).toEqual({
      kind: "character-appearance-token",
      characterId: "alice",
      baseAppearanceExpression: "Default",
      candidateToken: "EYE0"
    });
  });

  it("does not invent resource diagnostics or completions without a matching slot", () => {
    const source = "@flash color:#fff ";
    const completions = getNaniCompletions(source, { line: 0, character: source.length }, projectAssets);
    expect(completions.some((completion) => completion.kind === "resource")).toBe(false);
  });

  it("keeps deferred character previews scoped to @char rather than @slide", () => {
    const source = "@slide alice.Default,E";
    const completions = getNaniCompletions(source, { line: 0, character: source.length }, projectAssets);

    expect(completions.map((completion) => completion.label)).toEqual(["EYE0", "EYE1"]);
    expect(completions.every((completion) => completion.deferredDocumentation === undefined)).toBe(true);
  });
});
