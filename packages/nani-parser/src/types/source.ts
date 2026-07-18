export interface TextSpan {
  readonly start: number;
  readonly end: number;
}

export type NaniSourceRef =
  | {
      readonly kind: "statement";
      readonly statementIndex: number;
      readonly part: "whole" | "marker" | "name";
    }
  | {
      readonly kind: "command-name";
      readonly statementIndex: number;
    }
  | ({
      readonly kind: "command-argument";
      readonly statementIndex: number;
      readonly argumentIndex: number;
    } & (
      | { readonly part: "value"; readonly itemIndex?: number }
      | { readonly part: "whole" | "key" | "colon" | "flag-marker"; readonly itemIndex?: never }
    ))
  | {
      readonly kind: "label-name";
      readonly statementIndex: number;
    }
  | {
      readonly kind: "text-part";
      readonly statementIndex: number;
      readonly part: "whole" | "speaker" | "appearance" | "body";
    }
  | {
      readonly kind: "inline-command";
      readonly statementIndex: number;
      readonly tokenIndex: number;
      readonly part: "whole" | "marker" | "name";
    }
  | ({
      readonly kind: "inline-command-argument";
      readonly statementIndex: number;
      readonly tokenIndex: number;
      readonly argumentIndex: number;
    } & (
      | { readonly part: "value"; readonly itemIndex?: number }
      | { readonly part: "whole" | "key" | "colon" | "flag-marker"; readonly itemIndex?: never }
    ))
  | {
      readonly kind: "text-id";
      readonly statementIndex: number;
      readonly markerIndex: number;
      readonly part: "whole" | "value";
    };

export interface NaniCommandArgumentSourceMap {
  readonly span: TextSpan;
  readonly keySpan?: TextSpan;
  readonly colonSpan?: TextSpan;
  readonly valueSpan?: TextSpan;
  readonly flagMarkerSpan?: TextSpan;
  readonly itemSpans: readonly TextSpan[];
}

export interface NaniCommandSourceMap {
  readonly span: TextSpan;
  readonly markerSpan: TextSpan;
  readonly nameSpan: TextSpan;
  readonly arguments: readonly NaniCommandArgumentSourceMap[];
}

export interface NaniTextIdSourceMap {
  readonly span: TextSpan;
  readonly valueSpan: TextSpan;
}

export interface NaniInlineCommandSourceMap {
  readonly tokenIndex: number;
  readonly command: NaniCommandSourceMap;
}

export interface NaniStatementSourceMap {
  readonly kind: "comment" | "label" | "command" | "text";
  readonly span: TextSpan;
  readonly markerSpan?: TextSpan;
  readonly nameSpan?: TextSpan;
  readonly speakerSpan?: TextSpan;
  readonly appearanceSpan?: TextSpan;
  readonly bodySpan?: TextSpan;
  readonly command?: NaniCommandSourceMap;
  readonly inlineCommands: readonly NaniInlineCommandSourceMap[];
  readonly textIds: readonly NaniTextIdSourceMap[];
}

export interface NaniSourceMap {
  readonly scriptPath: string;
  readonly sourceLength: number;
  readonly statements: readonly NaniStatementSourceMap[];
}
