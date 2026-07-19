import { naniCommandCatalog } from "../packages/contracts/src/index.ts";
import {
  parseScenario,
  resolveNaniSourceRef
} from "../packages/nani-parser/src/index.ts";
import { compileRuntimeScript } from "../packages/nani-runtime-compiler/src/index.ts";

const CATALOG_CASES = 50_000;
const INVALID_CASES = 20_000;
let checkedDiagnostics = 0;
let checkedRefs = 0;

for (let index = 0; index < CATALOG_CASES; index += 1) {
  const definition = naniCommandCatalog[index % naniCommandCatalog.length];
  const sourceText = catalogSource(definition, index);
  validateDocument(sourceText, `catalog-stress-${index}.nani`);
}

const random = mulberry32(0x4e414e49);
for (let index = 0; index < INVALID_CASES; index += 1) {
  validateDocument(randomInvalidSource(random), `invalid-stress-${index}.nani`);
}

console.log(
  `Nani diagnostics stress guard passed: ${CATALOG_CASES} catalog cases, ` +
    `${INVALID_CASES} deterministic invalid cases, ${checkedDiagnostics} exact diagnostics, ` +
    `${checkedRefs} structural refs.`
);

function validateDocument(sourceText, scriptPath) {
  let parsed;
  let compiled;
  try {
    parsed = parseScenario({ sourceText, scriptPath });
    compiled = compileRuntimeScript(parsed);
  } catch (error) {
    throw new Error(`${scriptPath} threw for user input ${JSON.stringify(sourceText)}.`, {
      cause: error
    });
  }

  if (parsed.sourceMap.statements.length !== parsed.scenario.statements.length) {
    throw new Error(`${scriptPath} source-map/IR statement counts diverged.`);
  }
  for (const [statementIndex, statement] of parsed.scenario.statements.entries()) {
    assertResolved(parsed.sourceMap, { kind: "statement", statementIndex, part: "whole" });
    if (statement.kind === "command") {
      assertResolved(parsed.sourceMap, { kind: "command-name", statementIndex });
      for (const argumentIndex of statement.args.keys()) {
        assertResolved(parsed.sourceMap, {
          kind: "command-argument",
          statementIndex,
          argumentIndex,
          part: "whole"
        });
      }
    }
  }
  for (const diagnostic of [...parsed.diagnostics, ...compiled.diagnostics]) {
    const { start, end } = diagnostic.span;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      end > sourceText.length
    ) {
      throw new Error(
        `${scriptPath} emitted invalid ${diagnostic.code} span [${start}, ${end}) for length ${sourceText.length}.`
      );
    }
    checkedDiagnostics += 1;
  }
}

function assertResolved(sourceMap, ref) {
  const span = resolveNaniSourceRef(sourceMap, ref);
  if (span.start < 0 || span.end < span.start || span.end > sourceMap.sourceLength) {
    throw new Error(`Resolved out-of-bounds source ref ${JSON.stringify(ref)}.`);
  }
  checkedRefs += 1;
}

function catalogSource(definition, index) {
  const spec = definition.params[index % Math.max(1, definition.params.length)];
  const argument = spec ? `${spec.name}:${valueForType(spec.type, index)}` : `value-${index}`;
  switch (index % 5) {
    case 0:
      return `@${definition.canonicalName} ${argument}`;
    case 1:
      return `@${definition.canonicalName} "primary:${index}" ${argument}`;
    case 2:
      return `@${definition.canonicalName} ${argument} wait!`;
    case 3:
      return `@${definition.canonicalName} ${argument} if:{ready && value > ${index % 7}}`;
    default:
      return `@${definition.canonicalName} ${argument} ${argument}`;
  }
}

function valueForType(type, index) {
  if (type.includes("boolean")) return index % 2 === 0 ? "true" : "false";
  if (type.includes("integer")) return String(index % 11);
  if (type.includes("decimal list")) return `${index % 5},${(index + 1) % 5}`;
  if (type.includes("decimal")) return `${index % 7}.5`;
  if (type.includes("list")) return `item-${index},item-${index + 1}`;
  return `value:${index}`;
}

function randomInvalidSource(random) {
  const atoms = [
    "@",
    "#",
    ":",
    ",",
    "!",
    "{",
    "}",
    "[>",
    "[< speed:",
    "<font color=",
    "|#",
    "\"",
    "'",
    "\\",
    "\t",
    " ",
    "中文",
    "😀",
    "e\u0301",
    "\r",
    "\n",
    "\r\n"
  ];
  const count = 1 + Math.floor(random() * 18);
  let output = "";
  for (let index = 0; index < count; index += 1) {
    output += atoms[Math.floor(random() * atoms.length)];
    if (random() < 0.35) output += Math.floor(random() * 100).toString(36);
  }
  return output;
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
