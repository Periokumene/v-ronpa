import { describe, expect, it, vi } from "vitest";
import {
  NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID,
  NANI_DEVTOOLS_VITE_UPDATE_EVENT,
  createNaniDevtoolsVitePlugin,
  type NaniDevtoolsViteUpdate
} from "./vite";

describe("Nani devtools Vite source bridge", () => {
  it("serves a Node-authored initial source candidate and omits it from production builds", async () => {
    const plugin = createNaniDevtoolsVitePlugin({
      root: process.cwd(),
      entries: [{
        sourceFile: "apps/game-a/src/nani/opening.nani",
        scriptPath: "game-a/opening.nani",
        entryId: "vn:game-a-opening"
      }]
    });
    callConfigResolved(plugin.configResolved, "serve");
    const resolvedId = callResolveId(plugin.resolveId, NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID);
    const moduleSource = await callLoad(plugin.load, resolvedId);
    const candidates = parseDefaultExport(moduleSource);

    expect(candidates).toEqual([
      expect.objectContaining({
        entryId: "vn:game-a-opening",
        scriptPath: "game-a/opening.nani",
        sourceText: expect.stringContaining("#Start"),
        serverRevision: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        diagnostics: expect.any(Array)
      })
    ]);

    callConfigResolved(plugin.configResolved, "build");
    expect(await callLoad(plugin.load, resolvedId)).toBe("export default [];");
  });

  it("emits compiled candidate source and monotonic server revisions without reloading", async () => {
    const plugin = createNaniDevtoolsVitePlugin({
      root: "/workspace",
      entries: [{ sourceFile: "apps/game-a/src/nani/opening.nani", scriptPath: "game-a/opening.nani", entryId: "opening" }]
    });
    const send = vi.fn();
    const handleHotUpdate = expectHotUpdateHandler(plugin.handleHotUpdate);

    const firstResult = await handleHotUpdate({
      file: "/workspace/apps/game-a/src/nani/opening.nani",
      read: async () => "#Start\nnar: Hello.",
      server: { ws: { send } }
    });
    const secondResult = await handleHotUpdate({
      file: "/workspace/apps/game-a/src/nani/opening.nani",
      read: async () => "#Start\nnar: Changed.",
      server: { ws: { send } }
    });

    expect(firstResult).toEqual([]);
    expect(secondResult).toEqual([]);
    expect(send).toHaveBeenCalledTimes(2);
    const firstPayload = customUpdate(send.mock.calls[0]?.[0]);
    const secondPayload = customUpdate(send.mock.calls[1]?.[0]);
    expect(firstPayload).toMatchObject({
      updateId: 1,
      entryId: "opening",
      scriptPath: "game-a/opening.nani",
      sourceText: "#Start\nnar: Hello.",
      diagnostics: []
    });
    expect(firstPayload.serverRevision).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(secondPayload.updateId).toBe(2);
    expect(secondPayload.serverRevision).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(secondPayload.serverRevision).not.toBe(firstPayload.serverRevision);
    expect(send.mock.calls[0]?.[0]).not.toMatchObject({ type: "full-reload" });
  });

  it("returns diagnostics and a null revision for an invalid candidate while retaining the source", async () => {
    const plugin = createNaniDevtoolsVitePlugin({
      root: "/workspace",
      entries: [{ sourceFile: "opening.nani", scriptPath: "game-a/opening.nani", entryId: "opening" }]
    });
    const send = vi.fn();
    const result = await expectHotUpdateHandler(plugin.handleHotUpdate)({
      file: "/workspace/opening.nani",
      read: async () => "#Start\n#Start",
      server: { ws: { send } }
    });

    expect(result).toEqual([]);
    const payload = customUpdate(send.mock.calls[0]?.[0]);
    expect(payload.sourceText).toBe("#Start\n#Start");
    expect(payload.serverRevision).toBeNull();
    expect(payload.diagnostics).toEqual([
      expect.objectContaining({ source: "parser", severity: "error", lineNumber: 2, message: "Duplicate label: Start" })
    ]);
  });

  it("locates compiler parameter errors on their authored source line", async () => {
    const plugin = createNaniDevtoolsVitePlugin({
      root: "/workspace",
      entries: [{ sourceFile: "opening.nani", scriptPath: "game-a/opening.nani", entryId: "opening" }]
    });
    const send = vi.fn();
    await expectHotUpdateHandler(plugin.handleHotUpdate)({
      file: "/workspace/opening.nani",
      read: async () => "#Start\nNarrator: Before.\n@back bg:main time:fast",
      server: { ws: { send } }
    });

    expect(customUpdate(send.mock.calls[0]?.[0]).diagnostics).toEqual([
      expect.objectContaining({
        source: "compiler",
        code: "invalid-command-param",
        severity: "error",
        lineNumber: 3,
        columnNumber: 1
      })
    ]);
  });

  it("assigns invocation-order ids even when asynchronous reads finish out of order", async () => {
    const plugin = createNaniDevtoolsVitePlugin({
      root: "/workspace",
      entries: [{ sourceFile: "opening.nani", scriptPath: "game-a/opening.nani", entryId: "opening" }]
    });
    const send = vi.fn();
    let finishFirst!: (source: string) => void;
    const firstRead = new Promise<string>((resolve) => {
      finishFirst = resolve;
    });
    const handleHotUpdate = expectHotUpdateHandler(plugin.handleHotUpdate);
    const first = handleHotUpdate({
      file: "/workspace/opening.nani",
      read: () => firstRead,
      server: { ws: { send } }
    });
    const second = handleHotUpdate({
      file: "/workspace/opening.nani",
      read: async () => "#Start\nNarrator: Newest.",
      server: { ws: { send } }
    });
    await second;
    finishFirst("#Start\nNarrator: Older.");
    await first;

    expect(customUpdate(send.mock.calls[0]?.[0]).updateId).toBe(2);
    expect(customUpdate(send.mock.calls[1]?.[0]).updateId).toBe(1);
  });

  it("invalidates the initial snapshot after a source save without consuming an HMR update id", async () => {
    const plugin = createNaniDevtoolsVitePlugin({
      root: "/workspace",
      entries: [{ sourceFile: "opening.nani", scriptPath: "game-a/opening.nani", entryId: "opening" }]
    });
    const resolvedId = callResolveId(plugin.resolveId, NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID);
    const initialModule = { id: resolvedId };
    const invalidateModule = vi.fn();
    const send = vi.fn();
    let finishRead!: () => void;
    const update = expectHotUpdateHandler(plugin.handleHotUpdate)({
      file: "/workspace/opening.nani",
      read: async () => {
        await new Promise<void>((resolve) => {
          finishRead = resolve;
        });
        return "#Start\nNarrator: Saved.";
      },
      server: {
        ws: { send },
        moduleGraph: {
          getModuleById: vi.fn(() => initialModule),
          invalidateModule
        }
      }
    });

    expect(invalidateModule).toHaveBeenCalledWith(initialModule);
    expect(send).not.toHaveBeenCalled();
    finishRead();
    await update;
    expect(customUpdate(send.mock.calls[0]?.[0]).updateId).toBe(1);
  });

  it("ignores every file outside the configured .nani allow-list", async () => {
    const plugin = createNaniDevtoolsVitePlugin({
      root: "/workspace",
      entries: [{ sourceFile: "opening.nani", scriptPath: "game-a/opening.nani", entryId: "opening" }]
    });
    const send = vi.fn();
    const read = vi.fn(async () => "#Other");
    const result = await expectHotUpdateHandler(plugin.handleHotUpdate)({
      file: "/workspace/other.nani",
      read,
      server: { ws: { send } }
    });

    expect(result).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects non-Nani and duplicate source configuration up front", () => {
    expect(() =>
      createNaniDevtoolsVitePlugin({ entries: [{ sourceFile: "opening.ts", scriptPath: "opening.nani", entryId: "opening" }] })
    ).toThrow("must end with .nani");
    expect(() =>
      createNaniDevtoolsVitePlugin({
        root: "/workspace",
        entries: [
          { sourceFile: "opening.nani", scriptPath: "opening.nani", entryId: "opening" },
          { sourceFile: "./opening.nani", scriptPath: "other.nani", entryId: "other" }
        ]
      })
    ).toThrow("configured more than once");
  });
});

interface TestHotUpdateContext {
  file: string;
  read: () => Promise<string>;
  server: {
    ws: { send: (payload: unknown) => void };
    moduleGraph?: {
      getModuleById: (id: string) => unknown;
      invalidateModule: (module: unknown) => void;
    };
  };
}

function expectHotUpdateHandler(handler: unknown): (context: TestHotUpdateContext) => Promise<unknown> {
  expect(typeof handler).toBe("function");
  const hotUpdate = handler as (context: TestHotUpdateContext & {
    server: TestHotUpdateContext["server"] & { moduleGraph: NonNullable<TestHotUpdateContext["server"]["moduleGraph"]> };
  }) => Promise<unknown>;
  return (context) => hotUpdate({
    ...context,
    server: {
      ...context.server,
      moduleGraph: context.server.moduleGraph ?? {
        getModuleById: () => undefined,
        invalidateModule: () => undefined
      }
    }
  });
}

function customUpdate(payload: unknown): NaniDevtoolsViteUpdate {
  expect(payload).toMatchObject({ type: "custom", event: NANI_DEVTOOLS_VITE_UPDATE_EVENT });
  return (payload as { data: NaniDevtoolsViteUpdate }).data;
}

function callConfigResolved(hook: unknown, command: "serve" | "build"): void {
  expect(typeof hook).toBe("function");
  (hook as (config: { command: "serve" | "build" }) => void)({ command });
}

function callResolveId(hook: unknown, id: string): string {
  expect(typeof hook).toBe("function");
  const resolved = (hook as (value: string) => unknown)(id);
  expect(typeof resolved).toBe("string");
  return resolved as string;
}

async function callLoad(hook: unknown, id: string): Promise<string> {
  expect(typeof hook).toBe("function");
  const source = await (hook as (value: string) => string | Promise<string>)(id);
  expect(typeof source).toBe("string");
  return source;
}

function parseDefaultExport(source: string): unknown {
  return JSON.parse(source.replace(/^export default /u, "").replace(/;$/u, ""));
}
