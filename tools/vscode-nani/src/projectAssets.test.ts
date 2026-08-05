import { describe, expect, it } from "vitest";
import { mimeSupportsCapability, parseCompositionTokens } from "./projectAssets";

describe("project asset parsing", () => {
  it("reads sorted composition token names and rejects malformed content", () => {
    expect(parseCompositionTokens('{"tokens":{"Smile":["MAIN/MOUTH>1"],"Default":["Smile"]}}')).toEqual([
      "Default",
      "Smile"
    ]);
    expect(() => parseCompositionTokens('{"tokens":{"Default":[]}}')).not.toThrow();
    expect(() => parseCompositionTokens('{"tokens":[]}')).toThrow();
  });

  it("matches every Asset Protocol v5 capability from scanner MIME values", () => {
    for (const [mimeType, capability] of [
      ["image/png", "image"],
      ["audio/ogg", "audio"],
      ["video/mp4", "video"],
      ["font/woff2", "font"],
      ["model/gltf-binary", "model"],
      ["application/json", "json"]
    ] as const) {
      expect(mimeSupportsCapability(mimeType, capability)).toBe(true);
    }
    expect(mimeSupportsCapability("application/json", "model")).toBe(false);
    expect(mimeSupportsCapability("image/png", "audio")).toBe(false);
  });
});
