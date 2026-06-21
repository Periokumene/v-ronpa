import { execFileSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const base = args.base ?? process.env.BASE_REF ?? "integration/v-ronpa-baseline";

ensureGitRef(base);

const changed = changedFilesSince(base);
const contractTouched = changed.some((path) =>
  path.startsWith("packages/contracts/") ||
  path.startsWith("packages/nani-parser/src/types")
);

const hasCcr = changed.some((path) => path.startsWith("docs/ccr/") && path !== "docs/ccr/template.md");

if (contractTouched && !hasCcr) {
  console.error(`Public contract files changed without a CCR under docs/ccr/ (base: ${base}).`);
  process.exit(1);
}

console.log("CCR validation passed.");

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") parsed.base = argv[++i];
    else if (arg.startsWith("--base=")) parsed.base = arg.slice("--base=".length);
  }
  return parsed;
}

function changedFilesSince(ref) {
  const files = new Set([
    ...gitLines(["diff", "--name-only", `${ref}...HEAD`]),
    ...gitLines(["diff", "--name-only", "--cached"]),
    ...gitLines(["diff", "--name-only"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"])
  ]);
  return [...files].filter(Boolean).sort();
}

function ensureGitRef(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "ignore" });
  } catch {
    console.error(`BASE_REF '${ref}' does not exist.`);
    process.exit(1);
  }
}

function gitLines(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
