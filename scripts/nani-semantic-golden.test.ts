import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gameAScriptMetadataByPath } from "../apps/game-a/src/generatedNaniProduction";
import { gameATestScriptMetadataByPath } from "../apps/game-a/src/generatedNaniTests";
import { harnessScriptMetadataByPath } from "../apps/game-harness/src/harness/generatedNaniProduction";
import { parseScenario } from "../packages/nani-parser/src/index";
import { compileRuntimeScript } from "../packages/nani-runtime-compiler/src/index";

const golden = JSON.parse(
  readFileSync(new URL("./fixtures/nani-semantic-golden.json", import.meta.url), "utf8")
) as SemanticGolden;
const diagnosticGolden = JSON.parse(
  readFileSync(new URL("./fixtures/nani-diagnostic-golden.json", import.meta.url), "utf8")
) as DiagnosticGolden;

describe("Nani semantic golden from integration baseline", () => {
  it("pins the reviewed baseline and canonicalization", () => {
    expect(golden.baseline).toBe("a7bb0091234f7796df3db93a7bfe3f0ae948e300");
    expect(golden.canonicalization).toBe("stable-json-v1");
    expect(diagnosticGolden.baseline).toBe(golden.baseline);
    expect(golden.intentionalOverrides).toEqual({
      "game-a-test-smoke": "Editor Tools moves the visual/audio setup before the first stable Workbench target and records its route/text identity.",
      "game-a-production-catalog": "The accepted multi-Nani hard cut splits the former MILKBEGIN segment into chapter-02 and links it from opening with one static endpoint.",
      "csp-character-v2-alice-hard-cut": "The accepted CSP v2 hard cut replaces Alice assets and updates production/test appearance expressions, generated revisions, and preload plans without compatibility aliases.",
      "csp-character-v3-body-variants-alice-refresh": "The accepted CSP v3 hard cut moves body into the numeric runtime group, adds body0, and updates only the explicit test expression and its generated metadata.",
      "global-character-tone": "The accepted global character Tone feature adds scripted product and showcase commands, generated revisions, and semantic compiler output without changing asset references.",
      "cue-story-text-hard-cut": "The accepted Cue hard cut adds Game A and Harness acceptance branches, generated revisions, and canonical parser/compiler semantics without changing asset references.",
      "nani-inline-staged-text": "The accepted staged-text slice adds inline story stops, expands only opted-in lines into stable commands, and updates Game A and Harness revisions atomically.",
      "pinp-vn-surface": "The accepted Pinp Surface adds opaque texture commands, Game A and Harness showcases, generated asset references, and canonical parser/compiler output atomically.",
      "app-relative-asset-protocol-v5": "The App-relative asset hard update moves resource binding out of parser and runtime script IR, adopts slash AssetIds, and preserves VN identity and navigation semantics."
    });
  });

  for (const fixture of diagnosticGolden.cases) {
    it(`preserves diagnostic semantics, ordering, and exact spans for ${fixture.id}`, () => {
      const parsed = parseScenario({
        sourceText: fixture.sourceText,
        scriptPath: fixture.scriptPath
      });
      const compiled = compileRuntimeScript(parsed);

      expect({
        parser: parsed.diagnostics.map((diagnostic) => projectDiagnostic(fixture.sourceText, diagnostic)),
        compiler: compiled.diagnostics.map((diagnostic) => projectDiagnostic(fixture.sourceText, diagnostic))
      }).toEqual({ parser: fixture.parser, compiler: fixture.compiler });
    });
  }

  for (const [id, expected] of Object.entries(golden.corpora)) {
    it(`preserves complete parser/compiler semantics for ${id}`, () => {
      const sourceText = readFileSync(resolve(process.cwd(), expected.sourceFile), "utf8");
      const parsed = parseScenario({ sourceText, scriptPath: expected.scriptPath });
      const compiled = compileRuntimeScript(parsed);

      expect({
        sourceSha256: sha256Text(sourceText),
        sourceUtf16Length: sourceText.length,
        statementCount: parsed.scenario.statements.length,
        commandCount: compiled.script.commands.length,
        scenarioIRSha256: sha256Value(parsed.scenario),
        parserDiagnosticsSha256: sha256Value(
          parsed.diagnostics.map(({ code, message, severity, loc }) => ({ code, message, severity, loc }))
        ),
        runtimeScriptSha256: sha256Value(compiled.script),
        compilerDiagnosticsSha256: sha256Value(
          compiled.diagnostics.map(({ code, message, severity, loc }) => ({ code, message, severity, loc }))
        ),
        dependenciesSha256: sha256Value(compiled.script.dependencies)
      }).toEqual({
        sourceSha256: expected.sourceSha256,
        sourceUtf16Length: expected.sourceUtf16Length,
        statementCount: expected.statementCount,
        commandCount: expected.commandCount,
        scenarioIRSha256: expected.scenarioIRSha256,
        parserDiagnosticsSha256: expected.parserDiagnosticsSha256,
        runtimeScriptSha256: expected.runtimeScriptSha256,
        compilerDiagnosticsSha256: expected.compilerDiagnosticsSha256,
        dependenciesSha256: expected.dependenciesSha256
      });
    });
  }

  it("preserves generated revisions, requirements, voice indexes, and preload metadata", () => {
    const actualMetadata = {
      ...gameAScriptMetadataByPath,
      ...gameATestScriptMetadataByPath,
      ...harnessScriptMetadataByPath
    };

    for (const [scriptPath, expected] of Object.entries(golden.generatedMetadata)) {
      const metadata = actualMetadata[scriptPath as keyof typeof actualMetadata];
      expect(metadata, scriptPath).toBeDefined();
      expect({
        scriptRevision: metadata?.scriptRevision,
        metadataSha256: sha256Value(metadata),
        requirementsSha256: sha256Value(metadata?.requirements),
        characterPreloadPlanSha256: sha256Value(metadata?.characterPreloadPlan),
        voiceIndexSha256: sha256Value(metadata?.voiceIndex ?? {})
      }).toEqual(expected);
    }
  });
});

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Value(value: unknown): string {
  return sha256Text(JSON.stringify(stableJsonValue(value)));
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => item === undefined ? null : stableJsonValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map((key) => [key, stableJsonValue((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

function projectDiagnostic(
  sourceText: string,
  diagnostic: DiagnosticGoldenEntry
): DiagnosticGoldenEntry {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    loc: diagnostic.loc,
    span: diagnostic.span,
    lexeme: sourceText.slice(diagnostic.span.start, diagnostic.span.end)
  };
}

interface CorpusGolden {
  sourceFile: string;
  scriptPath: string;
  sourceSha256: string;
  sourceUtf16Length: number;
  statementCount: number;
  commandCount: number;
  scenarioIRSha256: string;
  parserDiagnosticsSha256: string;
  runtimeScriptSha256: string;
  compilerDiagnosticsSha256: string;
  dependenciesSha256: string;
}

interface GeneratedMetadataGolden {
  scriptRevision: string;
  metadataSha256: string;
  requirementsSha256: string;
  characterPreloadPlanSha256: string;
  voiceIndexSha256: string;
}

interface SemanticGolden {
  baseline: string;
  canonicalization: string;
  intentionalOverrides: Record<string, string>;
  corpora: Record<string, CorpusGolden>;
  generatedMetadata: Record<string, GeneratedMetadataGolden>;
}

interface DiagnosticGoldenEntry {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  loc: {
    scriptPath: string;
    line: number;
    column: number;
    raw: string;
  };
  span: { start: number; end: number };
  lexeme?: string;
}

interface DiagnosticGolden {
  baseline: string;
  cases: Array<{
    id: string;
    scriptPath: string;
    sourceText: string;
    parser: DiagnosticGoldenEntry[];
    compiler: DiagnosticGoldenEntry[];
  }>;
}
