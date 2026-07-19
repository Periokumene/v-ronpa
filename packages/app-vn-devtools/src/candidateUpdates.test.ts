import { describe, expect, it } from "vitest";
import { inspectVnDebugEntry, type VnDebugDecisionTrace } from "@v-ronpa/app-vn-runtime/debug";
import type { VnEntryDef, VnRuntimeScriptSource } from "@v-ronpa/contracts";
import {
  isVnDevtoolsUpdateRuntimeActive,
  prepareVnDevtoolsCandidateUpdate
} from "./candidateUpdates";
import type { VnDevtoolsScriptCandidate } from "./scriptCandidate";
import type { NaniDevtoolsViteUpdate } from "./viteProtocol";

describe("Nani devtools candidate update preparation", () => {
  it("adopts a future-script update without treating the current session as changed", () => {
    expect(isVnDevtoolsUpdateRuntimeActive({
      hasFixedPoint: false,
      runtimeScriptPath: "game-a/opening.nani",
      updatedScriptPath: "game-a/chapter-02.nani",
      vnActive: true
    })).toBe(false);
    expect(isVnDevtoolsUpdateRuntimeActive({
      hasFixedPoint: false,
      runtimeScriptPath: "game-a/chapter-02.nani",
      updatedScriptPath: "game-a/chapter-02.nani",
      vnActive: true
    })).toBe(true);
    expect(isVnDevtoolsUpdateRuntimeActive({
      hasFixedPoint: true,
      runtimeScriptPath: "game-a/chapter-02.nani",
      updatedScriptPath: "game-a/opening.nani",
      vnActive: true
    })).toBe(true);
    expect(isVnDevtoolsUpdateRuntimeActive({
      hasFixedPoint: false,
      runtimeScriptPath: "game-a/chapter-02.nani",
      runtimeVisitedScriptPaths: ["game-a/opening.nani", "game-a/chapter-02.nani"],
      updatedScriptPath: "game-a/opening.nani",
      vnActive: true
    })).toBe(true);
    expect(isVnDevtoolsUpdateRuntimeActive({
      hasFixedPoint: false,
      runtimeScriptPath: "game-a/chapter-02.nani",
      runtimeVisitedScriptPaths: ["game-a/opening.nani", "game-a/chapter-02.nani"],
      updatedScriptPath: "game-a/chapter-03.nani",
      vnActive: true
    })).toBe(false);
  });

  it("retains last-known-good state for invalid source and server/browser revision disagreement", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const invalid = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update("#Start\n#Start", null),
      vnActive: true
    });
    const mismatch = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update("#Start\nNarrator: Changed.|#changed|", "sha256:server-disagrees"),
      vnActive: true
    });

    expect(invalid).toMatchObject({ kind: "retain-last-known-good", reason: "invalid-source" });
    expect(mismatch).toMatchObject({ kind: "retain-last-known-good", reason: "revision-mismatch" });
  });

  it("refreshes source mapping without materializing when executable semantics are unchanged", async () => {
    const activeEntry = await canonicalEntry("#Start\n; before\nNarrator: Active.|#active|");
    const prepared = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update("#Start\n; reformatted comment\nNarrator: Active.|#active|", activeEntry.source.scriptRevision),
      vnActive: true
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
    const opening = await inspectVnDebugEntry(runtimeEntry, {
      scriptPath: "game-a/opening.nani",
      scriptRevision: "pending",
      sourceText: "#Start\n; old comment\n@goto game-a/chapter-02.nani#Start"
    });
    const chapter = await inspectVnDebugEntry(runtimeEntry, {
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
      vnActive: true
    });

    expect(prepared).toMatchObject({
      kind: "refresh-source-mapping",
      remappedTarget: fixedTarget
    });
  });

  it("materializes a changed revision through the pinned target before exposing it to the host", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const changedSource = "#Start\n@set route:\"updated\"\nNarrator: Updated.|#active|";
    const changedInspection = await inspectVnDebugEntry(activeEntry.entry, { ...activeEntry.source, sourceText: changedSource });
    const activeInspection = await inspectVnDebugEntry(activeEntry.entry, activeEntry.source);
    const pinnedTarget = activeInspection.commands[0]!.anchor;
    const decisions: VnDebugDecisionTrace = { choices: [], inputs: [] };
    const prepared = await prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update(changedSource, changedInspection.revision),
      pinnedTarget,
      decisions,
      vnActive: true
    });

    expect(prepared.kind).toBe("materialize-pinned-target");
    if (prepared.kind !== "materialize-pinned-target") return;
    expect(prepared.result.status).toBe("ready");
    if (prepared.result.status !== "ready") return;
    expect(prepared.result.checkpoint.story.variables).toEqual({ route: "updated" });
    expect(prepared.result.checkpoint.story.text?.current?.text).toBe("Updated.");
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
    const activeOpening = await inspectVnDebugEntry(runtimeEntry, {
      scriptPath: "game-a/opening.nani",
      scriptRevision: "pending",
      sourceText: "#Start\n@set route:\"old\"\n@goto game-a/chapter-02.nani#Start"
    });
    const chapter = await inspectVnDebugEntry(runtimeEntry, {
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
    const changedOpening = await inspectVnDebugEntry(runtimeEntry, {
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
      vnActive: true
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
    const opening = await inspectVnDebugEntry(runtimeEntry, {
      scriptPath: "game-a/opening.nani",
      scriptRevision: "pending",
      sourceText: "#Start\n@goto game-a/chapter-02.nani#Start"
    });
    const chapter = await inspectVnDebugEntry(runtimeEntry, {
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
    const changedChapter = await inspectVnDebugEntry(runtimeEntry, {
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
      vnActive: false
    })).resolves.toMatchObject({
      kind: "retain-last-known-good",
      reason: "catalog-link-error",
      message: expect.stringContaining("#Start")
    });
  });

  it("separates inactive adoption from active sessions that have no fixed point", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const sourceText = "#Start\nNarrator: Changed.|#changed|";
    const candidate = await inspectVnDebugEntry(activeEntry.entry, { ...activeEntry.source, sourceText });
    const candidateUpdate = update(sourceText, candidate.revision);

    await expect(prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: candidateUpdate,
      vnActive: false
    })).resolves.toMatchObject({ kind: "adopt-for-next-start" });
    await expect(prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: candidateUpdate,
      vnActive: true
    })).resolves.toMatchObject({ kind: "require-preview-target" });
  });

  it("honors cancellation before any candidate can reach the commit boundary", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const controller = new AbortController();
    controller.abort();

    await expect(prepareVnDevtoolsCandidateUpdate({
      activeCandidate: activeEntry,
      update: update(activeEntry.source.sourceText, activeEntry.source.scriptRevision),
      vnActive: true,
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
  const inspection = await inspectVnDebugEntry(entry, declared);
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
