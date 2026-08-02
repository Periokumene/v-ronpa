import type {
  NaniCommandArgumentSourceMap,
  NaniCommandSourceMap,
  NaniSourceMap,
  NaniSourceRef,
  NaniStatementSourceMap,
  TextSpan
} from "./types";

export function resolveNaniSourceRef(sourceMap: NaniSourceMap, ref: NaniSourceRef): TextSpan {
  assertNaniSourceRef(ref);
  const statement = sourceStatement(sourceMap, ref.statementIndex);
  switch (ref.kind) {
    case "statement":
      return validateSpan(sourceMap, requiredSpan(statement[statementPartKey(ref.part)], ref));
    case "command-name":
      requireStatementKind(statement, "command", ref);
      return validateSpan(sourceMap, requiredCommand(statement, ref).nameSpan);
    case "command-argument":
      requireStatementKind(statement, "command", ref);
      return validateSpan(
        sourceMap,
        commandArgumentSpan(requiredCommand(statement, ref), ref.argumentIndex, ref.part, ref.itemIndex, ref)
      );
    case "label-name":
      requireStatementKind(statement, "label", ref);
      return validateSpan(sourceMap, requiredSpan(statement.nameSpan, ref));
    case "text-part":
      requireStatementKind(statement, "text", ref);
      return validateSpan(sourceMap, requiredSpan(statement[textPartKey(ref.part)], ref));
    case "inline-command": {
      requireInlineCommandStatementKind(statement, ref);
      const command = requiredInlineCommand(statement, ref.tokenIndex, ref).command;
      return validateSpan(sourceMap, requiredSpan(command[inlineCommandPartKey(ref.part)], ref));
    }
    case "inline-command-argument": {
      requireInlineCommandStatementKind(statement, ref);
      const command = requiredInlineCommand(statement, ref.tokenIndex, ref).command;
      return validateSpan(
        sourceMap,
        commandArgumentSpan(command, ref.argumentIndex, ref.part, ref.itemIndex, ref)
      );
    }
    case "text-id": {
      requireStatementKind(statement, "text", ref);
      const marker = statement.textIds[ref.markerIndex];
      if (!marker) throw unresolvedSourceRef(ref);
      return validateSpan(sourceMap, ref.part === "whole" ? marker.span : marker.valueSpan);
    }
    default:
      throw unresolvedSourceRef(ref);
  }
}

function sourceStatement(sourceMap: NaniSourceMap, statementIndex: number): NaniStatementSourceMap {
  if (!isNonNegativeInteger(statementIndex)) {
    throw new Error(`Nani source ref has invalid statement index ${String(statementIndex)} in ${sourceMap.scriptPath}.`);
  }
  const statement = sourceMap.statements[statementIndex];
  if (!statement) {
    throw new Error(`Nani source ref points to missing statement ${statementIndex} in ${sourceMap.scriptPath}.`);
  }
  if (!statementKinds.has(statement.kind)) {
    throw new Error(`Nani source map contains invalid statement kind ${String(statement.kind)} in ${sourceMap.scriptPath}.`);
  }
  return statement;
}

const statementKinds = new Set<NaniStatementSourceMap["kind"]>([
  "comment",
  "label",
  "command",
  "text"
]);

function assertNaniSourceRef(ref: NaniSourceRef): void {
  const candidate = ref as unknown as Record<string, unknown>;
  if (!candidate || typeof candidate !== "object" || typeof candidate.kind !== "string") {
    throw unresolvedSourceRef(ref);
  }
  if (!isNonNegativeInteger(candidate.statementIndex)) throw unresolvedSourceRef(ref);

  switch (candidate.kind) {
    case "statement":
      assertPart(candidate.part, ["whole", "marker", "name"], ref);
      return;
    case "command-name":
    case "label-name":
      return;
    case "command-argument":
      assertArgumentRef(candidate, ref);
      return;
    case "text-part":
      assertPart(candidate.part, ["whole", "speaker", "appearance", "body"], ref);
      return;
    case "inline-command":
      assertNonNegativeInteger(candidate.tokenIndex, ref);
      assertPart(candidate.part, ["whole", "marker", "name"], ref);
      return;
    case "inline-command-argument":
      assertNonNegativeInteger(candidate.tokenIndex, ref);
      assertArgumentRef(candidate, ref);
      return;
    case "text-id":
      assertNonNegativeInteger(candidate.markerIndex, ref);
      assertPart(candidate.part, ["whole", "value"], ref);
      return;
    default:
      throw unresolvedSourceRef(ref);
  }
}

function assertArgumentRef(candidate: Record<string, unknown>, ref: NaniSourceRef): void {
  assertNonNegativeInteger(candidate.argumentIndex, ref);
  assertPart(candidate.part, ["whole", "key", "colon", "value", "flag-marker"], ref);
  if (candidate.itemIndex !== undefined) {
    if (candidate.part !== "value") throw unresolvedSourceRef(ref);
    assertNonNegativeInteger(candidate.itemIndex, ref);
  }
}

function assertPart(value: unknown, allowed: readonly string[], ref: NaniSourceRef): void {
  if (typeof value !== "string" || !allowed.includes(value)) throw unresolvedSourceRef(ref);
}

function assertNonNegativeInteger(value: unknown, ref: NaniSourceRef): void {
  if (!isNonNegativeInteger(value)) throw unresolvedSourceRef(ref);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function requireStatementKind(
  statement: NaniStatementSourceMap,
  expected: NaniStatementSourceMap["kind"],
  ref: NaniSourceRef
): void {
  if (statement.kind !== expected) throw unresolvedSourceRef(ref);
}

function requireInlineCommandStatementKind(
  statement: NaniStatementSourceMap,
  ref: NaniSourceRef
): void {
  if (statement.kind !== "text" && statement.kind !== "command") throw unresolvedSourceRef(ref);
}

function requiredCommand(statement: NaniStatementSourceMap, ref: NaniSourceRef): NaniCommandSourceMap {
  if (!statement.command) throw unresolvedSourceRef(ref);
  return statement.command;
}

function requiredInlineCommand(statement: NaniStatementSourceMap, tokenIndex: number, ref: NaniSourceRef) {
  const inline = statement.inlineCommands.find((candidate) => candidate.tokenIndex === tokenIndex);
  if (!inline) throw unresolvedSourceRef(ref);
  return inline;
}

function commandArgumentSpan(
  command: NaniCommandSourceMap,
  argumentIndex: number,
  part: "whole" | "key" | "colon" | "value" | "flag-marker",
  itemIndex: number | undefined,
  ref: NaniSourceRef
): TextSpan {
  const argument = command.arguments[argumentIndex];
  if (!argument) throw unresolvedSourceRef(ref);
  if (itemIndex !== undefined) {
    if (part !== "value") throw unresolvedSourceRef(ref);
    return requiredSpan(argument.itemSpans[itemIndex], ref);
  }
  return requiredSpan(argument[argumentPartKey(part)], ref);
}

function statementPartKey(part: "whole" | "marker" | "name"): "span" | "markerSpan" | "nameSpan" {
  if (part === "whole") return "span";
  return part === "marker" ? "markerSpan" : "nameSpan";
}

function textPartKey(
  part: "whole" | "speaker" | "appearance" | "body"
): "span" | "speakerSpan" | "appearanceSpan" | "bodySpan" {
  switch (part) {
    case "whole":
      return "span";
    case "speaker":
      return "speakerSpan";
    case "appearance":
      return "appearanceSpan";
    case "body":
      return "bodySpan";
  }
}

function inlineCommandPartKey(part: "whole" | "marker" | "name"): "span" | "markerSpan" | "nameSpan" {
  if (part === "whole") return "span";
  return part === "marker" ? "markerSpan" : "nameSpan";
}

function argumentPartKey(
  part: "whole" | "key" | "colon" | "value" | "flag-marker"
): "span" | "keySpan" | "colonSpan" | "valueSpan" | "flagMarkerSpan" {
  switch (part) {
    case "whole":
      return "span";
    case "key":
      return "keySpan";
    case "colon":
      return "colonSpan";
    case "value":
      return "valueSpan";
    case "flag-marker":
      return "flagMarkerSpan";
  }
}

function requiredSpan(span: TextSpan | undefined, ref: NaniSourceRef): TextSpan {
  if (!span) throw unresolvedSourceRef(ref);
  return span;
}

function validateSpan(sourceMap: NaniSourceMap, span: TextSpan): TextSpan {
  if (
    !Number.isInteger(sourceMap.sourceLength) ||
    sourceMap.sourceLength < 0 ||
    !Number.isInteger(span.start) ||
    !Number.isInteger(span.end) ||
    span.start < 0 ||
    span.end < span.start ||
    span.end > sourceMap.sourceLength
  ) {
    throw new Error(
      `Nani source span [${span.start}, ${span.end}) is outside ${sourceMap.scriptPath} (${sourceMap.sourceLength}).`
    );
  }
  return span;
}

function unresolvedSourceRef(ref: NaniSourceRef): Error {
  return new Error(`Unable to resolve Nani source ref: ${JSON.stringify(ref)}.`);
}
