import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createVSIX } from "@vscode/vsce";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const outputPath = resolve(`v-ronpa-nani-${packageJson.version}.vsix`);

await createVSIX({
  cwd: process.cwd(),
  packagePath: outputPath,
  dependencies: false
});
