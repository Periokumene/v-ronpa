import { parseStaticNaniEndpoint } from "@v-ronpa/nani-parser";
import {
  getEndpointTokenAtPosition,
  lineAt,
  type NaniPosition,
  type NaniRange
} from "./documentContext";
import {
  commandDocumentationFact,
  inlineDocumentationFact,
  paramDocumentationFact,
  primaryDocumentationFact
} from "./languageFacts";
import { resolveNavigationTarget, type NaniNavigationIndex } from "./navigationAnalysis";

export interface NaniHover {
  range: NaniRange;
  contents: string;
}

interface TokenAtPosition {
  text: string;
  start: number;
  end: number;
}

export function getNaniHover(
  sourceText: string,
  position: NaniPosition,
  navigation?: NaniNavigationIndex
): NaniHover | undefined {
  const endpoint = navigationEndpointHover(sourceText, position, navigation);
  if (endpoint) return endpoint;
  const line = lineAt(sourceText, position.line);
  return inlineHover(line, position) ?? commandLineHover(line, position);
}

function navigationEndpointHover(
  sourceText: string,
  position: NaniPosition,
  navigation: NaniNavigationIndex | undefined
): NaniHover | undefined {
  if (!navigation) return undefined;
  const token = getEndpointTokenAtPosition(sourceText, position);
  if (!token) return undefined;
  const parsed = parseStaticNaniEndpoint(token.raw, navigation.currentScriptPath);
  const target = parsed.ok ? resolveNavigationTarget(token.raw, navigation) : undefined;
  if (!parsed.ok || !target) return undefined;
  const local = parsed.endpoint.scriptPath === navigation.currentScriptPath;
  return {
    range: token.range,
    contents: [
      `**Nani ${local ? "local" : "cross-script"} navigation target**`,
      "",
      `Script: \`${target.script.scriptPath}\``,
      `Target: ${target.label ? `\`#${target.label}\`` : "script start"}`,
      `Catalog: \`${navigation.catalogId}\``
    ].join("\n")
  };
}

function commandLineHover(line: string, position: NaniPosition): NaniHover | undefined {
  const commandMatch = /^(\s*)@([A-Za-z_<>][A-Za-z0-9_<>-]*)/u.exec(line);
  if (!commandMatch) return undefined;

  const commandId = commandMatch[2];
  if (!commandId) return undefined;
  const commandStart = (commandMatch[1]?.length ?? 0) + 1;
  const commandEnd = commandStart + commandId.length;
  if (position.character >= commandStart && position.character <= commandEnd) {
    const fact = commandDocumentationFact(commandId);
    return fact ? hover(position.line, commandStart, commandEnd, `${fact.detail}\n\n${fact.documentation}`) : undefined;
  }

  const token = tokenAt(line, position.character);
  if (!token || token.start <= commandEnd) return undefined;
  const paramName = paramNameFromToken(token.text);
  if (!paramName) {
    const firstArgumentOffset = line.slice(commandEnd).search(/\S/u);
    const firstArgumentStart = firstArgumentOffset >= 0
      ? commandEnd + firstArgumentOffset
      : -1;
    if (token.start !== firstArgumentStart) return undefined;
    const fact = primaryDocumentationFact(commandId);
    return fact ? hover(position.line, token.start, token.end, `${fact.detail} · primary\n\n${fact.documentation}`) : undefined;
  }
  const fact = paramDocumentationFact(commandId, paramName);
  return fact ? hover(position.line, token.start, token.end, `${fact.detail}\n\n${fact.documentation}`) : undefined;
}

function inlineHover(line: string, position: NaniPosition): NaniHover | undefined {
  const start = line.lastIndexOf("[", position.character);
  if (start < 0) return undefined;
  const end = line.indexOf("]", start + 1);
  if (end < position.character) return undefined;

  const raw = line.slice(start + 1, end).trim();
  if (!raw) return undefined;
  const inlineOffset = line.slice(start + 1, end).indexOf(raw);
  const contentStart = start + 1 + Math.max(0, inlineOffset);
  const commandMatch = /^([<>])/u.exec(raw);
  const commandId = commandMatch?.[1];
  if (!commandId) return undefined;
  const commandStart = contentStart;
  const commandEnd = commandStart + commandId.length;
  if (position.character >= commandStart && position.character <= commandEnd) {
    const fact = inlineDocumentationFact(commandId);
    return fact ? hover(position.line, commandStart, commandEnd, `${fact.detail}\n\n${fact.documentation}`) : undefined;
  }

  const token = tokenAt(line, position.character);
  if (!token || token.start <= commandEnd) return undefined;
  const paramName = paramNameFromToken(token.text);
  if (!paramName) return undefined;
  const fact = inlineDocumentationFact(commandId, paramName);
  return fact ? hover(position.line, token.start, token.end, `${fact.detail}\n\n${fact.documentation}`) : undefined;
}

function tokenAt(line: string, character: number): TokenAtPosition | undefined {
  for (const match of line.matchAll(/\S+/gu)) {
    const start = match.index ?? 0;
    const text = match[0] ?? "";
    const end = start + text.length;
    if (character >= start && character <= end) return { text, start, end };
  }
  return undefined;
}

function paramNameFromToken(token: string): string | undefined {
  if (token.startsWith("!") && token.length > 1) return trimTokenPunctuation(token.slice(1));
  if (token.endsWith("!") && token.length > 1) return trimTokenPunctuation(token.slice(0, -1));
  const colon = token.indexOf(":");
  if (colon <= 0) return undefined;
  return trimTokenPunctuation(token.slice(0, colon));
}

function trimTokenPunctuation(value: string): string {
  return value.replace(/^[\["']+/u, "").replace(/[\]"']+$/u, "");
}

function hover(line: number, start: number, end: number, contents: string): NaniHover {
  return {
    range: {
      start: { line, character: start },
      end: { line, character: Math.max(start + 1, end) }
    },
    contents
  };
}
