import { describe, expect, it } from "vitest";
import type { VnRuntimeEntry } from "@v-ronpa/app-vn-runtime";
import { inspectVnDebugEntry } from "@v-ronpa/app-vn-runtime/debug";
import { prepareVnDevtoolsInitialCandidate } from "./initialCandidate";
import type { NaniDevtoolsViteInitialCandidate } from "./viteProtocol";

describe("Nani devtools initial candidate handshake", () => {
  it("keeps an invalid or server/browser-mismatched snapshot read-only", async () => {
    const generatedEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const invalidSource = "#Start\n#Start";
    const changedSource = "#Start\nNarrator: Changed.|#changed|";

    await expect(prepareVnDevtoolsInitialCandidate({
      activeEntry: { ...generatedEntry, sourceText: invalidSource },
      candidate: candidate(invalidSource, null),
      vnActive: false
    })).resolves.toMatchObject({ kind: "retain-read-only", reason: "invalid-source" });
    await expect(prepareVnDevtoolsInitialCandidate({
      activeEntry: { ...generatedEntry, sourceText: changedSource },
      candidate: candidate(changedSource, "sha256:server-disagrees"),
      vnActive: false
    })).resolves.toMatchObject({ kind: "retain-read-only", reason: "revision-mismatch" });
  });

  it("rejects a cached server snapshot that does not match the active raw source", async () => {
    const staleSource = "#Start\nNarrator: Generated.|#line|";
    const staleInspection = await inspectVnDebugEntry({
      id: "opening",
      scriptPath: "game-a/opening.nani",
      scriptRevision: "sha256:pending",
      sourceText: staleSource,
      startLabel: "Start"
    });
    const activeEntry = {
      ...(await canonicalEntry("#Start\nNarrator: Saved while refreshing.|#line|")),
      // Reproduce generated metadata still naming the cached semantic revision.
      scriptRevision: staleInspection.revision
    };

    await expect(prepareVnDevtoolsInitialCandidate({
      activeEntry,
      candidate: candidate(staleSource, staleInspection.revision),
      vnActive: false
    })).resolves.toMatchObject({
      kind: "retain-read-only",
      reason: "source-mismatch",
      inspection: { entry: { sourceText: activeEntry.sourceText } }
    });
  });

  it("materializes a persisted target only after the initial server and browser revisions agree", async () => {
    const generatedEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const sourceText = "#Start\n@set route:\"restored\"\nNarrator: Restored.|#active|";
    const activeEntry = { ...generatedEntry, sourceText };
    const initialInspection = await inspectVnDebugEntry(activeEntry);
    const prepared = await prepareVnDevtoolsInitialCandidate({
      activeEntry,
      candidate: candidate(sourceText, initialInspection.revision),
      pinnedTarget: (await inspectVnDebugEntry(generatedEntry)).commands[0]!.anchor,
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
    const activeEntry = { ...generatedEntry, sourceText };
    const inspection = await inspectVnDebugEntry({ ...activeEntry, sourceText });
    const initialCandidate = candidate(sourceText, inspection.revision);

    await expect(prepareVnDevtoolsInitialCandidate({
      activeEntry,
      candidate: initialCandidate,
      vnActive: false
    })).resolves.toMatchObject({ kind: "adopt-for-next-start", expectedRevision: inspection.revision });
    await expect(prepareVnDevtoolsInitialCandidate({
      activeEntry,
      candidate: initialCandidate,
      vnActive: true
    })).resolves.toMatchObject({ kind: "require-preview-target", expectedRevision: inspection.revision });
  });
});

async function canonicalEntry(sourceText: string): Promise<VnRuntimeEntry> {
  return (await inspectVnDebugEntry({
    id: "opening",
    scriptPath: "game-a/opening.nani",
    scriptRevision: "sha256:declared",
    sourceText,
    startLabel: "Start"
  })).entry;
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
