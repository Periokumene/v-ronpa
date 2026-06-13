import { execFileSync } from "node:child_process";

const base = process.env.BASE_REF;

if (!base) {
  console.log("BASE_REF not set; skipping CCR diff check.");
  process.exit(0);
}

const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
  encoding: "utf8"
}).trim().split("\n").filter(Boolean);

const contractTouched = changed.some((path) =>
  path.startsWith("packages/contracts/") ||
  path.startsWith("packages/presentation-contracts/") ||
  path.startsWith("packages/nani-parser/src/types")
);

const hasCcr = changed.some((path) => path.startsWith("docs/ccr/") && path !== "docs/ccr/template.md");

if (contractTouched && !hasCcr) {
  console.error("Public contract files changed without a CCR under docs/ccr/.");
  process.exit(1);
}

console.log("CCR validation passed.");
