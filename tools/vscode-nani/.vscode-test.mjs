import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@vscode/test-cli";

const testDataRoot = fileURLToPath(new URL("./.vscode-test/", import.meta.url));
mkdirSync(testDataRoot, { recursive: true });
const runRoot = mkdtempSync(join(testDataRoot, "r-"));
const workspaceFolder = join(runRoot, "w");
const userDataDirectory = join(runRoot, "u");
const extensionsDirectory = join(runRoot, "e");
mkdirSync(workspaceFolder, { recursive: true });

export default defineConfig({
  label: "exact-diagnostics",
  files: ".vscode-test/out/**/*.test.cjs",
  version: "1.99.3",
  workspaceFolder,
  launchArgs: [
    "--disable-extensions",
    "--disable-workspace-trust",
    "--user-data-dir",
    userDataDirectory,
    "--extensions-dir",
    extensionsDirectory
  ],
  mocha: {
    ui: "tdd",
    timeout: 20_000
  }
});
