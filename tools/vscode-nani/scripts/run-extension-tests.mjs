import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../node_modules/@vscode/test-cli/out/bin.mjs", import.meta.url));
const command = process.platform === "linux" ? "xvfb-run" : process.execPath;
const args = process.platform === "linux"
  ? ["-a", process.execPath, cli]
  : [cli];

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
