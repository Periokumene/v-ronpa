import { describe, expect, it } from "vitest";
import { APP_DEV_PORT_OFFSETS, parsePort } from "./worktree-env.mjs";

describe("worktree app ports", () => {
  it("assigns stable non-overlapping offsets to both apps", () => {
    const base = parsePort("5600");
    expect(base + APP_DEV_PORT_OFFSETS["game-harness"]).toBe(5600);
    expect(base + APP_DEV_PORT_OFFSETS["game-a"]).toBe(5601);
    expect(new Set(Object.values(APP_DEV_PORT_OFFSETS)).size).toBe(2);
  });

  it("rejects invalid base ports through the shared parser", () => {
    expect(parsePort("not-a-port", 5173)).toBe(5173);
  });
});
