import { describe, expect, it } from "vitest";
import type { RuntimeScript } from "@v-ronpa/contracts";
import { createScriptRevision } from "./generate-assets.mjs";

describe("generated script revisions", () => {
  it("ignores source locations but changes for semantic command content", () => {
    const base = runtimeScript("Hello", 1);
    expect(createScriptRevision(base)).toBe(createScriptRevision(runtimeScript("Hello", 99)));
    expect(createScriptRevision(base)).not.toBe(createScriptRevision(runtimeScript("Changed", 1)));
  });
});

function runtimeScript(text: string, line: number): RuntimeScript {
  return {
    scriptPath: "game/test.nani",
    labels: { Start: 0 },
    assets: [],
    dependencies: [],
    commands: [
      {
        commandId: "print",
        canonicalName: "print",
        category: "text",
        source: "v-ronpa",
        status: "implemented",
        params: { text, autoNext: false },
        loc: { scriptPath: "game/test.nani", line, column: 1, raw: text }
      }
    ]
  };
}
