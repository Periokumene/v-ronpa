import { describe, expect, it } from "vitest";
import { getNaniCompletions } from "./completionProvider";
import type { NaniProjectAssetIndex } from "./projectAssets";

const projectAssets: NaniProjectAssetIndex = {
  assets: [
    { id: "char/alice", mimeType: "application/json", uri: "assets/char/alice/character.json", sourcePath: "/assets/char/alice/character.json" },
    { id: "bg/hall", mimeType: "image/png", uri: "assets/bg/hall.png", sourcePath: "/assets/bg/hall.png" },
    { id: "bgm/main", mimeType: "audio/ogg", uri: "assets/bgm/main.ogg", sourcePath: "/assets/bgm/main.ogg" },
    { id: "sfx/door", mimeType: "audio/ogg", uri: "assets/sfx/door.ogg", sourcePath: "/assets/sfx/door.ogg" },
    { id: "video/intro", mimeType: "video/mp4", uri: "assets/video/intro.mp4", sourcePath: "/assets/video/intro.mp4" }
  ],
  characters: [{ characterId: "alice", assetId: "char/alice" }],
  characterTokens: {
    alice: ["Default", "EYE0", "EYE1", "MOUTH0"]
  }
};

describe("project resource completions", () => {
  it("combines MIME-capable assets and runtime-consumed params at an empty primary", () => {
    const source = "@bgm ";
    const completions = getNaniCompletions(source, { line: 0, character: source.length }, projectAssets);
    const labels = completions.map((completion) => completion.label);

    expect(labels).toContain("bgm/main");
    expect(labels).toContain("volume:");
    expect(labels).toContain("sfx/door");
    expect(labels).not.toContain("loop!");
  });

  it("completes slash-form primary IDs and named path params", () => {
    const primary = "@sfx sfx/d";
    expect(getNaniCompletions(primary, { line: 0, character: primary.length }, projectAssets).map(item => item.label)).toEqual([
      "sfx/door"
    ]);

    const named = "@movie moviePath:video/i";
    const completion = getNaniCompletions(named, { line: 0, character: named.length }, projectAssets)[0];
    expect(completion).toMatchObject({
      label: "video/intro",
      insertText: "video/intro",
      range: {
        start: { line: 0, character: "@movie moviePath:".length },
        end: { line: 0, character: named.length }
      }
    });
  });

  it("completes a primary resource after already-entered named params", () => {
    const source = "@bgm group:music bgm/m";
    const completions = getNaniCompletions(source, { line: 0, character: source.length }, projectAssets);

    expect(completions.map((completion) => completion.label)).toEqual(["bgm/main"]);
    expect(completions[0]?.range).toEqual({
      start: { line: 0, character: "@bgm group:music ".length },
      end: { line: 0, character: source.length }
    });
  });

  it("completes catalog-declared stop selectors without treating groups as assets", () => {
    const primary = "@stopBgm bgm/m";
    const named = "@stopSfx group:rain sfxPath:sfx/d";

    expect(getNaniCompletions(primary, { line: 0, character: primary.length }, projectAssets)[0])
      .toMatchObject({ label: "bgm/main", detail: "audio/ogg · App asset · selector" });
    expect(getNaniCompletions(named, { line: 0, character: named.length }, projectAssets)[0])
      .toMatchObject({ label: "sfx/door", detail: "audio/ogg · App asset · selector" });
  });

  it("does not suggest PinP assets or layout parameters in the hide form", () => {
    const hide = "@pinp visible:false ";
    const hiddenLabels = getNaniCompletions(hide, { line: 0, character: hide.length }, projectAssets)
      .map((completion) => completion.label);
    expect(hiddenLabels).not.toEqual(expect.arrayContaining([
      "bg/hall", "assetId:", "pos:", "height:", "ratio:", "alt:"
    ]));
    expect(hiddenLabels).toEqual(expect.arrayContaining(["effect:", "time:"]));

    const none = "@pinp visible:false effect:none ";
    expect(getNaniCompletions(none, { line: 0, character: none.length }, projectAssets)
      .map((completion) => completion.label)).not.toContain("time:");
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
