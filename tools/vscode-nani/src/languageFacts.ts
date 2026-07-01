import {
  getNaniCommandDefinition,
  naniCommandCatalog,
  type NaniCommandDefinition,
  type NaniCommandParamSpec
} from "@v-ronpa/contracts";

export const NANI_LANGUAGE_ID = "nani";

export interface CommandCompletionFact {
  label: string;
  canonicalName: string;
  commandId: string;
  detail: string;
  documentation: string;
  sortText: string;
}

export interface ParamCompletionFact {
  label: string;
  insertText: string;
  detail: string;
  documentation: string;
  isSnippet: boolean;
  sortText: string;
}

export function commandCompletionFacts(): CommandCompletionFact[] {
  return naniCommandCatalog.flatMap((definition, definitionIndex) => {
    const names = [definition.canonicalName, ...(definition.aliases ?? [])];
    return names.map((name, nameIndex) => ({
      label: name,
      canonicalName: definition.canonicalName,
      commandId: definition.id,
      detail: `${definition.category} · ${definition.status}`,
      documentation: commandDocumentation(definition),
      sortText: `${definition.status === "implemented" ? "0" : "1"}-${definitionIndex.toString().padStart(4, "0")}-${nameIndex}`
    }));
  });
}

export function paramCompletionFacts(commandId: string, usedParams: Set<string> = new Set()): ParamCompletionFact[] {
  const definition = getNaniCommandDefinition(commandId);
  if (!definition) return [];

  const facts: ParamCompletionFact[] = [];
  definition.params.forEach((param, index) => {
    if (usedParams.has(param.name.toLowerCase())) return;

    facts.push({
      label: `${param.name}:`,
      insertText: `${param.name}:${placeholderForParam(param)}`,
      detail: `${definition.canonicalName} parameter · ${param.type}`,
      documentation: paramDocumentation(param),
      isSnippet: true,
      sortText: `0-${index.toString().padStart(4, "0")}`
    });

    if (!param.type.toLowerCase().includes("boolean")) return;
    facts.push({
      label: `${param.name}!`,
      insertText: `${param.name}!`,
      detail: `${definition.canonicalName} boolean flag · true`,
      documentation: paramDocumentation(param),
      isSnippet: false,
      sortText: `1-${index.toString().padStart(4, "0")}`
    });
    facts.push({
      label: `!${param.name}`,
      insertText: `!${param.name}`,
      detail: `${definition.canonicalName} boolean flag · false`,
      documentation: paramDocumentation(param),
      isSnippet: false,
      sortText: `2-${index.toString().padStart(4, "0")}`
    });
  });

  return facts;
}

function commandDocumentation(definition: NaniCommandDefinition): string {
  const aliases = definition.aliases && definition.aliases.length > 0 ? `\nAliases: ${definition.aliases.join(", ")}` : "";
  const params = definition.params.length > 0 ? `\nParams: ${definition.params.map((param) => `${param.name}:${param.type}`).join(", ")}` : "";
  return `Source: ${definition.source}\nExecution: ${definition.execution}${aliases}${params}`;
}

function paramDocumentation(param: NaniCommandParamSpec): string {
  const required = param.required ? "\nRequired." : "";
  const repeatable = param.repeatable ? "\nRepeatable." : "";
  const source = param.source ? `\nSource: ${param.source}.` : "";
  return `${param.description ?? param.type}.${required}${repeatable}${source}`;
}

function placeholderForParam(param: NaniCommandParamSpec): string {
  const type = param.type.toLowerCase();
  if (type.includes("decimal")) return "${1:0.8}";
  if (type.includes("integer")) return "${1:1}";
  if (type.includes("boolean")) return "${1:true}";
  if (type.includes("list")) return "${1:value1,value2}";
  if (param.name.toLowerCase().includes("goto")) return "#${1:Label}";
  if (param.name.toLowerCase().includes("expression")) return "{${1:condition}}";
  return "${1:value}";
}
