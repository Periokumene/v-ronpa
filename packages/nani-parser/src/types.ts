export interface SourceLocation {
  scriptPath: string;
  line: number;
  column: number;
  raw: string;
}

export interface Diagnostic {
  severity: "info" | "warning" | "error";
  message: string;
  loc?: SourceLocation;
}

export type NaniValue =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "list"; value: NaniValue[] }
  | { type: "expression"; source: string }
  | { type: "raw"; value: string };

export interface ConditionIR {
  source: string;
}

export type CommandArgIR =
  | {
      kind: "value";
      raw: string;
      value: NaniValue;
    }
  | {
      kind: "param";
      raw: string;
      key: string;
      value: NaniValue;
    }
  | {
      kind: "flag";
      raw: string;
      key: string;
      value: boolean;
    };

export interface CommandIR {
  kind: "command";
  commandId: string;
  args: CommandArgIR[];
  primary?: NaniValue;
  params: Record<string, NaniValue>;
  flags: Record<string, boolean>;
  inlineIndex?: number;
  children?: StatementIR[];
  condition?: ConditionIR;
  unless?: ConditionIR;
  loc: SourceLocation;
}

export interface TextTokenText {
  kind: "text";
  text: string;
}

export interface TextTokenInlineCommand {
  kind: "inline-command";
  command: CommandIR;
}

export type TextToken = TextTokenText | TextTokenInlineCommand;

export interface TextIR {
  kind: "text";
  speaker?: string;
  appearance?: string;
  tokens: TextToken[];
  printParams?: Record<string, NaniValue>;
  loc: SourceLocation;
}

export interface LabelIR {
  kind: "label";
  name: string;
  loc: SourceLocation;
}

export interface CommentIR {
  kind: "comment";
  text: string;
  loc: SourceLocation;
}

export type StatementIR = CommandIR | TextIR | LabelIR | CommentIR;

export interface AssetRef {
  id: string;
  kind: string;
  uri?: string;
}

export interface ScriptDependency {
  endpoint: string;
}

export interface ScenarioIR {
  scriptPath: string;
  statements: StatementIR[];
  labels: Record<string, number>;
  assets: AssetRef[];
  dependencies: ScriptDependency[];
}

export interface ParseScenarioInput {
  sourceText: string;
  scriptPath: string;
  baseUrl?: string;
}

export interface ParseScenarioResult {
  scenario: ScenarioIR;
  diagnostics: Diagnostic[];
}

export interface ParserPort {
  parseScenario(input: ParseScenarioInput): ParseScenarioResult;
}
