import { describe, expect, it } from "vitest";
import { getNaniCompletions } from "./completionProvider";
import type { NaniProjectAssetIndex } from "./projectAssets";

const projectAssets: NaniProjectAssetIndex = {
  assets: [
    { id: "char/alice", mimeType: "application/json", uri: "assets/char/alice/character.json", sourcePath: "/assets/char/alice/character.json" },
    { id: "home", mimeType: "image/png", uri: "assets/home.png", sourcePath: "/assets/home.png" },
    { id: "bg/hall", mimeType: "image/png", uri: "assets/bg/hall.png", sourcePath: "/assets/bg/hall.png" },
    { id: "bg/rain", mimeType: "audio/ogg", uri: "assets/bg/rain.ogg", sourcePath: "/assets/bg/rain.ogg" },
    { id: "bgm/main", mimeType: "audio/ogg", uri: "assets/bgm/main.ogg", sourcePath: "/assets/bgm/main.ogg" },
    { id: "custom/deep/card", mimeType: "image/webp", uri: "assets/custom/deep/card.webp", sourcePath: "/assets/custom/deep/card.webp" },
    { id: "sfx/door", mimeType: "audio/ogg", uri: "assets/sfx/door.ogg", sourcePath: "/assets/sfx/door.ogg" },
    { id: "sfx/icon", mimeType: "image/avif", uri: "assets/sfx/icon.avif", sourcePath: "/assets/sfx/icon.avif" },
    { id: "texture/gpu", mimeType: "image/ktx2", uri: "assets/texture/gpu.ktx2", sourcePath: "/assets/texture/gpu.ktx2" },
    { id: "ui/dialog-frame", mimeType: "image/png", uri: "assets/ui/dialog-frame.png", sourcePath: "/assets/ui/dialog-frame.png" },
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

  it("offers every image regardless of folder and only applies user-entered prefix filtering", () => {
    const source = "@back ";
    const completions = getNaniCompletions(source, { line: 0, character: source.length }, projectAssets);
    const resources = completions.filter((completion) => completion.kind === "resource");

    expect(resources.map((completion) => completion.label)).toEqual([
      "home",
      "bg/hall",
      "custom/deep/card",
      "sfx/icon",
      "texture/gpu",
      "ui/dialog-frame"
    ]);
    expect(resources.map((completion) => completion.label)).not.toContain("bg/rain");
    expect(resources.every((completion) => completion.deferredDocumentation?.kind === "asset-image")).toBe(true);

    const prefixed = "@back ui/";
    expect(getNaniCompletions(prefixed, { line: 0, character: prefixed.length }, projectAssets)
      .map((completion) => completion.label)).toEqual(["ui/dialog-frame"]);
  });

  it("keeps parameters ahead of resources at an empty resource slot", () => {
    const source = "@back ";
    const completions = getNaniCompletions(source, { line: 0, character: source.length }, projectAssets);
    const displayed = [...completions].sort((left, right) =>
      (left.sortText ?? left.label).localeCompare(right.sortText ?? right.label)
    );
    const lastParam = displayed.reduce(
      (last, completion, index) => completion.kind === "param" ? index : last,
      -1
    );
    const firstResource = displayed.findIndex((completion) => completion.kind === "resource");
    const returnedFirstResource = completions.findIndex((completion) => completion.kind === "resource");

    expect(lastParam).toBeGreaterThanOrEqual(0);
    expect(firstResource).toBeGreaterThan(lastParam);
    expect(completions.slice(0, returnedFirstResource).every((completion) => completion.kind !== "resource")).toBe(true);
    expect(displayed.filter((completion) => completion.kind === "param").every((completion) =>
      completion.sortText?.startsWith("00-param-")
    )).toBe(true);
    expect(displayed.filter((completion) => completion.kind === "resource").every((completion) =>
      completion.sortText?.startsWith("20-resource-")
    )).toBe(true);
  });

  it("marks every scanner image MIME for deferred preview without marking non-images", () => {
    const imageSource = "@back ";
    const images = getNaniCompletions(imageSource, { line: 0, character: imageSource.length }, projectAssets)
      .filter((completion) => completion.kind === "resource");
    expect(images.map((completion) => completion.deferredDocumentation)).toEqual([
      { kind: "asset-image", assetId: "home" },
      { kind: "asset-image", assetId: "bg/hall" },
      { kind: "asset-image", assetId: "custom/deep/card" },
      { kind: "asset-image", assetId: "sfx/icon" },
      { kind: "asset-image", assetId: "texture/gpu" },
      { kind: "asset-image", assetId: "ui/dialog-frame" }
    ]);

    const audioSource = "@bgm ";
    const audio = getNaniCompletions(audioSource, { line: 0, character: audioSource.length }, projectAssets)
      .filter((completion) => completion.kind === "resource");
    expect(audio.every((completion) => completion.deferredDocumentation === undefined)).toBe(true);
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
