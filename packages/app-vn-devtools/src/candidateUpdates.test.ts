import { describe, expect, it } from "vitest";
import { inspectVnDebugEntry, type VnDebugDecisionTrace } from "@v-ronpa/app-vn-runtime/debug";
import type { VnRuntimeEntry } from "@v-ronpa/app-vn-runtime";
import { prepareVnDevtoolsCandidateUpdate } from "./candidateUpdates";
import type { NaniDevtoolsViteUpdate } from "./viteProtocol";

describe("Nani devtools candidate update preparation", () => {
  it("retains last-known-good state for invalid source and server/browser revision disagreement", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const invalid = await prepareVnDevtoolsCandidateUpdate({
      activeEntry,
      update: update("#Start\n#Start", null),
      vnActive: true
    });
    const mismatch = await prepareVnDevtoolsCandidateUpdate({
      activeEntry,
      update: update("#Start\nNarrator: Changed.|#changed|", "sha256:server-disagrees"),
      vnActive: true
    });

    expect(invalid).toMatchObject({ kind: "retain-last-known-good", reason: "invalid-source" });
    expect(mismatch).toMatchObject({ kind: "retain-last-known-good", reason: "revision-mismatch" });
  });

  it("refreshes source mapping without materializing when executable semantics are unchanged", async () => {
    const activeEntry = await canonicalEntry("#Start\n; before\nNarrator: Active.|#active|");
    const prepared = await prepareVnDevtoolsCandidateUpdate({
      activeEntry,
      update: update("#Start\n; reformatted comment\nNarrator: Active.|#active|", activeEntry.scriptRevision),
      vnActive: true
    });

    expect(prepared.kind).toBe("refresh-source-mapping");
    expect(prepared.inspection.revision).toBe(activeEntry.scriptRevision);
  });

  it("materializes a changed revision through the pinned target before exposing it to the host", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const changedSource = "#Start\n@set route:\"updated\"\nNarrator: Updated.|#active|";
    const changedInspection = await inspectVnDebugEntry({ ...activeEntry, sourceText: changedSource });
    const activeInspection = await inspectVnDebugEntry(activeEntry);
    const pinnedTarget = activeInspection.commands[0]!.anchor;
    const decisions: VnDebugDecisionTrace = { choices: [], inputs: [] };
    const prepared = await prepareVnDevtoolsCandidateUpdate({
      activeEntry,
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

  it("separates inactive adoption from active sessions that have no fixed point", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const sourceText = "#Start\nNarrator: Changed.|#changed|";
    const candidate = await inspectVnDebugEntry({ ...activeEntry, sourceText });
    const candidateUpdate = update(sourceText, candidate.revision);

    await expect(prepareVnDevtoolsCandidateUpdate({
      activeEntry,
      update: candidateUpdate,
      vnActive: false
    })).resolves.toMatchObject({ kind: "adopt-for-next-start" });
    await expect(prepareVnDevtoolsCandidateUpdate({
      activeEntry,
      update: candidateUpdate,
      vnActive: true
    })).resolves.toMatchObject({ kind: "require-preview-target" });
  });

  it("honors cancellation before any candidate can reach the commit boundary", async () => {
    const activeEntry = await canonicalEntry("#Start\nNarrator: Active.|#active|");
    const controller = new AbortController();
    controller.abort();

    await expect(prepareVnDevtoolsCandidateUpdate({
      activeEntry,
      update: update(activeEntry.sourceText, activeEntry.scriptRevision),
      vnActive: true,
      signal: controller.signal
    })).rejects.toMatchObject({ name: "AbortError" });
  });
});

async function canonicalEntry(sourceText: string): Promise<VnRuntimeEntry> {
  const inspection = await inspectVnDebugEntry({
    id: "opening",
    scriptPath: "game-a/opening.nani",
    scriptRevision: "sha256:declared",
    sourceText,
    startLabel: "Start"
  });
  return inspection.entry;
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
