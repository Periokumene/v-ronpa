import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const repoRoot = process.cwd();
const failures = [];
const roots = ["apps", "packages", "scripts", "tests", "tools/vscode-nani", "README.md", "docs"];
const excluded = [
  /^docs\/archive\//u,
  /^docs\/ccr\//u,
  /^docs\/adr\/0003-nani-parser-port\.md$/u,
  /^scripts\/validate-nani-diagnostics-cleanup\.mjs$/u,
  /(^|\/)node_modules\//u,
  /(^|\/)dist\//u,
  /(^|\/)\.git\//u
];

const forbiddenSymbols = [
  "ParserPort",
  "defaultParser",
  "parseRichText",
  "CommandLoc",
  "commandLoc",
  "CommandPartDiagnostic",
  "SplitCommandPartsResult",
  "splitCommandParts",
  "collectCommandSpacingDiagnostics",
  "parseScenarioDetailed",
  "compileRuntimeScriptDetailed",
  "approximateCompilerDiagnosticRange",
  "sourceLocationRange",
  "commandNameFromMessage",
  "commandMatches",
  "rawArgRange",
  "argValueRange",
  "findArgStart",
  "commandConsumesPrimary",
  "computeSemanticDiagnostics",
  "diagnosticIndex",
  "firstLineRange",
  "VnRuntimeParserDiagnosticLike",
  "VnRuntimeCompilerDiagnosticLike",
  "primaryConsumptionCache",
  "primaryProbe",
  "uiTargetDiagnostics",
  "containsRuntimeString"
];

const forbiddenPatterns = [
  { pattern: /compileRuntimeScript\s*\(\s*\w+\.scenario\s*\)/u, label: "bare ScenarioIR compiler call" },
  { pattern: /\.indexOf\s*\(\s*arg\.raw\s*\)/u, label: "argument text-search range recovery" },
  { pattern: /\boptions\.inline\b/u, label: "removed inline parser option" },
  { pattern: /diagnostic\.message\.(?:match|matchAll|replace|search|split)\s*\(/u, label: "diagnostic message parsing" },
  { pattern: /(?:exec|match|search)\s*\(\s*diagnostic\.message\b/u, label: "diagnostic message regex" },
  { pattern: /\.lineAt\s*\(\s*0\s*\)/u, label: "first-line diagnostic fallback" },
  { pattern: /\bsourceMap\s*\?/u, label: "optional Nani source map" },
  { pattern: /\bspan\s*\?\s*:\s*TextSpan\b/u, label: "optional Nani diagnostic span" },
  { pattern: /\bParseScenarioInput\b[^}]*\bbaseUrl\b/su, label: "removed parser baseUrl input" },
  { pattern: /most likely command line|approximate command-line ranges|approximate diagnostic range/iu, label: "approximate diagnostic documentation" }
];

for (const sourceRoot of roots) {
  const absolute = join(repoRoot, sourceRoot);
  if (!existsSync(absolute)) continue;
  const files = statSync(absolute).isDirectory() ? collectFiles(absolute) : [absolute];
  for (const file of files) {
    const rel = toPosix(relative(repoRoot, file));
    if (excluded.some((pattern) => pattern.test(rel)) || !isTextFile(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const symbol of forbiddenSymbols) {
      if (new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "u").test(text)) {
        failures.push(`${rel}: legacy Nani diagnostic symbol '${symbol}'.`);
      }
    }
    for (const rule of forbiddenPatterns) {
      if (rule.pattern.test(text)) failures.push(`${rel}: ${rule.label}.`);
    }
  }
}

checkNoProvenance(
  "packages/contracts/src",
  /\b(NaniSourceMap|NaniSourceRef|TextSpan|sourceMap|sourceSpan|provenance)\b/u
);

checkNoProvenance(
  "packages/nani-parser/src/types/ir.ts",
  /\b(NaniSourceMap|NaniSourceRef|TextSpan|sourceMap|sourceSpan|provenance)\b/u
);
checkPublicApiShape();

if (failures.length > 0) {
  console.error("Nani diagnostics cleanup guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Nani diagnostics cleanup guard passed.");

function checkNoProvenance(path, pattern) {
  const absolute = join(repoRoot, path);
  if (!existsSync(absolute)) return;
  const files = statSync(absolute).isDirectory() ? collectFiles(absolute) : [absolute];
  for (const file of files) {
    if (!/\.(ts|tsx)$/u.test(file) || /\.(test|spec)\.(ts|tsx)$/u.test(file)) continue;
    const rel = toPosix(relative(repoRoot, file));
    if (pattern.test(readFileSync(file, "utf8"))) failures.push(`${rel}: source provenance leaked into contracts.`);
  }
}

function checkPublicApiShape() {
  const apiPath = "packages/nani-parser/src/types/api.ts";
  const parserIndexPath = "packages/nani-parser/src/index.ts";
  const compilerPath = "packages/nani-runtime-compiler/src/index.ts";
  const runtimeDiagnosticsPath = "packages/app-vn-runtime/src/runtimeDiagnostics.ts";
  const api = readRequired(apiPath);
  const parserIndex = readRequired(parserIndexPath);
  const compiler = readRequired(compilerPath);
  const runtimeDiagnostics = readRequired(runtimeDiagnosticsPath);

  requirePattern(apiPath, api, /interface ParsedScenarioDocument\s*\{[^}]*\bscenario\s*:\s*ScenarioIR\s*;[^}]*\bsourceMap\s*:\s*NaniSourceMap\s*;/su, "required scenario/sourceMap document shape");
  requirePattern(apiPath, api, /interface NaniSourceDiagnostic[\s\S]*?\bspan\s*:\s*TextSpan\s*;/u, "required diagnostic span");
  rejectPattern(apiPath, api, /\bbaseUrl\b/u, "removed parser baseUrl input");
  requirePattern(parserIndexPath, parserIndex, /export\s*\{\s*parseScenario\s*\}\s*from/u, "single parser entry point");
  rejectPattern(parserIndexPath, parserIndex, /\bparseRichText\b/u, "removed public rich-text parser");
  requirePattern(compilerPath, compiler, /export function compileRuntimeScript\s*\(\s*document\s*:\s*ParsedScenarioDocument\s*\)/u, "parsed-document compiler entry point");
  rejectPattern(compilerPath, compiler, /compileRuntimeScript\s*\([^)]*ScenarioIR/u, "bare ScenarioIR compiler entry point");
  rejectPattern(runtimeDiagnosticsPath, runtimeDiagnostics, /\b(?:VnRuntimeParserDiagnosticLike|VnRuntimeCompilerDiagnosticLike)\b/u, "loose runtime diagnostic mirror");
}

function readRequired(path) {
  const absolute = join(repoRoot, path);
  if (!existsSync(absolute)) {
    failures.push(`${path}: required exact-source API file is missing.`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function requirePattern(path, text, pattern, label) {
  if (!pattern.test(text)) failures.push(`${path}: missing ${label}.`);
}

function rejectPattern(path, text, pattern, label) {
  if (pattern.test(text)) failures.push(`${path}: contains ${label}.`);
}

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".git", ".vscode-test"].includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) collectFiles(path, files);
    else files.push(path);
  }
  return files;
}

function isTextFile(file) {
  return ["", ".cts", ".js", ".json", ".md", ".mjs", ".mts", ".ts", ".tsx"].includes(extname(file));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function toPosix(path) {
  return path.split(sep).join("/");
}
