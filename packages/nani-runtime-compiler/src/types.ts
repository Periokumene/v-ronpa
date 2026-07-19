import type { RuntimeValue } from "@v-ronpa/contracts";
import type { CommandIR, NaniSourceMap, NaniValue } from "@v-ronpa/nani-parser";

export interface CommandShape {
  primary?: NaniValue;
  params: Record<string, NaniValue>;
  flags: Record<string, boolean>;
  condition?: CommandIR["condition"];
  unless?: CommandIR["unless"];
}

export interface BoundArgumentOrigin {
  argumentIndex: number;
  promoted?: boolean;
}

export interface CommandOrigins {
  primary?: BoundArgumentOrigin;
  params: Record<string, BoundArgumentOrigin>;
  flags: Record<string, BoundArgumentOrigin>;
}

export interface BoundCommand {
  shape: CommandShape;
  origins: CommandOrigins;
}

export interface CommandDiagnosticContext {
  command: CommandIR;
  sourceMap: NaniSourceMap;
  statementIndex: number;
}

export interface CommandNormalizerDescriptor {
  acceptsPrimary: boolean;
  consumedParams: readonly string[];
  normalize: (command: CommandShape) => Record<string, RuntimeValue>;
}
