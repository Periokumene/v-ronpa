import { describe, expect, it, vi } from "vitest";
import { advanceVnSession } from "@v-ronpa/app-vn-session";
import type { VnEntryDef, VnRuntimeScriptCatalog } from "@v-ronpa/contracts";
import { compileVnRuntimeCatalog } from "./runtimeCatalog";
import { coordinateVnScriptNavigation } from "./runtimeNavigationCoordinator";

const entry: VnEntryDef = {
  id: "vn:test",
  title: "Test",
  initialScriptPath: "game/a.nani",
  startLabel: "Start",
  profile: "vn2d",
  assetRefs: []
};

describe("runtime script navigation coordinator", () => {
  it("records every script executed during an invisible chained transition", async () => {
    const catalog = compile([
      source("game/a.nani", "#Start\n@goto game/b.nani#Start"),
      source("game/b.nani", "#Start\n@set crossed:true\n@goto game/c.nani#Start"),
      source("game/c.nani", "#Start\nNarrator: Done.|#done|")
    ]);
    const prepareScript = vi.fn(async () => ({ ok: true as const }));
    const first = advanceVnSession(catalog.recordsByPath.get("game/a.nani")!.bootSession, "start");
    const result = await coordinateVnScriptNavigation({
      catalog,
      isCancelled: () => false,
      prepareScript,
      source: "start",
      step: first
    });

    expect(result).toMatchObject({
      ok: true,
      executedScriptPaths: ["game/a.nani", "game/b.nani", "game/c.nani"]
    });
    if (result.ok) expect(result.session.story.variables.crossed).toBe(true);
    expect(prepareScript).toHaveBeenCalledTimes(2);
  });

  it("rejects loops and cancellation without returning a committable session", async () => {
    const catalog = compile([
      source("game/a.nani", "#Start\n@goto game/b.nani#Start"),
      source("game/b.nani", "#Start\n@goto game/a.nani#Start")
    ]);
    const first = advanceVnSession(catalog.recordsByPath.get("game/a.nani")!.bootSession, "start");
    const loop = await coordinateVnScriptNavigation({
      catalog,
      isCancelled: () => false,
      maxTransitions: 2,
      prepareScript: async () => ({ ok: true }),
      source: "start",
      step: first
    });
    const cancelled = await coordinateVnScriptNavigation({
      catalog,
      isCancelled: () => true,
      prepareScript: async () => ({ ok: true }),
      source: "start",
      step: first
    });

    expect(loop).toMatchObject({ ok: false, code: "script-navigation-loop" });
    expect(cancelled).toMatchObject({ ok: false, code: "operation-cancelled", cancelled: true });
  });

  it("returns no candidate session when target presentation preparation fails", async () => {
    const catalog = compile([
      source("game/a.nani", "#Start\n@set retained:true\n@goto game/b.nani#Start"),
      source("game/b.nani", "#Start\nNarrator: Must not commit.")
    ]);
    const first = advanceVnSession(catalog.recordsByPath.get("game/a.nani")!.bootSession, "start");
    const result = await coordinateVnScriptNavigation({
      catalog,
      isCancelled: () => false,
      prepareScript: async () => ({ ok: false, code: "asset-failed", message: "Character upload failed." }),
      source: "start",
      step: first
    });

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      code: "presentation-prepare-failed",
      message: "Character upload failed."
    });
    expect("session" in result).toBe(false);
  });
});

function compile(catalog: VnRuntimeScriptCatalog) {
  return compileVnRuntimeCatalog(entry, catalog);
}

function source(scriptPath: string, sourceText: string) {
  return { scriptPath, sourceText, scriptRevision: `revision:${scriptPath}` };
}
