import { collectLabels, getCompletionContext, type NaniPosition, type NaniRange } from "./documentContext";
import { allowedValueCompletionFacts, commandCompletionFacts, paramCompletionFacts } from "./languageFacts";
import { emptyProjectAssetIndex, type NaniProjectAssetIndex } from "./projectAssets";
import { getNaniResourceCompletions } from "./resourceCompletions";
import type { NaniDeferredCompletionDocumentation } from "./resourceCompletions";

export type NaniCompletionKind = "command" | "param" | "value" | "label" | "snippet" | "resource";

export interface NaniCompletion {
  label: string;
  insertText: string;
  kind: NaniCompletionKind;
  range: NaniRange;
  detail?: string;
  documentation?: string;
  deferredDocumentation?: NaniDeferredCompletionDocumentation;
  isSnippet: boolean;
  sortText?: string;
}

export function getNaniCompletions(
  sourceText: string,
  position: NaniPosition,
  projectAssets: NaniProjectAssetIndex = emptyProjectAssetIndex
): NaniCompletion[] {
  const context = getCompletionContext(sourceText, position);
  const resources = getNaniResourceCompletions(sourceText, position, projectAssets);
  const resourceCompletions: NaniCompletion[] = (resources?.completions ?? []).map((completion) => ({
    ...completion,
    kind: "resource",
    isSnippet: false
  }));

  if (resources && !resources.combineWithParams) return resourceCompletions;

  if (context.kind === "command") {
    return commandCompletionFacts().map((fact) => ({
      label: fact.label,
      insertText: `${context.insertAtSign ? "@" : ""}${fact.label}`,
      kind: "command",
      range: context.range,
      detail: fact.detail,
      documentation: fact.documentation,
      isSnippet: false,
      sortText: fact.sortText
    }));
  }

  if (context.kind === "param") {
    const paramCompletions: NaniCompletion[] = paramCompletionFacts(context.commandId, context.usedParams).map((fact) => ({
      label: fact.label,
      insertText: fact.insertText,
      kind: "param",
      range: context.range,
      detail: fact.detail,
      documentation: fact.documentation,
      isSnippet: fact.isSnippet,
      sortText: fact.sortText
    }));
    return [...resourceCompletions, ...paramCompletions];
  }

  if (context.kind === "param-value") {
    return allowedValueCompletionFacts(context.commandId, context.paramName)
      .filter((fact) => fact.label.toLowerCase().startsWith(context.prefix.toLowerCase()))
      .map((fact) => ({
        label: fact.label,
        insertText: fact.insertText,
        kind: "value",
        range: context.range,
        detail: fact.detail,
        documentation: fact.documentation,
        isSnippet: false,
        sortText: fact.sortText
      }));
  }

  if (context.kind === "label") {
    return collectLabels(sourceText)
      .filter((label) => label.toLowerCase().startsWith(context.prefix.toLowerCase()))
      .map((label, index) => ({
        label: `#${label}`,
        insertText: label,
        kind: "label",
        range: context.range,
        detail: "Current file label",
        isSnippet: false,
        sortText: index.toString().padStart(4, "0")
      }));
  }

  if (context.kind === "inline") {
    return [
      {
        label: "[>]",
        insertText: "[>]",
        kind: "snippet",
        range: context.range,
        detail: "Inline auto-next command",
        isSnippet: false,
        sortText: "0"
      },
      {
        label: "[< speed:0.8]",
        insertText: "[< speed:${1:0.8}]",
        kind: "snippet",
        range: context.range,
        detail: "Inline print speed command",
        isSnippet: true,
        sortText: "1"
      }
    ];
  }

  return [];
}
