import { describe, expect, it } from "vitest";
import type {
  LayeredCharacterCompositions,
  LayeredCharacterDefinition,
  LayeredCharacterLayerMetadata,
  LayeredCharacterLayers
} from "@v-ronpa/contracts";
import {
  calculateLayeredCharacterBounds,
  resolveLayeredCharacter,
  resolveLayeredCharacterLayerRefs,
  resolveLayeredCharacterSourcePixelScale
} from "./index";

describe("layered character resolver", () => {
  it("resolves default composition and layered expression tokens", () => {
    const result = resolveLayeredCharacter(fixture("Pensive1,ArmR3"));

    expect(result.diagnostics).toEqual([]);
    expect(result.activeLayers.map((layer) => layer.id)).toEqual([
      "Angle01>Body",
      "Angle01/Head01>HeadBase01",
      "Angle01/Head01/Facial01/Mouth01>Mouth01_Pensive_Open",
      "Angle01/Head01/Facial01/Eyes01>Eyes01_Pensive_Open01",
      "Angle01/ArmL>ArmL01",
      "Angle01/ArmR>ArmR03"
    ]);
  });

  it("lets later single-choice group operations override earlier layers", () => {
    const result = resolveLayeredCharacter(fixture("Pensive1,ArmR3,ArmR4"));

    expect(result.diagnostics).toEqual([]);
    expect(result.activeLayers.map((layer) => layer.id)).toContain("Angle01/ArmR>ArmR04");
    expect(result.activeLayers.map((layer) => layer.id)).not.toContain("Angle01/ArmR>ArmR03");
  });

  it("supports additive layers and prefix group removal", () => {
    const result = resolveLayeredCharacter(fixture("AddSweat,Angle01/Head01/Facial01/Sweat01-"));

    expect(result.diagnostics).toEqual([]);
    expect(result.activeLayers.map((layer) => layer.id)).not.toContain("Angle01/Head01/Facial01/Sweat01>Sweat01_01");
  });

  it("resolves active layer refs before metadata is loaded", () => {
    const input = fixture("Pensive1,ArmR3");
    const result = resolveLayeredCharacterLayerRefs({
      character: input.character,
      layers: input.layers,
      compositions: input.compositions,
      appearanceExpression: input.appearanceExpression
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.activeLayers.map((layer) => layer.id).sort()).toEqual([
      "Angle01/ArmR>ArmR03",
      "Angle01/ArmL>ArmL01",
      "Angle01>Body",
      "Angle01/Head01>HeadBase01",
      "Angle01/Head01/Facial01/Eyes01>Eyes01_Pensive_Open01",
      "Angle01/Head01/Facial01/Mouth01>Mouth01_Pensive_Open"
    ].sort());
    expect(result.activeLayers.map((layer) => layer.metadataPath)).not.toContain("assets/layers/Eyes01_Normal_Open01.json");
  });

  it("does not require inactive metadata to resolve the full render plan", () => {
    const input = fixture("Pensive1");
    const metadataByPath = Object.fromEntries(
      Object.entries(input.metadataByPath).filter(([path]) => !path.includes("Normal"))
    );

    const result = resolveLayeredCharacter({ ...input, metadataByPath });

    expect(result.diagnostics).toEqual([]);
    expect(result.activeLayers.map((layer) => layer.id)).not.toContain("Angle01/Head01/Facial01/Eyes01>Eyes01_Normal_Open01");
    expect(result.activeLayers.map((layer) => layer.id)).toContain("Angle01/Head01/Facial01/Eyes01>Eyes01_Pensive_Open01");
  });

  it("fails the whole expression for unknown tokens, unknown layers, and recursive tokens", () => {
    expect(resolveLayeredCharacter(fixture("MissingToken")).diagnostics).toMatchObject([{ code: "unknown-token" }]);
    expect(resolveLayeredCharacter(fixture("Angle01/ArmR>")).diagnostics).toMatchObject([{ code: "invalid-expression" }]);
    expect(resolveLayeredCharacter(fixture("Angle01/ArmR>MissingLayer")).diagnostics).toMatchObject([{ code: "unknown-layer" }]);
    expect(resolveLayeredCharacter(fixture("RecursiveA")).diagnostics).toMatchObject([{ code: "recursive-token" }]);
  });

  it("calculates active layer bounds from sprite pivot, ppu, and local transform", () => {
    const result = resolveLayeredCharacter(fixture("Pensive1,ArmR3"));
    const textureDimensions = Object.fromEntries(
      result.activeLayers.map((layer) => [layer.id, { width: 100, height: 200 }])
    );

    expect(calculateLayeredCharacterBounds(result.activeLayers, textureDimensions)).toEqual({
      min: [-0.5, -1],
      max: [2.5, 5]
    });
  });
});

describe("layered character source-pixel scale", () => {
  it("derives the shipped Alice and Ema source-pixel units", () => {
    expect(resolveLayeredCharacterSourcePixelScale([pixelLayer("Alice", 1, 1, 1)])).toEqual({
      ok: true,
      unitsPerPixel: 1
    });
    expect(resolveLayeredCharacterSourcePixelScale([pixelLayer("Ema", 100, 0.6, 0.6)])).toEqual({
      ok: true,
      unitsPerPixel: 0.006
    });
  });

  it("uses scale magnitudes and accepts only floating-point noise within the relative tolerance", () => {
    const result = resolveLayeredCharacterSourcePixelScale([
      pixelLayer("Body", 100, -0.6, -0.6),
      pixelLayer("Face", 100, 0.6000005, 0.6000005)
    ]);

    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.unitsPerPixel).toBe(0.006);
  });

  it("rejects empty, zero, non-square, and cross-layer inconsistent source-pixel scales", () => {
    expect(resolveLayeredCharacterSourcePixelScale([])).toMatchObject({ ok: false, code: "empty-layer-set" });
    expect(resolveLayeredCharacterSourcePixelScale([pixelLayer("Zero", 100, 0, 0)]))
      .toMatchObject({ ok: false, code: "invalid-source-pixel-scale" });
    expect(resolveLayeredCharacterSourcePixelScale([pixelLayer("Wide", 100, 0.6, 0.7)]))
      .toMatchObject({ ok: false, code: "non-square-source-pixels" });
    expect(resolveLayeredCharacterSourcePixelScale([
      pixelLayer("Body", 100, 0.6, 0.6),
      pixelLayer("Face", 100, 0.61, 0.61)
    ])).toMatchObject({ ok: false, code: "inconsistent-source-pixel-scale" });
  });
});

function fixture(appearanceExpression = "") {
  const character: LayeredCharacterDefinition = {
    id: "Ema",
    defaultComposition: ["ArmR1", "ArmL1", "Default"],
    renderSpace: { stageScale: 18, characterAnchor: [1, -1] }
  };
  const layers: LayeredCharacterLayers = {
    groups: {
      Angle01: { layers: { Body: ref("Body") } },
      "Angle01/ArmL": { layers: { ArmL01: ref("ArmL01") } },
      "Angle01/ArmR": { layers: { ArmR01: ref("ArmR01"), ArmR03: ref("ArmR03"), ArmR04: ref("ArmR04") } },
      "Angle01/Head01": { layers: { HeadBase01: ref("HeadBase01") } },
      "Angle01/Head01/Facial01/Eyes01": { layers: { Eyes01_Normal_Open01: ref("Eyes01_Normal_Open01"), Eyes01_Pensive_Open01: ref("Eyes01_Pensive_Open01") } },
      "Angle01/Head01/Facial01/Mouth01": { layers: { Mouth01_Normal_Closed: ref("Mouth01_Normal_Closed"), Mouth01_Pensive_Open: ref("Mouth01_Pensive_Open") } },
      "Angle01/Head01/Facial01/Sweat01": { layers: { Sweat01_01: ref("Sweat01_01") } }
    }
  };
  const compositions: LayeredCharacterCompositions = {
    tokens: {
      ArmR1: ["Angle01/ArmR>ArmR01"],
      ArmR3: ["Angle01/ArmR>ArmR03"],
      ArmR4: ["Angle01/ArmR>ArmR04"],
      ArmL1: ["Angle01/ArmL>ArmL01"],
      Default: ["Angle01>Body", "Normal1"],
      Normal1: [
        "Angle01/Head01+HeadBase01",
        "Angle01/Head01/Facial01/Eyes01>Eyes01_Normal_Open01",
        "Angle01/Head01/Facial01/Mouth01>Mouth01_Normal_Closed"
      ],
      Pensive1: [
        "Angle01/Head01+HeadBase01",
        "Angle01/Head01/Facial01/Eyes01>Eyes01_Pensive_Open01",
        "Angle01/Head01/Facial01/Mouth01>Mouth01_Pensive_Open"
      ],
      AddSweat: ["Angle01/Head01/Facial01/Sweat01+Sweat01_01"],
      RecursiveA: ["RecursiveB"],
      RecursiveB: ["RecursiveA"]
    }
  };
  const metadataByPath = Object.fromEntries(
    Object.values(layers.groups).flatMap((group) => Object.keys(group.layers).map((layer) => [`assets/layers/${layer}.json`, metadata(layer)]))
  );
  return { character, layers, compositions, metadataByPath, appearanceExpression };
}

function ref(layer: string) {
  return { src: `assets/layers/${layer}.png`, metadata: `assets/layers/${layer}.json` };
}

function metadata(layer: string): LayeredCharacterLayerMetadata {
  const drawOrders: Record<string, number> = {
    Body: 1,
    HeadBase01: 10,
    Mouth01_Normal_Closed: 20,
    Mouth01_Pensive_Open: 20,
    Eyes01_Normal_Open01: 30,
    Eyes01_Pensive_Open01: 30,
    ArmL01: 40,
    ArmR01: 50,
    ArmR03: 50,
    ArmR04: 50,
    Sweat01_01: 60
  };
  return {
    sourcePath: `Ema/${layer}`,
    drawOrder: drawOrders[layer] ?? 100,
    sprite: { pivot: { x: 0.5, y: 0.5 }, pixelsPerUnit: 100 },
    localTransform: {
      position: layer === "Body" ? { x: 1, y: 2, z: 0 } : { x: 1, y: 4, z: 0 },
      scale: layer === "Body" ? { x: 3, y: 3, z: 1 } : { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 }
    },
    renderer: { color: { r: 1, g: 1, b: 1, a: 1 }, flipX: false, flipY: false }
  };
}

function pixelLayer(id: string, pixelsPerUnit: number, scaleX: number, scaleY: number) {
  return {
    id,
    metadata: {
      sourcePath: id,
      drawOrder: 0,
      sprite: { pivot: { x: 0.5, y: 0.5 }, pixelsPerUnit },
      localTransform: {
        position: { x: 0, y: 0, z: 0 },
        scale: { x: scaleX, y: scaleY, z: 1 },
        rotation: { x: 0, y: 0, z: 0 }
      },
      renderer: { color: { r: 1, g: 1, b: 1, a: 1 }, flipX: false, flipY: false }
    }
  } satisfies { id: string; metadata: LayeredCharacterLayerMetadata };
}
