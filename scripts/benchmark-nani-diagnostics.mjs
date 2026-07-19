import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseScenario } from "../packages/nani-parser/src/index.ts";
import { compileRuntimeScript } from "../packages/nani-runtime-compiler/src/index.ts";

const repoRoot = process.cwd();
const baseline = JSON.parse(
  readFileSync(new URL("./fixtures/nani-performance-baseline.json", import.meta.url), "utf8")
);
const sourceFiles = [
  "packages/nani-parser/fixtures/basic-trial-discussion.p1.nani",
  "packages/nani-parser/fixtures/basic-navi.p1.nani",
  "apps/game-a/src/nani/opening.nani",
  "apps/game-a/src/test-nani/smoke.nani",
  "apps/game-a/src/test-nani/character-smoke.nani"
];
const openingCorpus = sourceFiles.map((sourceFile) => ({
  scriptPath: sourceFile,
  sourceText: readFileSync(resolve(repoRoot, sourceFile), "utf8")
}));
openingCorpus.push({
  scriptPath: "harness-showcase.nani",
  sourceText: readTypescriptTemplate("apps/game-harness/src/harness/showcase/script.ts")
});

const syntheticSource = Array.from({ length: 10_000 }, (_, index) => {
  switch (index % 4) {
    case 0:
      return `@bgm bgm:validation-${index} volume:0.5 group:music`;
    case 1:
      return `Narrator: synthetic ${index} 中文😀 [< speed:0.8][>]`;
    case 2:
      return `@showUI dialog time:0.2`;
    default:
      return `@back bg:synthetic-${index} effect:fade time:0.1`;
  }
}).join("\n");

let checksum = 0;
const openingWorkload = () => {
  for (const source of openingCorpus) checksum += parseAndCompile(source.sourceText, source.scriptPath);
};
const syntheticWorkload = () => {
  checksum += parseAndCompile(syntheticSource, "synthetic-10000.nani");
};

for (let index = 0; index < 10; index += 1) {
  openingWorkload();
  syntheticWorkload();
}

const openingSamples = [];
const syntheticSamples = [];
for (let index = 0; index < baseline.runs; index += 1) {
  if (index % 2 === 0) {
    openingSamples.push(measure(openingWorkload));
    syntheticSamples.push(measure(syntheticWorkload));
  } else {
    syntheticSamples.push(measure(syntheticWorkload));
    openingSamples.push(measure(openingWorkload));
  }
}

const actual = {
  openingCorpusMedianMs: median(openingSamples),
  synthetic10000MedianMs: median(syntheticSamples)
};
const regressions = [
  regression("opening corpus", baseline.openingCorpusMedianMs, actual.openingCorpusMedianMs),
  regression("synthetic 10,000-line corpus", baseline.synthetic10000MedianMs, actual.synthetic10000MedianMs)
];

console.log(
  `Nani diagnostics benchmark (${baseline.runs} warmed alternating runs, checksum ${checksum}):`
);
for (const result of regressions) {
  console.log(
    `- ${result.label}: ${result.before.toFixed(3)} ms baseline -> ${result.after.toFixed(3)} ms current ` +
      `(${signed(result.absoluteMs)} ms, ${signed(result.relative * 100)}%)`
  );
}

const blocked = regressions.filter(
  (result) =>
    result.relative > baseline.relativeRegressionLimit &&
    result.absoluteMs > baseline.absoluteRegressionLimitMs
);
if (blocked.length > 0) {
  console.error(
    "Nani diagnostics benchmark exceeded both the relative and absolute regression limits for: " +
      blocked.map((result) => result.label).join(", ")
  );
  process.exit(1);
}

function parseAndCompile(sourceText, scriptPath) {
  const parsed = parseScenario({ sourceText, scriptPath });
  const compiled = compileRuntimeScript(parsed);
  return parsed.scenario.statements.length + compiled.script.commands.length +
    parsed.diagnostics.length + compiled.diagnostics.length;
}

function readTypescriptTemplate(path) {
  const text = readFileSync(resolve(repoRoot, path), "utf8");
  const match = text.match(/`([\s\S]*)`;\s*$/u);
  if (!match?.[1]) throw new Error(`Could not read Nani template from ${path}.`);
  return match[1];
}

function measure(workload) {
  const start = performance.now();
  workload();
  return performance.now() - start;
}

function median(samples) {
  const ordered = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function regression(label, before, after) {
  return {
    label,
    before,
    after,
    absoluteMs: after - before,
    relative: before === 0 ? 0 : (after - before) / before
  };
}

function signed(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}
