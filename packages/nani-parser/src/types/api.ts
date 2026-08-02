import type { ScenarioIR, SourceLocation } from "./ir";
import type { NaniSourceMap, TextSpan } from "./source";

export type NaniParserDiagnosticCode =
  | "duplicate-label"
  | "invalid-text-id"
  | "multiple-text-ids"
  | "duplicate-text-id"
  | "invalid-rich-text"
  | "unsupported-inline-command"
  | "invalid-inline-command-argument"
  | "invalid-inline-command-value"
  | "invalid-inline-stage-wait"
  | "invalid-inline-stage-boundary"
  | "invalid-inline-stage-command"
  | "invalid-inline-stage-position"
  | "unclosed-command-quote"
  | "unclosed-command-expression"
  | "invalid-command-param-spacing"
  | "missing-local-label";

export interface NaniSourceDiagnostic<Code extends string = string> {
  readonly code: Code;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly loc: SourceLocation;
  readonly span: TextSpan;
}

export interface NaniParserDiagnostic extends NaniSourceDiagnostic<NaniParserDiagnosticCode> {}

export interface ParseScenarioInput {
  sourceText: string;
  scriptPath: string;
}

export interface ParsedScenarioDocument {
  scenario: ScenarioIR;
  sourceMap: NaniSourceMap;
}

export interface ParseScenarioResult extends ParsedScenarioDocument {
  diagnostics: readonly NaniParserDiagnostic[];
}
