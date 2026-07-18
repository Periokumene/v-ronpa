import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const repoRoot = process.cwd();
const roots = [
  "apps",
  "packages",
  "scripts",
  "tests",
  "package.json",
  "tsconfig.json",
  "playwright.config.ts",
  "README.md",
  "AGENTS.md",
  "docs/architecture",
  "docs/templates"
];

const forbidden = [
  { pattern: /\bapps\/game(?![-\w])/u, label: "apps/game" },
  { pattern: /@v-ronpa\/game(?=["'`,}\s])/u, label: "@v-ronpa/game" },
  { pattern: /vertical-slice/u, label: "vertical-slice" },
  { pattern: /VerticalSlice/u, label: "VerticalSlice" },
  { pattern: /verticalSlice/u, label: "verticalSlice" },
  { pattern: /\bdevVnLaunchTarget\b/u, label: "devVnLaunchTarget" },
  { pattern: /\bvnStart\b/u, label: "vnStart" },
  { pattern: /\bstartLabelOverride\b/u, label: "startLabelOverride" },
  { pattern: /\bgameANaniFullReloadPlugin\b/u, label: "gameANaniFullReloadPlugin" },
  { pattern: /\bVITE_ENABLE_TEST_ENTRIES\b/u, label: "VITE_ENABLE_TEST_ENTRIES" },
  { pattern: /\bvnEntry\b/u, label: "vnEntry query" },
  { pattern: /\bentryOverride\b/u, label: "entryOverride" },
  { pattern: /\bruntime\.debug\b/u, label: "runtime.debug", path: /^apps\/game-a\//u }
];

const allowed = [
  /^docs\/archive\//u,
  /^docs\/ccr\/.*\.md$/u,
  /^scripts\/validate-app-cleanup\.mjs$/u,
  /^node_modules\//u,
  /^dist\//u,
  /(^|\/)\.git\//u
];

const failures = [];
for (const root of roots) {
  const absolute = join(repoRoot, root);
  if (!existsSync(absolute)) continue;
  for (const file of statSync(absolute).isDirectory() ? collectFiles(absolute) : [absolute]) {
    const rel = toPosix(relative(repoRoot, file));
    if (allowed.some((pattern) => pattern.test(rel))) continue;
    if (!isTextFile(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const rule of forbidden) {
      if (rule.path && !rule.path.test(rel)) continue;
      if (rule.pattern.test(text)) failures.push(`${rel}: forbidden active cleanup reference '${rule.label}'.`);
    }
  }
}

if (failures.length > 0) {
  console.error("App cleanup guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("App cleanup guard passed.");

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) collectFiles(path, files);
    else files.push(path);
  }
  return files;
}

function isTextFile(file) {
  return [
    "",
    ".css",
    ".html",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".ts",
    ".tsx"
  ].includes(extname(file));
}

function toPosix(path) {
  return path.split(sep).join("/");
}
