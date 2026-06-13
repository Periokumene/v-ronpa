import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const taskPath = args.task ? resolve(root, args.task) : undefined;
const base = args.base ?? process.env.BASE_REF;

if (!taskPath) {
  fail("Missing --task docs/tasks/<name>.md.");
}

if (!existsSync(taskPath)) {
  fail(`Task card does not exist: ${relative(root, taskPath)}`);
}

if (!base) {
  fail("BASE_REF is required for task boundary validation.");
}

ensureGitRef(base);

const taskText = readFileSync(taskPath, "utf8");
const allowed = [
  ...parsePathList(section(taskText, "Allowed Paths")),
  relative(root, taskPath)
];
const forbidden = parsePathList(section(taskText, "Forbidden Paths"));
const baseBranch = section(taskText, "Base Branch").trim();
const dependencyChanges = section(taskText, "Dependency Changes").trim();
const changedFiles = changedFilesSince(base);
const violations = [];

if (baseBranch && !baseBranch.includes(base)) {
  violations.push(`Task Base Branch is '${baseBranch}', but BASE_REF is '${base}'.`);
}

if (allowed.length === 0) {
  violations.push("Task card has no Allowed Paths.");
}

for (const file of changedFiles) {
  if (matchesAny(file, forbidden)) {
    violations.push(`${file}: matches Forbidden Paths.`);
    continue;
  }

  if (!matchesAny(file, allowed)) {
    violations.push(`${file}: outside task Allowed Paths.`);
  }
}

const dependencyFiles = changedFiles.filter((file) => file === "pnpm-lock.yaml" || file.endsWith("package.json"));
if (dependencyFiles.length > 0 && !dependencyChangesAllowed(dependencyChanges)) {
  violations.push(
    `Dependency files changed without an explicit 'Dependency Changes: Allowed' section: ${dependencyFiles.join(", ")}.`
  );
}

if (violations.length > 0) {
  console.error("Task boundary violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Task boundary validation passed.");

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

function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return "";

  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join("\n").trim();
}

function parsePathList(text) {
  const paths = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (!match) continue;
    const value = match[1]
      .replace(/`/g, "")
      .replace(/\s+#.*$/, "")
      .trim();
    if (value && value.toLowerCase() !== "none") paths.push(value);
  }
  return paths;
}

function dependencyChangesAllowed(text) {
  return /\bAllowed\b/i.test(text) && !/\bNone\b/i.test(text);
}

function changedFilesSince(ref) {
  const files = new Set([
    ...gitLines(["diff", "--name-only", `${ref}...HEAD`]),
    ...gitLines(["diff", "--name-only", "--cached"]),
    ...gitLines(["diff", "--name-only"])
  ]);
  return [...files].filter(Boolean).sort();
}

function ensureGitRef(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "ignore" });
  } catch {
    fail(`BASE_REF '${ref}' does not exist.`);
  }
}

function gitLines(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => matchesPattern(file, pattern));
}

function matchesPattern(file, pattern) {
  const normalized = pattern.replace(/^\.\//, "");
  if (normalized.endsWith("/**")) {
    const prefix = normalized.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  if (!normalized.includes("*")) return file === normalized || file.startsWith(`${normalized}/`);

  const escaped = normalized
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(file);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
