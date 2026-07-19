import { describe, expect, it } from "vitest";
import type { VnRuntimeEntry } from "@v-ronpa/app-vn-runtime";
import { inspectVnDebugEntry } from "@v-ronpa/app-vn-runtime/debug";
import type { GameAVnLaunchDefinition } from "../gameAScripts";
import { prepareGameACandidateLaunch, stabilizeGameACandidateLaunch } from "./gameACandidateLaunch";

describe("Game A DEV candidate launch preparation", () => {
  it("derives newly authored explicit and wildcard expressions from the verified candidate", async () => {
    const entry = await canonicalEntry([
      "#Start",
      "@char alice.EYE3,MOUTH6 pos:50",
      "@slide alice.EFFECT1",
      "@char bob.Neutral pos:20",
      "@char *.Shared",
      "Narrator: Candidate.|#candidate|"
    ].join("\n"));

    const result = await prepareGameACandidateLaunch(entry, new AbortController().signal);

    expect(result).toEqual({
      status: "ready",
      launchDefinition: {
        runtimeEntry: entry,
        characterPreloadPlan: [
          { characterId: "alice", appearanceExpressions: ["EFFECT1", "EYE3,MOUTH6", "Shared"] },
          { characterId: "bob", appearanceExpressions: ["Neutral", "Shared"] }
        ]
      }
    });
  });

  it("reuses an equivalent preload-plan identity without hiding a changed runtime entry", () => {
    const active = launchDefinition("sha256:old", [{
      characterId: "alice",
      appearanceExpressions: ["", "EYE1,MOUTH1"]
    }]);
    const equivalent = launchDefinition("sha256:new", [{
      characterId: "alice",
      appearanceExpressions: ["", "EYE1,MOUTH1"]
    }]);
    const stabilized = stabilizeGameACandidateLaunch(active, equivalent);

    expect(stabilized.runtimeEntry).toBe(equivalent.runtimeEntry);
    expect(stabilized.characterPreloadPlan).toBe(active.characterPreloadPlan);

    const expanded = launchDefinition("sha256:expanded", [{
      characterId: "alice",
      appearanceExpressions: ["", "EYE1,MOUTH1", "EYE2,MOUTH2"]
    }]);
    expect(stabilizeGameACandidateLaunch(active, expanded)).toBe(expanded);
  });

  it("rejects a revision mismatch without producing a replacement launch definition", async () => {
    const entry = await canonicalEntry("#Start\n@char alice.EYE3\nNarrator: Candidate.|#candidate|");
    const result = await prepareGameACandidateLaunch(
      { ...entry, scriptRevision: "sha256:stale" },
      new AbortController().signal
    );

    expect(result).toEqual({ status: "blocked", reason: "revision-mismatch" });
    expect(result).not.toHaveProperty("launchDefinition");
  });

  it("rejects invalid and already-cancelled candidates without producing a replacement plan", async () => {
    const invalid = await canonicalEntry("#Start\n#Start\n@char alice.EYE4");
    const invalidResult = await prepareGameACandidateLaunch(invalid, new AbortController().signal);
    expect(invalidResult).toEqual({ status: "blocked", reason: "invalid-source" });

    const abort = new AbortController();
    abort.abort();
    const abortedResult = await prepareGameACandidateLaunch(invalid, abort.signal);
    expect(abortedResult).toEqual({ status: "blocked", reason: "aborted" });
    expect(abortedResult).not.toHaveProperty("launchDefinition");
  });
});

function launchDefinition(
  scriptRevision: string,
  characterPreloadPlan: GameAVnLaunchDefinition["characterPreloadPlan"]
): GameAVnLaunchDefinition {
  return {
    runtimeEntry: {
      id: "opening",
      profile: "vn2d",
      scriptPath: "game-a/opening.nani",
      scriptRevision,
      sourceText: "#Start\nNarrator: Hello."
    },
    characterPreloadPlan
  };
}

async function canonicalEntry(sourceText: string): Promise<VnRuntimeEntry> {
  const draft: VnRuntimeEntry = {
    id: "vn:game-a-candidate-test",
    profile: "vn2d",
    scriptPath: "game-a/test/candidate.nani",
    scriptRevision: "pending",
    sourceText,
    startLabel: "Start"
  };
  return (await inspectVnDebugEntry(draft)).entry;
}
