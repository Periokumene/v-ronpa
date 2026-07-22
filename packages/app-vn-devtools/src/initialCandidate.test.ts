import { describe, expect, it } from "vitest";
import type { VnEntryDef, VnRuntimeScriptSource } from "@v-ronpa/contracts";
import { inspectVnDebugScript } from "@v-ronpa/app-vn-runtime/debug";
import { prepareVnDevtoolsInitialCandidate } from "./initialCandidate";
import type { VnDevtoolsScriptCandidate } from "./scriptCandidate";
import type { NaniDevtoolsViteInitialCandidate } from "./viteProtocol";

describe("Nani devtools initial candidate handshake", () => {
  it("keeps an invalid or server/browser-mismatched snapshot read-only", async () => {
    const generatedEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const invalidSource = "#Start\n#Start";
    const changedSource = "#Start\nNarrator: Changed.|#changed|";

    await expect(prepareVnDevtoolsInitialCandidate({
      activeCandidate: withSource(generatedEntry, invalidSource),
      candidate: candidate(invalidSource, null),
      vnActive: false
    })).resolves.toMatchObject({ kind: "retain-read-only", reason: "invalid-source" });
    await expect(prepareVnDevtoolsInitialCandidate({
      activeCandidate: withSource(generatedEntry, changedSource),
      candidate: candidate(changedSource, "sha256:server-disagrees"),
      vnActive: false
    })).resolves.toMatchObject({ kind: "retain-read-only", reason: "revision-mismatch" });
  });

  it("adopts a verified saved source when generated last-known-good content is stale", async () => {
    const generatedSource = "#Start\nNarrator: Generated.|#line|";
    const runtimeEntry: VnEntryDef = {
      id: "opening",
      title: "Opening",
      initialScriptPath: "game-a/opening.nani",
      startLabel: "Start",
      profile: "vn2d",
      assetRefs: []
    };
    const generated = await inspectVnDebugScript(runtimeEntry, {
      scriptPath: runtimeEntry.initialScriptPath,
      scriptRevision: "pending",
      sourceText: generatedSource
    });
    const savedSource = "#Start\nNarrator: Saved before refresh.|#line|";
    const saved = await inspectVnDebugScript(runtimeEntry, {
      ...generated.source,
      sourceText: savedSource
    });
    const activeEntry: VnDevtoolsScriptCandidate = {
      entry: runtimeEntry,
      source: generated.source,
      catalog: [generated.source]
    };

    await expect(prepareVnDevtoolsInitialCandidate({
      activeCandidate: activeEntry,
      candidate: candidate(savedSource, saved.revision),
      vnActive: false
    })).resolves.toMatchObject({
      kind: "adopt-for-next-start",
      expectedRevision: saved.revision,
      inspection: { source: { sourceText: savedSource } }
    });
  });

  it("materializes a persisted target only after the initial server and browser revisions agree", async () => {
    const generatedEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const sourceText = "#Start\n@set route:\"restored\"\nNarrator: Restored.|#active|";
    const activeEntry = withSource(generatedEntry, sourceText);
    const initialInspection = await inspectVnDebugScript(activeEntry.entry, activeEntry.source);
    const prepared = await prepareVnDevtoolsInitialCandidate({
      activeCandidate: activeEntry,
      candidate: candidate(sourceText, initialInspection.revision),
      pinnedTarget: (await inspectVnDebugScript(generatedEntry.entry, generatedEntry.source)).commands[0]!.anchor,
      vnActive: false
    });

    expect(prepared.kind).toBe("materialize-pinned-target");
    if (prepared.kind !== "materialize-pinned-target") return;
    expect(prepared.result.status).toBe("ready");
    if (prepared.result.status !== "ready") return;
    expect(prepared.result.checkpoint.story.variables).toEqual({ route: "restored" });
    expect(prepared.result.checkpoint.story.text?.current?.text).toBe("Restored.");
  });

  it("adopts a verified changed revision only while inactive and leaves active sessions unmodified", async () => {
    const generatedEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const sourceText = "#Start\nNarrator: Changed.|#changed|";
    const activeEntry = withSource(generatedEntry, sourceText);
    const inspection = await inspectVnDebugScript(activeEntry.entry, activeEntry.source);
    const initialCandidate = candidate(sourceText, inspection.revision);

    await expect(prepareVnDevtoolsInitialCandidate({
      activeCandidate: activeEntry,
      candidate: initialCandidate,
      vnActive: false
    })).resolves.toMatchObject({ kind: "adopt-for-next-start", expectedRevision: inspection.revision });
    await expect(prepareVnDevtoolsInitialCandidate({
      activeCandidate: activeEntry,
      candidate: initialCandidate,
      vnActive: true
    })).resolves.toMatchObject({ kind: "require-preview-target", expectedRevision: inspection.revision });
  });

  it("restores a persisted fixed point from another catalog script without rejecting the viewed source", async () => {
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
      sourceText: "#Start\nNarrator: Opening.|#opening|"
    });
    const chapter = await inspectVnDebugScript(runtimeEntry, {
      scriptPath: "game-a/chapter-02.nani",
      scriptRevision: "pending",
      sourceText: "#Start\nNarrator: Chapter.|#chapter|"
    });
    const activeCandidate: VnDevtoolsScriptCandidate = {
      entry: runtimeEntry,
      catalog: [opening.source, chapter.source],
      source: chapter.source
    };

    const prepared = await prepareVnDevtoolsInitialCandidate({
      activeCandidate,
      candidate: {
        entryId: runtimeEntry.id,
        scriptPath: chapter.source.scriptPath,
        sourceText: chapter.source.sourceText,
        serverRevision: chapter.revision,
        diagnostics: []
      },
      pinnedTarget: opening.commands[0]!.anchor,
      vnActive: false
    });

    expect(prepared.kind).toBe("materialize-pinned-target");
    if (prepared.kind !== "materialize-pinned-target") return;
    expect(prepared.inspection.source.scriptPath).toBe("game-a/chapter-02.nani");
    expect(prepared.result).toMatchObject({
      status: "ready",
      checkpoint: { script: { scriptPath: "game-a/opening.nani" } }
    });
  });

  it("rejects an isolated valid source when it breaks a cross-script catalog link", async () => {
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
    const brokenChapter = await inspectVnDebugScript(runtimeEntry, {
      scriptPath: "game-a/chapter-02.nani",
      scriptRevision: "pending",
      sourceText: "#Other\nNarrator: Missing Start."
    });
    const activeCandidate: VnDevtoolsScriptCandidate = {
      entry: runtimeEntry,
      catalog: [opening.source, brokenChapter.source],
      source: brokenChapter.source
    };

    await expect(prepareVnDevtoolsInitialCandidate({
      activeCandidate,
      candidate: {
        entryId: runtimeEntry.id,
        scriptPath: brokenChapter.source.scriptPath,
        sourceText: brokenChapter.source.sourceText,
        serverRevision: brokenChapter.revision,
        diagnostics: []
      },
      vnActive: false
    })).resolves.toMatchObject({
      kind: "retain-read-only",
      reason: "catalog-link-error",
      message: expect.stringContaining("#Start")
    });
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
  const source: VnRuntimeScriptSource = {
    scriptPath: entry.initialScriptPath,
    scriptRevision: "sha256:declared",
    sourceText
  };
  const inspection = await inspectVnDebugScript(entry, source);
  return { entry, source: inspection.source, catalog: [inspection.source] };
}

function withSource(
  candidate: VnDevtoolsScriptCandidate,
  sourceText: string,
  scriptRevision = candidate.source.scriptRevision
): VnDevtoolsScriptCandidate {
  const source = { ...candidate.source, sourceText, scriptRevision };
  return { ...candidate, source, catalog: [source] };
}

function candidate(sourceText: string, serverRevision: string | null): NaniDevtoolsViteInitialCandidate {
  return {
    entryId: "opening",
    scriptPath: "game-a/opening.nani",
    sourceText,
    serverRevision,
    diagnostics: []
  };
}
