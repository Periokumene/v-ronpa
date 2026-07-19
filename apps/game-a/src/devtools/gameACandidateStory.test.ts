import { describe, expect, it } from "vitest";
import type { VnEntryDef, VnRuntimeScriptSource } from "@v-ronpa/contracts";
import { inspectVnDebugScript } from "@v-ronpa/app-vn-runtime/debug";
import type { VnDevtoolsScriptCandidate } from "@v-ronpa/app-vn-devtools";
import type { GameAStoryDefinition } from "../gameAScripts";
import { decorateGameACandidateStory } from "./gameACandidateStory";

describe("Game A candidate story decoration", () => {
  it("derives only the changed script plan and retains unrelated plans", async () => {
    const candidate = await canonicalCandidate([
      "#Start",
      "@char alice.EYE3,MOUTH6 pos:50",
      "@slide alice.EFFECT1",
      "@char bob.Neutral pos:20",
      "Narrator: Candidate.|#candidate|"
    ].join("\n"));
    const inspection = await inspectVnDebugScript(candidate.entry, candidate.source);
    const untouchedPlan = [{ characterId: "ema", appearanceExpressions: ["Pensive1"] }] as const;
    const active = definition(candidate, {
      [candidate.source.scriptPath]: [],
      "game-a/chapter-02.nani": untouchedPlan
    });

    const result = decorateGameACandidateStory({
      activeDefinition: active,
      candidate,
      inspection,
      signal: new AbortController().signal
    });

    expect(result.catalog).toBe(active.catalog);
    expect(result.characterPreloadPlanByScriptPath[candidate.source.scriptPath]).toEqual([
      { characterId: "alice", appearanceExpressions: ["EFFECT1", "EYE3,MOUTH6"] },
      { characterId: "bob", appearanceExpressions: ["Neutral"] }
    ]);
    expect(result.characterPreloadPlanByScriptPath["game-a/chapter-02.nani"]).toBe(untouchedPlan);
  });

  it("keeps equivalent catalog and character-plan identities stable", async () => {
    const candidate = await canonicalCandidate("#Start\n@char alice.EYE3\nNarrator: Candidate.|#candidate|");
    const inspection = await inspectVnDebugScript(candidate.entry, candidate.source);
    const installedPlan = [{ characterId: "alice", appearanceExpressions: ["EYE3"] }] as const;
    const active = definition(candidate, { [candidate.source.scriptPath]: installedPlan });

    const result = decorateGameACandidateStory({
      activeDefinition: active,
      candidate,
      inspection,
      signal: new AbortController().signal
    });

    expect(result.catalog).toBe(active.catalog);
    expect(result.characterPreloadPlanByScriptPath[candidate.source.scriptPath]).toBe(installedPlan);
  });
});

function definition(
  candidate: VnDevtoolsScriptCandidate,
  plans: GameAStoryDefinition["characterPreloadPlanByScriptPath"]
): GameAStoryDefinition {
  return { entry: candidate.entry, catalog: candidate.catalog, characterPreloadPlanByScriptPath: plans };
}

async function canonicalCandidate(sourceText: string): Promise<VnDevtoolsScriptCandidate> {
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
  const inspection = await inspectVnDebugScript(entry, draft);
  return { entry, source: inspection.source, catalog: [inspection.source] };
}
