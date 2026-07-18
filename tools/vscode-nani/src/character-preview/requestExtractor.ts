import { parseScenario, type CommandIR, type NaniValue } from "@v-ronpa/nani-parser";
import type { NaniRange } from "../documentContext";
import type { CharacterPreviewRequest, CharacterPreviewTarget } from "./types";

export interface CharacterPreviewExtractionContext {
  documentUri: string;
  documentVersion: number;
  line: number;
  scriptPath: string;
}

interface StaticIdentity {
  characterId: string;
  appearanceExpression: string;
}

export function extractCharacterPreviewTarget(
  lineText: string,
  context: CharacterPreviewExtractionContext
): CharacterPreviewTarget | undefined {
  const parsed = parseScenario({ sourceText: lineText, scriptPath: context.scriptPath });
  const statement = parsed.scenario.statements[0];
  const source = parsed.sourceMap.statements[0]?.command;
  if (!statement || statement.kind !== "command" || statement.commandId.toLowerCase() !== "char" || !source) {
    return undefined;
  }

  const primaryIndex = statement.args.findIndex((argument) => argument.kind === "value");
  const appearanceIndex = primaryIndex >= 0 ? primaryIndex : paramIndex(statement, "idAndAppearance");
  const idIndex = paramIndex(statement, "id");
  const identityIndex = appearanceIndex >= 0 ? appearanceIndex : idIndex;
  if (identityIndex < 0) return undefined;
  const identitySpan = source.arguments[identityIndex]?.valueSpan;
  if (!identitySpan) return undefined;
  const identityRange = lineRange(context.line, identitySpan.start, identitySpan.end);

  const appearanceValue = appearanceIndex >= 0 ? argumentValue(statement, appearanceIndex) : undefined;
  const named = appearanceValue ? staticIdentity(appearanceValue) : { characterId: "", appearanceExpression: "" };
  if (appearanceValue && !named) {
    return unavailable(identityRange, "动态角色或外观表达式无法生成静态预览。");
  }

  const idOverride = idIndex >= 0 ? staticScalarString(argumentValue(statement, idIndex)) : undefined;
  if (idIndex >= 0 && idOverride === undefined) {
    return unavailable(identityRange, "动态角色 ID 无法生成静态预览。");
  }

  const characterId = idOverride ?? named?.characterId ?? "";
  const appearanceExpression = named?.appearanceExpression ?? "";
  if (!characterId) return unavailable(identityRange, "缺少可预览的静态角色 ID。");
  if (characterId === "*") return unavailable(identityRange, "通配角色目标无法生成静态预览。");

  const request: CharacterPreviewRequest = {
    documentUri: context.documentUri,
    documentVersion: context.documentVersion,
    line: context.line,
    identityRange,
    characterId,
    appearanceExpression
  };
  return { kind: "request", request };
}

export function characterPreviewRequestKey(request: CharacterPreviewRequest): string {
  return [request.documentUri, request.line, request.characterId, request.appearanceExpression].join("\u0000");
}

export function rangeContainsCharacter(range: NaniRange, character: number): boolean {
  return character >= range.start.character && character <= range.end.character;
}

function paramIndex(command: CommandIR, name: string): number {
  const normalized = name.toLowerCase();
  return command.args.findIndex(
    (argument) => argument.kind === "param" && argument.key.toLowerCase() === normalized
  );
}

function argumentValue(command: CommandIR, index: number): NaniValue | undefined {
  const argument = command.args[index];
  return argument && argument.kind !== "flag" ? argument.value : undefined;
}

function staticIdentity(value: NaniValue): StaticIdentity | undefined {
  if (value.type === "expression") return undefined;
  if (value.type === "list") {
    const [first, ...rest] = value.value;
    const firstValue = staticScalarString(first);
    if (firstValue === undefined) return undefined;
    const dot = firstValue.indexOf(".");
    if (dot < 0) return { characterId: firstValue, appearanceExpression: "" };
    const tail: string[] = [firstValue.slice(dot + 1)];
    for (const item of rest) {
      const scalar = staticScalarString(item, true);
      if (scalar !== undefined && scalar.length > 0) tail.push(scalar);
    }
    return { characterId: firstValue.slice(0, dot), appearanceExpression: tail.join(",") };
  }
  const scalar = staticScalarString(value);
  if (scalar === undefined) return undefined;
  const dot = scalar.indexOf(".");
  return dot < 0
    ? { characterId: scalar, appearanceExpression: "" }
    : { characterId: scalar.slice(0, dot), appearanceExpression: scalar.slice(dot + 1) };
}

function staticScalarString(value: NaniValue | undefined, coerce = false): string | undefined {
  if (!value) return undefined;
  if (value.type === "string" || value.type === "raw") return value.value;
  if (coerce && (value.type === "number" || value.type === "boolean")) return String(value.value);
  return undefined;
}

function lineRange(line: number, start: number, end: number): NaniRange {
  return {
    start: { line, character: start },
    end: { line, character: Math.max(start + 1, end) }
  };
}

function unavailable(identityRange: NaniRange, message: string): CharacterPreviewTarget {
  return { kind: "unavailable", identityRange, message };
}
