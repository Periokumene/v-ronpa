import { describe, expect, it } from "vitest";
import { parseCompositionTokens, parseGeneratedRuntimeAssets } from "./projectAssets";

describe("project asset parsing", () => {
  it("extracts and validates the configured generated asset export", () => {
    const source = `
      import type { RuntimeAsset } from "@v-ronpa/contracts";
      export const exampleAssets = [
        {
          "id": "bg:room",
          "kind": "background",
          "optimizedUri": "/example/backgrounds/room.png",
          "format": "png",
          "compression": [],
          "lods": [],
          "collisionProxyIds": [],
          "tags": []
        }
      ] satisfies RuntimeAsset[];
    `;

    expect(parseGeneratedRuntimeAssets(source, "exampleAssets")).toEqual([
      { id: "bg:room", kind: "background", optimizedUri: "/example/backgrounds/room.png" }
    ]);
  });

  it("rejects missing exports and malformed generated assets", () => {
    expect(() => parseGeneratedRuntimeAssets("export const other = [];", "exampleAssets")).toThrow(
      "Generated asset export 'exampleAssets' was not found."
    );
    expect(() => parseGeneratedRuntimeAssets("export const exampleAssets = [{}];", "exampleAssets")).toThrow();
  });

  it("reads sorted composition token names and rejects malformed content", () => {
    expect(parseCompositionTokens('{"tokens":{"Smile":["MAIN/MOUTH>1"],"Default":["Smile"]}}')).toEqual([
      "Default",
      "Smile"
    ]);
    expect(() => parseCompositionTokens('{"tokens":{"Default":[]}}')).not.toThrow();
    expect(() => parseCompositionTokens('{"tokens":[]}')).toThrow();
  });
});
