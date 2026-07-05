import { describe, expect, it, vi } from "vitest";
import { gameANaniFullReloadPlugin } from "./vite.config";

describe("game-a Vite config", () => {
  it("forces a full page reload for .nani updates", async () => {
    const plugin = gameANaniFullReloadPlugin();
    const handleHotUpdate = plugin.handleHotUpdate;
    const send = vi.fn();

    expect(typeof handleHotUpdate).toBe("function");
    const result = await (handleHotUpdate as (ctx: {
      file: string;
      server: { ws: { send: (payload: unknown) => void } };
    }) => unknown)({
      file: "/workspace/apps/game-a/src/nani/opening.nani",
      server: { ws: { send } }
    });

    expect(send).toHaveBeenCalledWith({ type: "full-reload" });
    expect(result).toEqual([]);
  });

  it("leaves non-.nani updates to Vite's normal hot update handling", async () => {
    const plugin = gameANaniFullReloadPlugin();
    const handleHotUpdate = plugin.handleHotUpdate;
    const send = vi.fn();

    expect(typeof handleHotUpdate).toBe("function");
    const result = await (handleHotUpdate as (ctx: {
      file: string;
      server: { ws: { send: (payload: unknown) => void } };
    }) => unknown)({
      file: "/workspace/apps/game-a/src/App.tsx",
      server: { ws: { send } }
    });

    expect(send).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});
