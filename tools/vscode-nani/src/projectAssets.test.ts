import { describe, expect, it } from "vitest";
import { parseCompositionTokens } from "./projectAssets";

describe("project asset parsing", () => {
  it("reads sorted composition token names and rejects malformed content", () => {
    expect(parseCompositionTokens('{"tokens":{"Smile":["MAIN/MOUTH>1"],"Default":["Smile"]}}')).toEqual([
      "Default",
      "Smile"
    ]);
    expect(() => parseCompositionTokens('{"tokens":{"Default":[]}}')).not.toThrow();
    expect(() => parseCompositionTokens('{"tokens":[]}')).toThrow();
  });
});
