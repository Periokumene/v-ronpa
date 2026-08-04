import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { NaniProjectConfig } from "@v-ronpa/nani-project";
import {
  NANI_DEVTOOLS_VITE_CATALOG_DIRTY_EVENT,
  NANI_DEVTOOLS_VITE_SNAPSHOT_MODULE_ID,
  NANI_DEVTOOLS_VITE_UPDATE_EVENT,
  createNaniDevtoolsVitePlugin,
  type NaniDevtoolsViteSnapshot
} from "./vite";

const project: NaniProjectConfig = {
  scopes: {
    production: { sourceRoot: "nani", scriptRoot: "game" },
    development: { sourceRoot: "nani-dev", scriptRoot: "game/dev" }
  },
  mainEntry: {
    id: "vn:main",
    scope: "production",
    initialScriptPath: "game/opening.nani",
    startLabel: "Start"
  },
  testEntries: {},
  voiceLocales: []
};
const emptyAssetBindings = { appId: "game", assets: [], characterAssetIdByCharacterId: {} } as const;

describe("Nani devtools Vite snapshot bridge", () => {
  it("serves a complete production+development snapshot and omits it from builds", async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await mkdir(join(root, "nani-dev", "drafts"), { recursive: true });
    await writeFile(join(root, "nani", "opening.nani"), "#Start\nNarrator: Open.|#open|");
    await writeFile(join(root, "nani-dev", "drafts", "one.nani"), "Narrator: Draft.");
    const plugin = createNaniDevtoolsVitePlugin({
      project,
      entry: project.mainEntry,
      scopes: ["production", "development"],
      root,
      assetBindings: emptyAssetBindings
    });
    callConfigResolved(plugin, "serve");
    const resolved = callResolveId(plugin, NANI_DEVTOOLS_VITE_SNAPSHOT_MODULE_ID);
    const snapshot = parseDefaultExport(await callLoad(plugin, resolved));

    expect(snapshot.generation).toBe(1);
    expect(snapshot.entry).toMatchObject({ id: "vn:main", initialScriptPath: "game/opening.nani" });
    expect(snapshot.scripts.map((script) => [script.scope, script.scriptPath])).toEqual([
      ["development", "game/dev/drafts/one.nani"],
      ["production", "game/opening.nani"]
    ]);

    callConfigResolved(plugin, "build");
    expect(await callLoad(plugin, resolved)).toBe("export default null;");
  });

  it("keeps recoverable command errors runnable and parser errors source-only", async () => {
    const recoverableRoot = await fixtureRoot();
    await mkdir(join(recoverableRoot, "nani"), { recursive: true });
    await writeFile(join(recoverableRoot, "nani", "opening.nani"), [
      "#Start",
      "Narrator: Before.",
      "@notACommand",
      "Narrator: After."
    ].join("\n"));
    const recoverable = await loadSnapshot(recoverableRoot);
    expect(recoverable.scripts[0]).toMatchObject({
      executionDisposition: "runnable",
      diagnostics: [expect.objectContaining({
        code: "unknown-command",
        severity: "error",
        disposition: "recoverable"
      })]
    });

    const fatalRoot = await fixtureRoot();
    await mkdir(join(fatalRoot, "nani"), { recursive: true });
    await writeFile(join(fatalRoot, "nani", "opening.nani"), "#Start\n#Start");
    const fatal = await loadSnapshot(fatalRoot);
    expect(fatal.scripts[0]).toMatchObject({
      executionDisposition: "fatal",
      diagnostics: [expect.objectContaining({ code: "duplicate-label", disposition: "fatal" })]
    });
  });

  it("rejects recoverable command errors during a strict production build", async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    await writeFile(join(root, "nani", "opening.nani"), "#Start\n@notACommand");
    const plugin = createNaniDevtoolsVitePlugin({
      project,
      entry: project.mainEntry,
      scopes: ["production"],
      root,
      assetBindings: emptyAssetBindings
    });
    callConfigResolved(plugin, "build");

    await expect(callBuildStart(plugin)).rejects.toThrow(/Unknown \.nani command/u);
  });

  it("emits monotonic source updates for edits and a catalog-dirty event for adds", async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, "nani"), { recursive: true });
    const opening = join(root, "nani", "opening.nani");
    await writeFile(opening, "#Start\nNarrator: Open.");
    const plugin = createNaniDevtoolsVitePlugin({
      project,
      entry: project.mainEntry,
      scopes: ["production"],
      root,
      assetBindings: emptyAssetBindings
    });
    callConfigResolved(plugin, "serve");
    const handlers = new Map<string, (file: string) => void>();
    const send = vi.fn();
    const moduleGraph = { getModuleById: vi.fn(), invalidateModule: vi.fn() };
    callConfigureServer(plugin, {
      watcher: { on: (event: string, handler: (file: string) => void) => handlers.set(event, handler) },
      ws: { send },
      moduleGraph
    });
    await callLoad(plugin, callResolveId(plugin, NANI_DEVTOOLS_VITE_SNAPSHOT_MODULE_ID));
    await writeFile(opening, "#Start\nNarrator: Changed.");
    await callHotUpdate(plugin, {
      file: opening,
      read: async () => "#Start\nNarrator: Changed.",
      server: { ws: { send }, moduleGraph }
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      event: NANI_DEVTOOLS_VITE_UPDATE_EVENT,
      data: expect.objectContaining({ updateId: 1, executionDisposition: "runnable" })
    }));

    const added = join(root, "nani", "added.nani");
    handlers.get("add")?.(added);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      event: NANI_DEVTOOLS_VITE_CATALOG_DIRTY_EVENT,
      data: expect.objectContaining({ reason: "add" })
    }));
  });
});

async function loadSnapshot(root: string): Promise<NaniDevtoolsViteSnapshot> {
  const plugin = createNaniDevtoolsVitePlugin({
    project,
    entry: project.mainEntry,
    scopes: ["production"],
    root,
    assetBindings: emptyAssetBindings
  });
  callConfigResolved(plugin, "serve");
  return parseDefaultExport(await callLoad(plugin, callResolveId(plugin, NANI_DEVTOOLS_VITE_SNAPSHOT_MODULE_ID)));
}

async function fixtureRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "v-ronpa-vite-nani-"));
}

function callConfigResolved(plugin: ReturnType<typeof createNaniDevtoolsVitePlugin>, command: "serve" | "build") {
  (plugin.configResolved as (config: { command: string }) => void)?.({ command });
}

function callResolveId(plugin: ReturnType<typeof createNaniDevtoolsVitePlugin>, id: string): string {
  return (plugin.resolveId as (id: string) => string | undefined)?.(id) ?? id;
}

async function callLoad(plugin: ReturnType<typeof createNaniDevtoolsVitePlugin>, id: string): Promise<string> {
  return await (plugin.load as (id: string) => string | Promise<string> | undefined)?.(id) ?? "";
}

function callConfigureServer(plugin: ReturnType<typeof createNaniDevtoolsVitePlugin>, server: unknown) {
  (plugin.configureServer as (server: unknown) => void)?.(server);
}

async function callHotUpdate(plugin: ReturnType<typeof createNaniDevtoolsVitePlugin>, context: unknown) {
  return (plugin.handleHotUpdate as (context: unknown) => unknown)?.(context);
}

async function callBuildStart(plugin: ReturnType<typeof createNaniDevtoolsVitePlugin>) {
  return (plugin.buildStart as (this: { error: (message: string) => never }) => unknown)?.call({
    error(message: string): never {
      throw new Error(message);
    }
  });
}

function parseDefaultExport(source: string): NaniDevtoolsViteSnapshot {
  return JSON.parse(source.replace(/^export default /u, "").replace(/;$/u, ""));
}
