import { describe, expect, it } from "vitest";
import type { ContentManifest, RuntimeAsset, RuntimeAssetFormat, RuntimeAssetKind } from "@v-ronpa/contracts";
import { composeContentManifest, createAssetRegistry, defineRuntimeAssetFragment, isRawAssetReference } from "./index";

describe("asset registry", () => {
  it("composes provider fragments into one manifest and rejects duplicate authority", () => {
    const fragment = defineRuntimeAssetFragment({
      id: "runtime-assets:test",
      runtimeAssets: [runtimeAsset("fx:noise", "fx")]
    });
    const explicit = baseManifest([]);
    const manifest = composeContentManifest(explicit, [fragment]);

    expect(createAssetRegistry(manifest).resolve({ id: "fx:noise", kind: "fx" }).uri).toBe("/assets/fx-noise");
    expect(() => composeContentManifest({ ...explicit, runtimeAssets: [runtimeAsset("fx:noise", "fx")] }, [fragment])).toThrow(
      "Duplicate runtime asset 'fx:noise'"
    );
  });
  it("resolves every runtime asset kind from ContentManifest.runtimeAssets", () => {
    const manifest = manifestWithKinds(["character-pack", "background", "bgm", "sfx", "bleep", "voice", "video", "font", "glb", "texture", "fx"]);
    const registry = createAssetRegistry(manifest);

    expect(registry.diagnostics).toEqual([]);
    for (const asset of manifest.runtimeAssets) {
      expect(registry.resolve({ id: asset.id, kind: asset.kind })).toMatchObject({
        asset,
        uri: asset.optimizedUri
      });
    }
  });

  it("diagnoses missing assets, kind mismatches, duplicate declarations, and raw URIs", () => {
    const first = runtimeAsset("bgm:main", "bgm");
    const manifest = baseManifest([first, runtimeAsset("bgm:main", "bgm"), runtimeAsset("sfx:door", "sfx")]);
    const registry = createAssetRegistry(manifest);

    expect(registry.diagnostics).toMatchObject([{ code: "duplicate-runtime-asset", id: "bgm:main" }]);
    expect(registry.resolve({ id: "missing:asset", kind: "bgm" }).diagnostic).toMatchObject({ code: "asset-missing" });
    expect(registry.resolve({ id: "sfx:door", kind: "bgm" }).diagnostic).toMatchObject({ code: "asset-kind-mismatch" });
    expect(registry.resolve({ id: "/harness/media/sfx/door.ogg", kind: "sfx" }).diagnostic).toMatchObject({
      code: "raw-uri-disallowed"
    });
  });

  it("diagnoses unsupported manifest versions", () => {
    const registry = createAssetRegistry({ ...baseManifest([]), version: 2 as 4 });

    expect(registry.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "manifest-version-unsupported", severity: "error" }),
        expect.objectContaining({ code: "manifest-invalid", severity: "error" })
      ])
    );
  });

  it("diagnoses malformed manifests without resolving partially declared assets", () => {
    const registry = createAssetRegistry({
      version: 4,
      runtimeAssets: [{ id: "bg:harness", kind: "background" }],
      maps: [],
      items: [],
      trials: []
    });

    expect(registry.diagnostics).toMatchObject([{ code: "manifest-invalid", severity: "error" }]);
    expect(registry.resolve({ id: "bg:harness", kind: "background" }).diagnostic).toMatchObject({ code: "asset-missing" });
  });

  it("validates manifest-level asset references against runtimeAssets", () => {
    const manifest: ContentManifest = {
      ...baseManifest([
        runtimeAsset("texture:evidence:keycard-thumbnail", "texture"),
        runtimeAsset("model:academy-hall", "glb"),
        runtimeAsset("bleep:dialogue-default", "bleep"),
        runtimeAsset("sfx:wrong-kind", "sfx"),
        runtimeAsset("font:serif-regular", "font")
      ]),
      audio: {
        dialogueBleep: {
          enabled: true,
          defaultSound: { sourceRef: "bleep:dialogue-default", gain: 0.5 },
          speakerOverrides: {
            Felix: { sourceRef: "bleep:missing", gain: 1 },
            Narrator: null,
            Mira: { sourceRef: "sfx:wrong-kind", gain: 1 }
          }
        }
      },
      runtimeAssets: [
        runtimeAsset("texture:evidence:keycard-thumbnail", "texture"),
        runtimeAsset("model:academy-hall", "glb"),
        runtimeAsset("bleep:dialogue-default", "bleep"),
        runtimeAsset("sfx:wrong-kind", "sfx"),
        runtimeAsset("font:serif-regular", "font")
      ],
      fonts: [
        { id: "font:serif", family: "Serif", sourceRef: "font:serif-regular", weight: "400", style: "normal" },
        { id: "font:missing", family: "Missing", sourceRef: "font:missing", weight: "400", style: "normal" },
        { id: "font:wrong-kind", family: "Wrong", sourceRef: "sfx:wrong-kind", weight: "400", style: "normal" }
      ],
      assets: [{ id: "model:academy-hall", kind: "glb", tags: [] }],
      vnEntries: [
        {
          id: "vn:opening",
          title: "Opening",
          initialScriptPath: "opening.nani",
          profile: "vn2d",
          assetRefs: [{ id: "texture:missing-vn", kind: "texture", tags: [] }]
        }
      ],
      maps: [
        {
          id: "map:academy",
          name: "Academy",
          spawn: [0, 1, 2],
          assetRefs: [{ id: "model:academy-hall", kind: "glb", tags: [] }],
          interactables: [],
          collisionProxyIds: []
        }
      ],
      evidence: [
        {
          id: "evidence:keycard",
          name: "Keycard",
          shortLabel: "Keycard",
          description: "A keycard.",
          details: [],
          visual: { thumbnailAssetId: "texture:evidence:keycard-thumbnail", iconAssetId: "texture:missing-icon" },
          tags: []
        }
      ],
      collisionProxies: [{ id: "collision:academy", kind: "trimesh", assetId: "model:missing-collision" }]
    };

    expect(createAssetRegistry(manifest).validateReferences()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "asset-missing", id: "bleep:missing", kind: "bleep" }),
        expect.objectContaining({ code: "asset-kind-mismatch", id: "sfx:wrong-kind", kind: "bleep" }),
        expect.objectContaining({ code: "asset-missing", id: "font:missing", kind: "font" }),
        expect.objectContaining({ code: "asset-kind-mismatch", id: "sfx:wrong-kind", kind: "font" }),
        expect.objectContaining({ code: "asset-missing", id: "texture:missing-vn", kind: "texture" }),
        expect.objectContaining({ code: "asset-missing", id: "texture:missing-icon", kind: "texture" }),
        expect.objectContaining({ code: "asset-missing", id: "model:missing-collision", kind: "glb" })
      ])
    );
  });

  it("detects raw asset reference syntax", () => {
    expect(isRawAssetReference("/harness/foo.png")).toBe(true);
    expect(isRawAssetReference("https://example.test/foo.png")).toBe(true);
    expect(isRawAssetReference("Ema.Pensive1")).toBe(false);
  });
});

function manifestWithKinds(kinds: RuntimeAssetKind[]): ContentManifest {
  return baseManifest(kinds.map((kind) => runtimeAsset(`${kind}:sample`, kind)));
}

function baseManifest(runtimeAssets: RuntimeAsset[]): ContentManifest {
  return {
    version: 4,
    assets: [],
    fonts: [],
    runtimeAssets,
    collisionProxies: [],
    vnEntries: [],
    maps: [],
    items: [],
    evidence: [],
    trials: []
  };
}

function runtimeAsset(id: string, kind: RuntimeAssetKind): RuntimeAsset {
  const format: RuntimeAssetFormat =
    kind === "bgm" || kind === "sfx" || kind === "bleep" || kind === "voice"
      ? "ogg"
      : kind === "video"
        ? "mp4"
        : kind === "glb"
          ? "gltf"
          : kind === "character-pack"
            ? "json"
            : kind === "font"
              ? "woff2"
              : "png";
  return {
    id,
    kind,
    optimizedUri: `/assets/${id.replaceAll(":", "-")}`,
    format,
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: []
  };
}
