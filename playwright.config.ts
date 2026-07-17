import { defineConfig, devices } from "@playwright/test";
import { resolveWorktreeAppRuntimeEnv, resolveWorktreeRuntimeEnv } from "./scripts/worktree-env.mjs";

const runtimeEnv = resolveWorktreeRuntimeEnv();
const harnessPort = resolveWorktreeAppRuntimeEnv("game-harness").port;
const gameAPort = resolveWorktreeAppRuntimeEnv("game-a").port;
const harnessURL = `http://127.0.0.1:${harnessPort}`;
const gameAURL = `http://127.0.0.1:${gameAPort}`;
const useMacHardwareWebGl = process.platform === "darwin";
const webGlWorkers = useMacHardwareWebGl ? 2 : 1;
const chromiumLaunchOptions = useMacHardwareWebGl ? { args: ["--use-angle=metal"] } : undefined;

export default defineConfig({
  testDir: "./tests/smoke",
  outputDir: "./test-results",
  workers: webGlWorkers,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  use: {
    trace: "off",
    screenshot: "only-on-failure"
  },
  webServer: [
    {
      command: `VITE_DEV_PORT=${runtimeEnv.port} pnpm --filter @v-ronpa/game-harness dev --host 127.0.0.1`,
      url: harnessURL,
      reuseExistingServer: false,
      timeout: 120000
    },
    {
      command: `VITE_DEV_PORT=${runtimeEnv.port} VITE_ENABLE_TEST_ENTRIES=1 pnpm --filter @v-ronpa/game-a dev --host 127.0.0.1`,
      url: gameAURL,
      reuseExistingServer: false,
      timeout: 120000
    }
  ],
  projects: [
    {
      name: "game-harness",
      testMatch: /harness-.*\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"], baseURL: harnessURL, launchOptions: chromiumLaunchOptions }
    },
    {
      name: "game-a",
      testMatch: /game-a-.*\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"], baseURL: gameAURL, launchOptions: chromiumLaunchOptions }
    }
  ]
});
