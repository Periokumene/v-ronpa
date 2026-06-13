import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const task = args.task;
const base = args.base ?? process.env.BASE_REF ?? "integration/v-ronpa-baseline";

if (!task) {
  console.error("Missing --task docs/tasks/<name>.md.");
  process.exit(1);
}

const env = { ...process.env, BASE_REF: base };
const commands = [
  ["node", ["scripts/validate-task-boundaries.mjs", "--task", task, "--base", base]],
  ["node", ["scripts/validate-ccr.mjs", "--base", base]],
  ["pnpm", ["validate:boundaries"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["validate:contracts"]],
  ["pnpm", ["test"]],
  ["pnpm", ["--filter", "@v-ronpa/game", "build"]],
  ["pnpm", ["test:smoke"]]
];

for (const [bin, commandArgs] of commands) {
  console.log(`\n> ${[bin, ...commandArgs].join(" ")}`);
  const result = spawnSync(bin, commandArgs, { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\nSubsystem validation passed.");

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--task") parsed.task = argv[++i];
    else if (arg.startsWith("--task=")) parsed.task = arg.slice("--task=".length);
    else if (arg === "--base") parsed.base = argv[++i];
    else if (arg.startsWith("--base=")) parsed.base = arg.slice("--base=".length);
    else if (!parsed.task) parsed.task = arg;
  }
  return parsed;
}
