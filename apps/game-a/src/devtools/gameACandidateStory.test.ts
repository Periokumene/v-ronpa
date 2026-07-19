import { describe, expect, it } from "vitest";
import type { VnEntryDef, VnRuntimeScriptSource } from "@v-ronpa/contracts";
import { inspectVnDebugEntry } from "@v-ronpa/app-vn-runtime/debug";
import type { VnDevtoolsScriptCandidate } from "@v-ronpa/app-vn-devtools";
import type { GameAStoryDefinition } from "../gameAScripts";
import { prepareGameACandidateStory } from "./gameACandidateStory";

describe("Game A DEV catalog candidate preparation", () => {
  it("derives the changed record plan and retains all other catalog plans", async () => {
    const candidate = await canonicalCandidate([
      "#Start",
      "@char alice.EYE3,MOUTH6 pos:50",
      "@slide alice.EFFECT1",
      "@char bob.Neutral pos:20",
      "Narrator: Candidate.|#candidate|"
    ].join("\n"));
    const untouchedPlan = [{ characterId: "ema", appearanceExpressions: ["Pensive1"] }] as const;
    const active = definition(candidate, {
      [candidate.source.scriptPath]: [],
      "game-a/chapter-02.nani": untouchedPlan
    });

    const result = await prepareGameACandidateStory(active, candidate, new AbortController().signal);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.storyDefinition.catalog).toBe(candidate.catalog);
    expect(result.storyDefinition.characterPreloadPlanByScriptPath[candidate.source.scriptPath]).toEqual([
      { characterId: "alice", appearanceExpressions: ["EFFECT1", "EYE3,MOUTH6"] },
      { characterId: "bob", appearanceExpressions: ["Neutral"] }
    ]);
    expect(result.storyDefinition.characterPreloadPlanByScriptPath["game-a/chapter-02.nani"]).toBe(untouchedPlan);
  });

  it("reuses an equivalent plan identity and rejects stale, invalid, or cancelled candidates", async () => {
    const candidate = await canonicalCandidate("#Start\n@char alice.EYE3\nNarrator: Candidate.|#candidate|");
    const existingPlan = [{ characterId: "alice", appearanceExpressions: ["EYE3"] }] as const;
    const active = definition(candidate, { [candidate.source.scriptPath]: existingPlan });
    const ready = await prepareGameACandidateStory(active, candidate, new AbortController().signal);
    expect(ready.status === "ready" && ready.storyDefinition.characterPreloadPlanByScriptPath[candidate.source.scriptPath])
      .toBe(existingPlan);
    expect(ready.status === "ready" && ready.storyDefinition.catalog).toBe(active.catalog);

    const staleSource = { ...candidate.source, scriptRevision: "sha256:stale" };
    await expect(prepareGameACandidateStory(
      active,
      { ...candidate, source: staleSource, catalog: [staleSource] },
      new AbortController().signal
    )).resolves.toEqual({ status: "blocked", reason: "revision-mismatch" });

    const invalid = await canonicalCandidate("#Start\n#Start\n@char alice.EYE4");
    await expect(prepareGameACandidateStory(active, invalid, new AbortController().signal))
      .resolves.toEqual({ status: "blocked", reason: "invalid-source" });

    const abort = new AbortController();
    abort.abort();
    await expect(prepareGameACandidateStory(active, candidate, abort.signal))
      .resolves.toEqual({ status: "blocked", reason: "aborted" });
  });

  it("revalidates the complete catalog before the Game A mutation boundary", async () => {
    const entry: VnEntryDef = {
      id: "vn:game-a-candidate-test",
      title: "Candidate",
      profile: "vn2d",
      initialScriptPath: "game-a/opening.nani",
      startLabel: "Start",
      assetRefs: []
    };
    const opening = await inspectVnDebugEntry(entry, {
      scriptPath: "game-a/opening.nani",
      scriptRevision: "pending",
      sourceText: "#Start\n@goto game-a/chapter-02.nani#Start"
    });
    const chapter = await inspectVnDebugEntry(entry, {
      scriptPath: "game-a/chapter-02.nani",
      scriptRevision: "pending",
      sourceText: "#Other\nNarrator: Broken target."
    });
    const candidate: VnDevtoolsScriptCandidate = {
      entry,
      catalog: [opening.source, chapter.source],
      source: chapter.source
    };
    const active = definition(candidate, {
      [opening.source.scriptPath]: [],
      [chapter.source.scriptPath]: []
    });

    await expect(prepareGameACandidateStory(active, candidate, new AbortController().signal))
      .resolves.toEqual({ status: "blocked", reason: "catalog-link-error" });
  });
});

function definition(
  candidate: VnDevtoolsScriptCandidate,
  plans: GameAStoryDefinition["characterPreloadPlanByScriptPath"]
): GameAStoryDefinition {
  return { entry: candidate.entry, catalog: candidate.catalog, characterPreloadPlanByScriptPath: plans };
}

async function canonicalCandidate(sourceText: string, canonicalRevision = true): Promise<VnDevtoolsScriptCandidate> {
  const entry: VnEntryDef = {
    id: "vn:game-a-candidate-test",
    title: "Candidate",
    profile: "vn2d",
    initialScriptPath: "game-a/test/candidate.nani",
    startLabel: "Start",
    assetRefs: []
  };
  const draft: VnRuntimeScriptSource = {
    scriptPath: entry.initialScriptPath,
    scriptRevision: "pending",
    sourceText
  };
  const inspection = await inspectVnDebugEntry(entry, draft);
  const source = canonicalRevision ? inspection.source : draft;
  return { entry, source, catalog: [source] };
}
