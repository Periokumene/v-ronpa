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

export interface AllowedValueCompletionFact {
  label: string;
  insertText: string;
  detail: string;
  documentation: string;
  sortText: string;
}

export interface DocumentationFact {
  detail: string;
  documentation: string;
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

export function allowedValueCompletionFacts(commandId: string, paramName: string): AllowedValueCompletionFact[] {
  const definition = getNaniCommandDefinition(commandId);
  if (!definition) return [];
  const param = findParam(definition, paramName);
  const allowedValues = param?.docs?.allowedValues;
  if (!param || !allowedValues?.length) return [];

  return allowedValues.map((value, index) => ({
    label: value,
    insertText: value,
    detail: `${definition.canonicalName} ${param.name} value`,
    documentation: paramDocumentation(param),
    sortText: index.toString().padStart(4, "0")
  }));
}

function commandDocumentation(definition: NaniCommandDefinition): string {
  const zh = definition.docs?.zh ? `${definition.docs.zh}\n\n` : "";
  const aliases = definition.aliases && definition.aliases.length > 0 ? `\nAliases: ${definition.aliases.join(", ")}` : "";
  const params = definition.params.length > 0 ? `\nParams: ${definition.params.map((param) => `${param.name}:${param.type}`).join(", ")}` : "";
  const examples = definition.docs?.examples?.length ? `\nExamples:\n${definition.docs.examples.map((example) => `- ${example}`).join("\n")}` : "";
  const runtimeNote = definition.docs?.runtimeNoteZh ? `\nRuntime: ${definition.docs.runtimeNoteZh}` : "";
  return `${zh}Source: ${definition.source}\nExecution: ${definition.execution}${aliases}${params}${runtimeNote}${examples}`;
}

function paramDocumentation(param: NaniCommandParamSpec): string {
  const docs = param.docs;
  const zh = docs?.zh ? `${docs.zh}\n\n` : "";
  const defaultValue = docs?.defaultValue !== undefined ? `\nDefault: ${String(docs.defaultValue)}` : "";
  const recommendedRange = docs?.recommendedRange ? `\nRecommended: ${formatRecommendedRange(docs.recommendedRange)}` : "";
  const allowedValues = docs?.allowedValues?.length ? `\nAllowed: ${docs.allowedValues.join(", ")}` : "";
  const examples = docs?.examples?.length ? `\nExamples:\n${docs.examples.map((example) => `- ${example}`).join("\n")}` : "";
  const runtimeSupport = docs?.runtimeSupport ? `\nRuntime support: ${docs.runtimeSupport}` : "";
  const runtimeNote = docs?.runtimeNoteZh ? `\nRuntime: ${docs.runtimeNoteZh}` : "";
  const required = param.required ? "\nRequired." : "";
  const repeatable = param.repeatable ? "\nRepeatable." : "";
  const source = param.source ? `\nSource: ${param.source}.` : "";
  return `${zh}Type: ${param.type}.${required}${repeatable}${source}${defaultValue}${recommendedRange}${allowedValues}${runtimeSupport}${runtimeNote}${examples}`;
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

export function commandDocumentationFact(commandId: string): DocumentationFact | undefined {
  const definition = getNaniCommandDefinition(commandId);
  if (!definition) return undefined;
  return {
    detail: `${definition.canonicalName} · ${definition.category} · ${definition.status}`,
    documentation: commandDocumentation(definition)
  };
}

export function paramDocumentationFact(commandId: string, paramName: string): DocumentationFact | undefined {
  const definition = getNaniCommandDefinition(commandId);
  if (!definition) return undefined;
  const param = findParam(definition, paramName);
  if (!param) return undefined;
  return {
    detail: `${definition.canonicalName} parameter · ${param.type}`,
    documentation: paramDocumentation(param)
  };
}

export function inlineDocumentationFact(commandId: string, paramName?: string): DocumentationFact | undefined {
  if (commandId === ">") {
    return {
      detail: "Inline auto-next command",
      documentation: "当前文本行显示完成后自动推进到下一步。"
    };
  }
  if (commandId !== "<") return undefined;
  if (!paramName) {
    return {
      detail: "Inline print control command",
      documentation: "调整当前文本行的显示参数。首轮支持 `speed:<decimal>`。"
    };
  }
  if (normalize(paramName) !== "speed") return undefined;
  return {
    detail: "Inline print speed parameter · decimal",
    documentation: "设置当前文本行的显示速度倍率。\n\nType: decimal.\nRecommended: 0..2. 0 表示立即显示；建议 0.5 到 1.5 之间微调。\nExamples:\n- speed:0.8"
  };
}

function formatRecommendedRange(range: NonNullable<NaniCommandParamSpec["docs"]>["recommendedRange"]): string {
  if (!range) return "";
  const min = range.min !== undefined ? String(range.min) : "";
  const max = range.max !== undefined ? String(range.max) : "";
  const bounds = min || max ? `${min}..${max}` : "see note";
  const unit = range.unit ? ` ${range.unit}` : "";
  const note = range.noteZh ? `. ${range.noteZh}` : "";
  return `${bounds}${unit}${note}`;
}

function findParam(definition: NaniCommandDefinition, paramName: string): NaniCommandParamSpec | undefined {
  return definition.params.find(
    (candidate) => normalize(candidate.name) === normalize(paramName) || candidate.aliases?.some((alias) => normalize(alias) === normalize(paramName))
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
