import { describe, expect, it } from "vitest";
import { inspectVnDebugScript, type VnDebugDecisionTrace } from "@v-ronpa/app-vn-runtime/debug";
import type { VnEntryDef, VnRuntimeScriptSource } from "@v-ronpa/contracts";
import {
  classifyVnDevtoolsScriptUpdateImpact,
  prepareVnDevtoolsCandidateUpdate
} from "./candidateUpdates";
import type { VnDevtoolsScriptCandidate } from "./scriptCandidate";
import type { NaniDevtoolsViteUpdate } from "./viteProtocol";

describe("Nani devtools candidate update preparation", () => {
  it("adopts a future-script update without treating the current session as changed", () => {
    expect(classifyVnDevtoolsScriptUpdateImpact({
      runtimeScriptPath: "game-a/opening.nani",
      updatedScriptPath: "game-a/chapter-02.nani",
      vnActive: false
    })).toBe("next-start");
    expect(classifyVnDevtoolsScriptUpdateImpact({
      runtimeScriptPath: "game-a/chapter-02.nani",
      updatedScriptPath: "game-a/chapter-02.nani",
      vnActive: true
    })).toBe("executed-session");
    expect(classifyVnDevtoolsScriptUpdateImpact({
      runtimeScriptPath: "game-a/chapter-02.nani",
      updatedScriptPath: "game-a/opening.nani",
      vnActive: true
    })).toBe("future-navigation");
    expect(classifyVnDevtoolsScriptUpdateImpact({
      executedScriptPaths: ["game-a/opening.nani", "game-a/chapter-02.nani"],
      runtimeScriptPath: "game-a/chapter-02.nani",
      updatedScriptPath: "game-a/opening.nani",
      vnActive: true
    })).toBe("executed-session");
    expect(classifyVnDevtoolsScriptUpdateImpact({
      executedScriptPaths: ["game-a/opening.nani", "game-a/chapter-02.nani"],
      runtimeScriptPath: "game-a/chapter-02.nani",
      updatedScriptPath: "game-a/chapter-03.nani",
      vnActive: true
    })).toBe("future-navigation");
  });

  it("retains last-known-good state for invalid source and server/browser revision disagreement", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const invalid = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update("#Start\n#Start", null),
      impact: "executed-session"
    });
    const mismatch = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update("#Start\nNarrator: Changed.|#changed|", "sha256:server-disagrees"),
      impact: "executed-session"
    });

    expect(invalid).toMatchObject({ kind: "retain-last-known-good", reason: "invalid-source" });
    expect(mismatch).toMatchObject({ kind: "retain-last-known-good", reason: "revision-mismatch" });
  });

  it("refreshes source mapping without materializing when executable semantics are unchanged", async () => {
    const activeEntry = await canonicalEntry("#Start\n; before\nNarrator: Active.|#active|");
    const prepared = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update("#Start\n; reformatted comment\nNarrator: Active.|#active|", activeEntry.source.scriptRevision),
      impact: "executed-session"
    });

    expect(prepared.kind).toBe("refresh-source-mapping");
    expect(prepared.inspection.revision).toBe(activeEntry.source.scriptRevision);
  });

  it("leaves a fixed point in another script intact during a semantic no-op remap", async () => {
    const runtimeEntry: VnEntryDef = {
      id: "vn:multi",
      title: "Multi",
      initialScriptPath: "game-a/opening.nani",
      startLabel: "Start",
      profile: "vn2d",
      assetRefs: []
    };
    const opening = await inspectVnDebugScript(runtimeEntry, {
      scriptPath: "game-a/opening.nani",
      scriptRevision: "pending",
      sourceText: "#Start\n; old comment\n@goto game-a/chapter-02.nani#Start"
    });
    const chapter = await inspectVnDebugScript(runtimeEntry, {
      scriptPath: "game-a/chapter-02.nani",
      scriptRevision: "pending",
      sourceText: "#Start\nNarrator: Chapter.|#chapter|"
    });
    const activeCandidate: VnDevtoolsScriptCandidate = {
      entry: runtimeEntry,
      catalog: [opening.source, chapter.source],
      source: opening.source
    };
    const fixedTarget = chapter.commands[0]!.anchor;
    const sourceText = "#Start\n; reformatted comment\n@goto game-a/chapter-02.nani#Start";

    const prepared = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate,
      update: {
        updateId: 1,
        entryId: runtimeEntry.id,
        scriptPath: opening.source.scriptPath,
        sourceText,
        serverRevision: opening.revision,
        diagnostics: []
      },
      pinnedTarget: fixedTarget,
      impact: "executed-session"
    });

    expect(prepared).toMatchObject({
      kind: "refresh-source-mapping",
      remappedTarget: fixedTarget
    });
  });

  it("materializes a changed revision through the pinned target before exposing it to the host", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const changedSource = "#Start\n@set route:\"updated\"\nNarrator: Updated.|#active|";
    const changedInspection = await inspectVnDebugScript(activeEntry.entry, { ...activeEntry.source, sourceText: changedSource });
    const activeInspection = await inspectVnDebugScript(activeEntry.entry, activeEntry.source);
    const pinnedTarget = activeInspection.commands[0]!.anchor;
    const decisions: VnDebugDecisionTrace = { choices: [], inputs: [] };
    const prepared = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update(changedSource, changedInspection.revision),
      pinnedTarget,
      decisions,
      impact: "executed-session"
    });

    expect(prepared.kind).toBe("materialize-pinned-target");
    if (prepared.kind !== "materialize-pinned-target") return;
    expect(prepared.result.status).toBe("ready");
    if (prepared.result.status !== "ready") return;
    expect(prepared.result.checkpoint.story.variables).toEqual({ route: "updated" });
    expect(prepared.result.checkpoint.story.text?.current?.text).toBe("Updated.");
  });

  it("remaps a persisted internal text stage to the final stage on source refresh", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: A[-]B|#staged_line|");
    const activeInspection = await inspectVnDebugScript(activeEntry.entry, activeEntry.source);
    const changedSource = "#Start\nNarrator: A[-]B[-]C|#staged_line|";
    const changedInspection = await inspectVnDebugScript(activeEntry.entry, {
      ...activeEntry.source,
      sourceText: changedSource
    });
    const prepared = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update(changedSource, changedInspection.revision),
      pinnedTarget: activeInspection.commands[0]!.anchor,
      impact: "executed-session"
    });

    expect(prepared.kind).toBe("materialize-pinned-target");
    if (prepared.kind !== "materialize-pinned-target" || prepared.result.status !== "ready") return;
    expect(prepared.result.resolvedTarget.stableId).toBe("print:staged_line:stage:final");
    expect(prepared.result.checkpoint.story.text?.current?.text).toBe("ABC");
    expect(prepared.result.checkpoint.story.backlog.map((entry) => entry.text)).toEqual(["ABC"]);
  });

  it("replays a changed predecessor through a fixed point in another script", async () => {
    const runtimeEntry: VnEntryDef = {
      id: "vn:multi",
      title: "Multi",
      initialScriptPath: "game-a/opening.nani",
      startLabel: "Start",
      profile: "vn2d",
      assetRefs: []
    };
    const activeOpening = await inspectVnDebugScript(runtimeEntry, {
      scriptPath: "game-a/opening.nani",
      scriptRevision: "pending",
      sourceText: "#Start\n@set route:\"old\"\n@goto game-a/chapter-02.nani#Start"
    });
    const chapter = await inspectVnDebugScript(runtimeEntry, {
      scriptPath: "game-a/chapter-02.nani",
      scriptRevision: "pending",
      sourceText: "#Start\nNarrator: Chapter.|#chapter|"
    });
    const activeCandidate: VnDevtoolsScriptCandidate = {
      entry: runtimeEntry,
      catalog: [activeOpening.source, chapter.source],
      source: activeOpening.source
    };
    const changedSource = "#Start\n@set route:\"new\"\n@goto game-a/chapter-02.nani#Start";
    const changedOpening = await inspectVnDebugScript(runtimeEntry, {
      ...activeOpening.source,
      sourceText: changedSource
    });

    const prepared = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate,
      update: {
        updateId: 1,
        entryId: runtimeEntry.id,
        scriptPath: activeOpening.source.scriptPath,
        sourceText: changedSource,
        serverRevision: changedOpening.revision,
        diagnostics: []
      },
      pinnedTarget: chapter.commands[0]!.anchor,
      impact: "executed-session"
    });

    expect(prepared.kind).toBe("materialize-pinned-target");
    if (prepared.kind !== "materialize-pinned-target") return;
    expect(prepared.result).toMatchObject({
      status: "ready",
      checkpoint: {
        script: { scriptPath: "game-a/chapter-02.nani" },
        story: { variables: { route: "new" } }
      }
    });
  });

  it("retains the last-known-good catalog when an update breaks a cross-script label", async () => {
    const runtimeEntry: VnEntryDef = {
      id: "vn:multi",
      title: "Multi",
      initialScriptPath: "game-a/opening.nani",
      startLabel: "Start",
      profile: "vn2d",
      assetRefs: []
    };
    const opening = await inspectVnDebugScript(runtimeEntry, {
      scriptPath: "game-a/opening.nani",
      scriptRevision: "pending",
      sourceText: "#Start\n@goto game-a/chapter-02.nani#Start"
    });
    const chapter = await inspectVnDebugScript(runtimeEntry, {
      scriptPath: "game-a/chapter-02.nani",
      scriptRevision: "pending",
      sourceText: "#Start\nNarrator: Chapter."
    });
    const activeCandidate: VnDevtoolsScriptCandidate = {
      entry: runtimeEntry,
      catalog: [opening.source, chapter.source],
      source: chapter.source
    };
    const changedSource = "#Other\nNarrator: Broken.";
    const changedChapter = await inspectVnDebugScript(runtimeEntry, {
      ...chapter.source,
      sourceText: changedSource
    });

    await expect(prepareVnDevtoolsCandidateUpdate({
      activeCandidate,
      update: {
        updateId: 1,
        entryId: runtimeEntry.id,
        scriptPath: chapter.source.scriptPath,
        sourceText: changedSource,
        serverRevision: changedChapter.revision,
        diagnostics: []
      },
      impact: "next-start"
    })).resolves.toMatchObject({
      kind: "retain-last-known-good",
      reason: "catalog-link-error",
      message: expect.stringContaining("#Start")
    });
  });

  it("separates inactive adoption from active sessions that have no fixed point", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const sourceText = "#Start\nNarrator: Changed.|#changed|";
    const candidate = await inspectVnDebugScript(activeEntry.entry, { ...activeEntry.source, sourceText });
    const candidateUpdate = update(sourceText, candidate.revision);

    await expect(prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: candidateUpdate,
      impact: "next-start"
    })).resolves.toMatchObject({ kind: "adopt-catalog" });
    await expect(prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: candidateUpdate,
      impact: "executed-session"
    })).resolves.toMatchObject({ kind: "require-preview-target" });
  });

  it("never lets a fixed point expand a future-script update into session replay", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const sourceText = "#Start\nNarrator: Changed.|#changed|";
    const candidate = await inspectVnDebugScript(activeEntry.entry, { ...activeEntry.source, sourceText });

    await expect(prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update(sourceText, candidate.revision),
      impact: "future-navigation",
      pinnedTarget: {
        kind: "command",
        scriptPath: "game-a/opening.nani",
        revision: "sha256:fixed",
        commandIndex: 0,
        commandId: "print",
        line: 1,
        ordinal: 0
      }
    })).resolves.toMatchObject({
      kind: "adopt-catalog",
      impact: "future-navigation"
    });
  });

  it("honors cancellation before any candidate can reach the commit boundary", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const controller = new AbortController();
    controller.abort();

    await expect(prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update(activeEntry.source.sourceText, activeEntry.source.scriptRevision),
      impact: "executed-session",
      signal: controller.signal
    })).rejects.toMatchObject({ name: "AbortError" });
  });
});

async function canonicalEntry(sourceText: string): Promise<VnDevtoolsScriptCandidate> {
  const entry: VnEntryDef = {
    id: "opening",
    title: "Opening",
    initialScriptPath: "game-a/opening.nani",
    startLabel: "Start",
    profile: "vn2d",
    assetRefs: []
  };
  const declared: VnRuntimeScriptSource = {
    scriptPath: entry.initialScriptPath,
    scriptRevision: "sha256:declared",
    sourceText
  };
  const inspection = await inspectVnDebugScript(entry, declared);
  return { entry, source: inspection.source, catalog: [inspection.source] };
}

function update(sourceText: string, serverRevision: string | null): NaniDevtoolsViteUpdate {
  return {
    updateId: 1,
    entryId: "opening",
    scriptPath: "game-a/opening.nani",
    sourceText,
    serverRevision,
    diagnostics: []
  };
}
