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
  requirements: []
};

describe("runtime script navigation coordinator", () => {
  it("keeps normal play runnable around a compiler-removed command only under the development policy", () => {
    const catalog = [source("game/a.nani", [
      "#Start",
      "Narrator: Before.",
      "@notACommand bad:true",
      "Narrator: After."
    ].join("\n"))];
    const recovered = compileVnRuntimeCatalog(entry, catalog, "allow-recoverable-command-errors");
    const strict = compileVnRuntimeCatalog(entry, catalog, "strict");
    const record = recovered.recordsByPath.get("game/a.nani")!;

    expect(record.hasFatalSourceDiagnostics).toBe(false);
    expect(record.script.commands.map((command) => command.commandId)).toEqual(["print", "print"]);
    expect(strict.recordsByPath.get("game/a.nani")?.hasFatalSourceDiagnostics).toBe(true);

    const before = advanceVnSession(record.bootSession, "start");
    const after = advanceVnSession(before.session, "manual");
    expect(before.session.story.text?.current?.text).toBe("Before.");
    expect(after.session.story.text?.current?.text).toBe("After.");
  });

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

  it("drops pre-boundary pinp commands and keeps the target script pinp", async () => {
    const catalog = compile([
      source("game/a.nani", "#Start\n@pinp props:old effect:none\n@goto game/b.nani#Start"),
      source("game/b.nani", "#Start\n@pinp props:new effect:none\nNarrator: Done.")
    ]);
    const first = advanceVnSession(catalog.recordsByPath.get("game/a.nani")!.bootSession, "start");
    const result = await coordinateVnScriptNavigation({
      catalog,
      isCancelled: () => false,
      prepareScript: async () => ({ ok: true }),
      source: "start",
      step: first
    });

    expect(result).toMatchObject({ ok: true, crossedScript: true });
    if (!result.ok) throw new Error(result.message);
    expect(result.runtimeCommands.filter((command) => command.commandId === "pinp")).toHaveLength(1);
    expect(result.runtimeCommands.find((command) => command.commandId === "pinp")?.params.assetId).toBe("props:new");
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
  return compileVnRuntimeCatalog(entry, catalog, "strict");
}

function source(scriptPath: string, sourceText: string) {
  return { scriptPath, sourceText, scriptRevision: `revision:${scriptPath}` };
}
