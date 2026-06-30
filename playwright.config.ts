import { defineConfig, devices } from "@playwright/test";
import { resolveWorktreeRuntimeEnv } from "./scripts/worktree-env.mjs";

const runtimeEnv = resolveWorktreeRuntimeEnv();
const harnessPort = runtimeEnv.port;
const gameAPort = runtimeEnv.port + 1;
const harnessURL = `http://127.0.0.1:${harnessPort}`;
const gameAURL = `http://127.0.0.1:${gameAPort}`;

export default defineConfig({
  testDir: "./tests/smoke",
  outputDir: "./test-results",
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  webServer: [
    {
      command: `PORT=${harnessPort} VITE_DEV_PORT=${harnessPort} pnpm --filter @v-ronpa/game-harness dev --host 127.0.0.1`,
      url: harnessURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    },
    {
      command: `PORT=${gameAPort} VITE_DEV_PORT=${gameAPort} pnpm --filter @v-ronpa/game-a dev --host 127.0.0.1`,
      url: gameAURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    }
  ],
  projects: [
    {
      name: "game-harness",
      testMatch: [/harness-.*\.spec\.ts/u, /vn-auto-skip\.spec\.ts/u],
      use: { ...devices["Desktop Chrome"], baseURL: harnessURL }
    },
    {
      name: "game-a",
      testMatch: /game-a-.*\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"], baseURL: gameAURL }
    }
  ]
});
