import { describe, expect, it } from "vitest";
import {
  collectNaniAssetReferences,
  computeNaniAssetDiagnostics,
  resolveNaniAssetReferenceAtOffset
} from "./resourceReferences";
import type { NaniProjectAssetIndex } from "./projectAssets";

const index: NaniProjectAssetIndex = {
  assets: [
    asset("bg/home", "image/png"),
    asset("bgm/main", "audio/ogg"),
    asset("char/alice", "application/json"),
    asset("misc/not-audio", "image/png"),
    asset("sfx/door", "audio/ogg")
  ],
  characters: [{ characterId: "Alice", assetId: "char/alice" }],
  characterTokens: {}
};

describe("Nani project asset references", () => {
  it("projects loading and selector slots from the shared catalog", () => {
    const source = [
      "@back bg/home",
      "@stopBgm bgm/main",
      "@stopSfx sfxPath:sfx/door",
      "@char Alice.Default"
    ].join("\n");
    const references = collectNaniAssetReferences(source, "story.nani");

    expect(references.map(({ commandId, usage, value }) => [commandId, usage, value])).toEqual([
      ["back", "load", "bg/home"],
      ["stopbgm", "selector", "bgm/main"],
      ["stopsfx", "selector", "sfx/door"],
      ["char", "load", "Alice"]
    ]);
    expect(references.map((reference) => source.slice(reference.span.start, reference.span.end))).toEqual([
      "bg/home",
      "bgm/main",
      "sfx/door",
      "Alice.Default"
    ]);
  });

  it("reports exact missing, mismatch, invalid, and character diagnostics", () => {
    const source = [
      "@back bg/missing",
      "@stopBgm misc/not-audio",
      "@sfx sfx:legacy",
      "@char Missing.Default"
    ].join("\n");
    const diagnostics = computeNaniAssetDiagnostics(source, "story.nani", index);

    expect(diagnostics.map(({ code, source: owner }) => [code, owner])).toEqual([
      ["asset-missing", "nani-assets"],
      ["asset-capability-mismatch", "nani-assets"],
      ["invalid-asset-id", "nani-assets"],
      ["character-asset-missing", "nani-assets"]
    ]);
    expect(diagnostics.map((diagnostic) => source.slice(diagnostic.span.start, diagnostic.span.end))).toEqual([
      "bg/missing",
      "misc/not-audio",
      "sfx:legacy",
      "Missing.Default"
    ]);
  });

  it("uses primary precedence and the last matching named argument", () => {
    const source = [
      "@bgm bgm/main bgmPath:bgm/missing",
      "@stopSfx sfxPath:sfx/missing sfxPath:sfx/door"
    ].join("\n");
    const references = collectNaniAssetReferences(source, "story.nani");

    expect(references.map((reference) => reference.value)).toEqual(["bgm/main", "sfx/door"]);
    expect(references.map((reference) => source.slice(reference.span.start, reference.span.end))).toEqual([
      "bgm/main",
      "sfx/door"
    ]);
    expect(computeNaniAssetDiagnostics(source, "story.nani", index)).toEqual([]);
  });

  it("skips dynamic, group-only, and wildcard references", () => {
    const source = [
      "@bgm bgmPath:{selectedTrack}",
      "@stopBgm group:music",
      "@char *"
    ].join("\n");
    expect(computeNaniAssetDiagnostics(source, "story.nani", index)).toEqual([]);
  });

  it("resolves valid references for hover and definition", () => {
    const source = "@stopBgm bgm/main";
    const reference = resolveNaniAssetReferenceAtOffset(
      source,
      "story.nani",
      source.indexOf("main"),
      index
    );
    expect(reference).toMatchObject({
      assetId: "bgm/main",
      usage: "selector",
      capability: "audio",
      asset: { sourcePath: "/assets/bgm/main" }
    });
  });
});

function asset(id: string, mimeType: string) {
  return {
    id,
    mimeType,
    uri: `assets/${id}`,
    sourcePath: `/assets/${id}`
  };
}
