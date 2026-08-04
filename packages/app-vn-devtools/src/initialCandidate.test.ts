import { describe, expect, it } from "vitest";
import type { VnEntryDef, VnRuntimeScriptSource } from "@v-ronpa/contracts";
import { inspectVnDebugScript as inspectVnDebugScriptRaw } from "@v-ronpa/app-vn-runtime/debug";
import { prepareVnDevtoolsInitialCandidate } from "./initialCandidate";
import type { VnDevtoolsScriptCandidate } from "./scriptCandidate";
import type { NaniDevtoolsViteSourceCandidate } from "./viteProtocol";

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
      requirements: []
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
      catalog: [generated.source],
      sourceDiagnosticPolicy: "allow-recoverable-command-errors"
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

  it("restores a persisted staged-line pin at the final stage", async () => {
    const generatedEntry = await canonicalEntry("#Start\nNarrator: A[-]B|#staged_line|");
    const sourceText = "#Start\nNarrator: A[-]B[-]C|#staged_line|";
    const activeEntry = withSource(generatedEntry, sourceText);
    const inspection = await inspectVnDebugScript(activeEntry.entry, activeEntry.source);
    const oldInspection = await inspectVnDebugScript(generatedEntry.entry, generatedEntry.source);
    const prepared = await prepareVnDevtoolsInitialCandidate({
      activeCandidate: activeEntry,
      candidate: candidate(sourceText, inspection.revision),
      pinnedTarget: oldInspection.commands[0]!.anchor,
      vnActive: true
    });

    expect(prepared.kind).toBe("materialize-pinned-target");
    if (prepared.kind !== "materialize-pinned-target" || prepared.result.status !== "ready") return;
    expect(prepared.result.resolvedTarget.stableId).toBe("print:staged_line:stage:final");
    expect(prepared.result.checkpoint.story.text?.current?.text).toBe("ABC");
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
      requirements: []
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
      source: chapter.source,
      sourceDiagnosticPolicy: "allow-recoverable-command-errors"
    };

    const prepared = await prepareVnDevtoolsInitialCandidate({
      activeCandidate,
      candidate: {
        entryId: runtimeEntry.id,
        scope: "production",
        scriptPath: chapter.source.scriptPath,
        sourceText: chapter.source.sourceText,
        serverRevision: chapter.revision,
        executionDisposition: "runnable",
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
      requirements: []
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
      source: brokenChapter.source,
      sourceDiagnosticPolicy: "allow-recoverable-command-errors"
    };

    await expect(prepareVnDevtoolsInitialCandidate({
      activeCandidate,
      candidate: {
        entryId: runtimeEntry.id,
        scope: "production",
        scriptPath: brokenChapter.source.scriptPath,
        sourceText: brokenChapter.source.sourceText,
        serverRevision: brokenChapter.revision,
        executionDisposition: "runnable",
        diagnostics: []
      },
      vnActive: false
    })).resolves.toMatchObject({
      kind: "retain-read-only",
      reason: "catalog-link-error",
      message: expect.stringContaining("#Start")
    });

    const fast = await prepareVnDevtoolsInitialCandidate({
      activeCandidate,
      candidate: {
        entryId: runtimeEntry.id,
        scope: "production",
        scriptPath: brokenChapter.source.scriptPath,
        sourceText: brokenChapter.source.sourceText,
        serverRevision: brokenChapter.revision,
        executionDisposition: "runnable",
        diagnostics: []
      },
      pinnedTarget: brokenChapter.commands[0]!.anchor,
      materializationMode: "fast-current-script",
      vnActive: true
    });
    expect(fast).toMatchObject({
      kind: "materialize-pinned-target",
      catalogVerified: false,
      result: {
        status: "ready",
        provenance: {
          mode: "fast-current-script",
          originScriptPath: "game-a/chapter-02.nani"
        },
        executedScriptPaths: ["game-a/chapter-02.nani"]
      }
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
    requirements: []
  };
  const source: VnRuntimeScriptSource = {
    scriptPath: entry.initialScriptPath,
    scriptRevision: "sha256:declared",
    sourceText
  };
  const inspection = await inspectVnDebugScript(entry, source);
  return {
    entry,
    source: inspection.source,
    catalog: [inspection.source],
    sourceDiagnosticPolicy: "allow-recoverable-command-errors"
  };
}

function inspectVnDebugScript(entry: VnEntryDef, source: VnRuntimeScriptSource) {
  return inspectVnDebugScriptRaw(entry, source, "allow-recoverable-command-errors");
}

function withSource(
  candidate: VnDevtoolsScriptCandidate,
  sourceText: string,
  scriptRevision = candidate.source.scriptRevision
): VnDevtoolsScriptCandidate {
  const source = { ...candidate.source, sourceText, scriptRevision };
  return { ...candidate, source, catalog: [source] };
}

function candidate(sourceText: string, serverRevision: string | null): NaniDevtoolsViteSourceCandidate {
  return {
    entryId: "opening",
    scope: "production",
    scriptPath: "game-a/opening.nani",
    sourceText,
    serverRevision,
    executionDisposition: serverRevision ? "runnable" : "fatal",
    diagnostics: []
  };
}
