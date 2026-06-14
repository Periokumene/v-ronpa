import { defineConfig, devices } from "@playwright/test";
import { resolveWorktreeRuntimeEnv } from "./scripts/worktree-env.mjs";

const runtimeEnv = resolveWorktreeRuntimeEnv();
const serverURL = `http://127.0.0.1:${runtimeEnv.port}`;

export default defineConfig({
  testDir: "./tests/smoke",
  outputDir: "./test-results",
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  use: {
    baseURL: serverURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: `PORT=${runtimeEnv.port} VITE_DEV_PORT=${runtimeEnv.port} pnpm --filter @v-ronpa/game dev --host 127.0.0.1`,
    url: serverURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
