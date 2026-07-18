import { describe, expect, it, vi } from "vitest";
import {
  VN_DEVTOOLS_SESSION_VERSION,
  clearVnDevtoolsSessionState,
  createDefaultVnDevtoolsSessionState,
  loadVnDevtoolsSessionState,
  saveVnDevtoolsSessionState,
  type VnDevtoolsStorageLike
} from "./sessionPersistence";

describe("VN devtools session persistence", () => {
  it("persists only layout, pinned target, and decision trace data", () => {
    const storage = memoryStorage();
    const anchor = {
      kind: "command" as const,
      scriptPath: "game-a/opening.nani",
      revision: "sha256:abc",
      line: 8,
      commandIndex: 5,
      ordinal: 1,
      commandId: "choice",
      stableId: "choice:route"
    };
    const anchorWithExtras = {
      ...anchor,
      sourceCommand: "must-not-persist"
    };
    const stateWithExtras = {
      collapsed: true,
      width: 999,
      pinnedTarget: anchorWithExtras,
      decisions: [
        {
          anchor: anchorWithExtras,
          choiceId: "route",
          text: "Left",
          goto: "LeftRoute",
          previewCache: "must-not-persist"
        },
        {
          anchor: {
            ...anchorWithExtras,
            commandId: "input",
            stableId: "input:name",
            runtimeOnly: true
          },
          value: "Codex",
          pendingRequest: true
        }
      ]
    };
    expect(saveVnDevtoolsSessionState(storage, "game-a", stateWithExtras)).toBe(true);

    expect(loadVnDevtoolsSessionState(storage, "game-a")).toEqual({
      version: VN_DEVTOOLS_SESSION_VERSION,
      collapsed: true,
      width: 720,
      pinnedTarget: anchor,
      decisions: [
        { anchor, choiceId: "route", text: "Left", goto: "LeftRoute" },
        { anchor: { ...anchor, commandId: "input", stableId: "input:name" }, value: "Codex" }
      ]
    });
    expect(storage.getItem("game-a")).not.toContain("sourceText");
    expect(storage.getItem("game-a")).not.toContain("checkpoint");
    expect(storage.getItem("game-a")).not.toContain("sourceCommand");
    expect(storage.getItem("game-a")).not.toContain("previewCache");
    expect(storage.getItem("game-a")).not.toContain("runtimeOnly");
    expect(storage.getItem("game-a")).not.toContain("pendingRequest");
  });

  it("rebuilds loaded anchors and decisions from the persisted-field whitelist", () => {
    const storage = memoryStorage();
    const anchor = {
      kind: "command" as const,
      scriptPath: "game-a/opening.nani",
      revision: "sha256:abc",
      line: 8,
      commandIndex: 5,
      ordinal: 1,
      commandId: "choice",
      label: "RouteChoice",
      stableId: "choice:route",
      fingerprint: "nearby-context"
    };
    storage.setItem("game-a", JSON.stringify({
      version: VN_DEVTOOLS_SESSION_VERSION,
      collapsed: false,
      width: 420,
      transientRootState: "must-not-load",
      pinnedTarget: { ...anchor, sourceCommand: "must-not-load" },
      decisions: [
        {
          anchor: { ...anchor, materializedCheckpoint: "must-not-load" },
          choiceId: "route",
          text: "Left",
          goto: "LeftRoute",
          index: 0
        },
        {
          anchor: {
            ...anchor,
            commandId: "input",
            stableId: "input:name",
            diagnostic: "must-not-load"
          },
          value: "Codex",
          defaultValue: "Player"
        }
      ]
    }));

    expect(loadVnDevtoolsSessionState(storage, "game-a")).toEqual({
      version: VN_DEVTOOLS_SESSION_VERSION,
      collapsed: false,
      width: 420,
      pinnedTarget: anchor,
      decisions: [
        { anchor, choiceId: "route", text: "Left", goto: "LeftRoute" },
        {
          anchor: { ...anchor, commandId: "input", stableId: "input:name" },
          value: "Codex"
        }
      ]
    });
  });

  it("rejects stale or malformed data and survives unavailable storage", () => {
    const storage = memoryStorage();
    storage.setItem("old", JSON.stringify({ version: 0, collapsed: false, width: 420 }));
    storage.setItem("bad", "not json");
    storage.setItem("invalid-shapes", JSON.stringify({
      version: VN_DEVTOOLS_SESSION_VERSION,
      collapsed: false,
      width: 420,
      pinnedTarget: { textId: "not-an-anchor" },
      decisions: [{ choiceId: "not-a-decision" }]
    }));
    storage.setItem("invalid-coordinates", JSON.stringify({
      version: VN_DEVTOOLS_SESSION_VERSION,
      collapsed: false,
      width: 420,
      pinnedTarget: {
        kind: "command",
        scriptPath: "game-a/opening.nani",
        revision: "sha256:abc",
        line: 0,
        commandIndex: -1,
        ordinal: 0
      }
    }));
    expect(loadVnDevtoolsSessionState(storage, "old")).toBeUndefined();
    expect(loadVnDevtoolsSessionState(storage, "bad")).toBeUndefined();
    expect(loadVnDevtoolsSessionState(storage, "invalid-shapes")).toEqual({
      version: VN_DEVTOOLS_SESSION_VERSION,
      collapsed: false,
      width: 420,
      decisions: []
    });
    expect(loadVnDevtoolsSessionState(storage, "invalid-coordinates")).toEqual({
      version: VN_DEVTOOLS_SESSION_VERSION,
      collapsed: false,
      width: 420
    });

    const unavailable: VnDevtoolsStorageLike = {
      getItem: vi.fn(() => {
        throw new Error("denied");
      }),
      setItem: vi.fn(() => {
        throw new Error("denied");
      }),
      removeItem: vi.fn(() => {
        throw new Error("denied");
      })
    };
    expect(loadVnDevtoolsSessionState(unavailable, "key")).toBeUndefined();
    expect(saveVnDevtoolsSessionState(unavailable, "key", { collapsed: false, width: 420 })).toBe(false);
    expect(clearVnDevtoolsSessionState(unavailable, "key")).toBe(false);
  });

  it("provides the open 420px first-visit default and can clear a saved session", () => {
    const storage = memoryStorage();
    storage.setItem("key", "value");
    expect(createDefaultVnDevtoolsSessionState()).toEqual({ version: 1, collapsed: false, width: 420 });
    expect(clearVnDevtoolsSessionState(storage, "key")).toBe(true);
    expect(storage.getItem("key")).toBeNull();
  });
});

function memoryStorage(): VnDevtoolsStorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}
