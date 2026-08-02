import { describe, expect, it } from "vitest";
import playwrightConfig from "../playwright.config";

describe("Playwright smoke isolation", () => {
  it("uses two Metal-backed workers on macOS and a serial fallback elsewhere", () => {
    expect(playwrightConfig.workers).toBe(process.platform === "darwin" ? 2 : 1);

    for (const project of playwrightConfig.projects ?? []) {
      const args = project.use?.launchOptions?.args ?? [];
      if (process.platform === "darwin") {
        expect(args).toContain("--use-angle=metal");
      } else {
        expect(args).not.toContain("--use-angle=metal");
      }
    }
  });

  it("keeps expensive traces opt-in", () => {
    expect(playwrightConfig.use?.trace).toBe("off");
  });

  it("always starts correctly configured app servers", () => {
    const webServers = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer
      : [playwrightConfig.webServer];

    expect(webServers).toHaveLength(4);
    expect(webServers.every((server) => server?.reuseExistingServer === false)).toBe(true);
    expect(webServers.some((server) => server?.command.includes("--mode game-a-test-smoke"))).toBe(true);
    expect(webServers.some((server) => server?.command.includes("--mode game-a-test-character"))).toBe(true);
    expect(webServers.some((server) => server?.command.endsWith("dev --host 127.0.0.1"))).toBe(true);
    expect(new Set(webServers.map((server) => server?.url)).size).toBe(4);
  });

  it("does not collect the deferred AUTO/SKIP browser suite", () => {
    const harnessProject = playwrightConfig.projects?.find((project) => project.name === "game-harness");
    expect(String(harnessProject?.testMatch)).toBe("/harness-.*\\.spec\\.ts/u");
    expect(String(harnessProject?.testMatch)).not.toContain("vn-auto-skip");
  });
});
