import { defineConfig, devices } from "@playwright/test";
import { resolveWorktreeAppRuntimeEnv, resolveWorktreeRuntimeEnv } from "./scripts/worktree-env.mjs";

const runtimeEnv = resolveWorktreeRuntimeEnv();
const harnessPort = resolveWorktreeAppRuntimeEnv("game-harness").port;
const gameAPort = resolveWorktreeAppRuntimeEnv("game-a").port;
const harnessURL = `http://127.0.0.1:${harnessPort}`;
const gameAURL = `http://127.0.0.1:${gameAPort}`;
const gameACharacterPort = gameAPort + 1;
const gameACharacterURL = `http://127.0.0.1:${gameACharacterPort}`;
const gameAProductPort = gameAPort + 2;
const gameAProductURL = `http://127.0.0.1:${gameAProductPort}`;
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
      command: `VITE_DEV_PORT=${runtimeEnv.port} pnpm --filter @v-ronpa/game-a dev --mode game-a-test-smoke --host 127.0.0.1`,
      url: gameAURL,
      reuseExistingServer: false,
      timeout: 120000
    },
    {
      command: `VITE_DEV_PORT=${runtimeEnv.port + 1} pnpm --filter @v-ronpa/game-a dev --mode game-a-test-character --host 127.0.0.1`,
      url: gameACharacterURL,
      reuseExistingServer: false,
      timeout: 120000
    },
    {
      command: `VITE_DEV_PORT=${runtimeEnv.port + 2} pnpm --filter @v-ronpa/game-a dev --host 127.0.0.1`,
      url: gameAProductURL,
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
      testMatch: /game-a-vn\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"], baseURL: gameAURL, launchOptions: chromiumLaunchOptions }
    },
    {
      name: "game-a-character",
      testMatch: /game-a-alice\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"], baseURL: gameACharacterURL, launchOptions: chromiumLaunchOptions }
    },
    {
      name: "game-a-product",
      testMatch: /game-a-multi-nani\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"], baseURL: gameAProductURL, launchOptions: chromiumLaunchOptions }
    }
  ]
});
