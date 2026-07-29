import { collectLabels, getCompletionContext, type NaniPosition, type NaniRange } from "./documentContext";
import {
  allowedValueCompletionFacts,
  commandCompletionFacts,
  paramCompletionFacts,
  primaryValueCompletionFacts
} from "./languageFacts";
import { emptyProjectAssetIndex, type NaniProjectAssetIndex } from "./projectAssets";
import { getNaniResourceCompletions } from "./resourceCompletions";
import type { NaniDeferredCompletionDocumentation } from "./resourceCompletions";
import type { NaniNavigationIndex } from "./navigationAnalysis";

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
  projectAssets: NaniProjectAssetIndex = emptyProjectAssetIndex,
  navigation?: NaniNavigationIndex
): NaniCompletion[] {
  const context = getCompletionContext(sourceText, position);
  const resources = getNaniResourceCompletions(sourceText, position, projectAssets);
  const resourceCompletions: NaniCompletion[] = (resources?.completions ?? []).map((completion) => ({
    ...completion,
    kind: "resource",
    isSnippet: false
  }));

  if (resources && !resources.combineWithParams) return resourceCompletions;

  if (context.kind === "endpoint") {
    if (context.phase === "label") {
      const labels = context.targetPath
        ? [...(navigation?.scripts.get(context.targetPath)?.labels
          ? Object.keys(navigation.scripts.get(context.targetPath)?.labels ?? {})
          : [])]
        : collectLabels(sourceText);
      return labels
        .filter((label) => label.toLowerCase().startsWith(context.prefix.toLowerCase()))
        .map((label, index) => ({
          label: `#${label}`,
          insertText: label,
          kind: "label" as const,
          range: context.range,
          detail: context.targetPath
            ? `Label in ${context.targetPath}`
            : "Current file label",
          isSnippet: false,
          sortText: `0${index.toString().padStart(4, "0")}`
        }));
    }
    const localLabels = collectLabels(sourceText)
      .map((label) => `#${label}`)
      .filter((label) => label.toLowerCase().startsWith(context.prefix.toLowerCase()))
      .map((label, index): NaniCompletion => ({
        label,
        insertText: label,
        kind: "label",
        range: context.range,
        detail: "Current file label",
        isSnippet: false,
        sortText: `0${index.toString().padStart(4, "0")}`
      }));
    const scriptPaths = navigation
      ? [...navigation.scripts.keys()]
        .filter((scriptPath) =>
          scriptPath.toLowerCase().startsWith(context.prefix.toLowerCase())
        )
        .map((scriptPath, index): NaniCompletion => ({
          label: scriptPath,
          insertText: scriptPath,
          kind: "resource",
          range: context.range,
          detail: `Nani script · ${navigation.catalogId}`,
          isSnippet: false,
          sortText: `1${index.toString().padStart(4, "0")}`
        }))
      : [];
    return [...localLabels, ...scriptPaths];
  }

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
    const primaryFacts = context.primaryCandidate
      ? primaryValueCompletionFacts(context.commandId)
      : [];
    const primaryCompletions: NaniCompletion[] = primaryFacts
      .filter((fact) =>
        fact.label.toLowerCase().startsWith(context.primaryCandidate?.prefix.toLowerCase() ?? "")
      )
      .map((fact) => ({
        label: fact.label,
        insertText: fact.insertText,
        kind: "value",
        range: context.primaryCandidate?.range ?? context.range,
        detail: `${fact.detail} · primary`,
        documentation: fact.documentation,
        isSnippet: false,
        sortText: `0-primary-${fact.sortText}`
      }));
    if (context.primaryCandidate?.prefix && primaryFacts.length > 0) {
      return primaryCompletions;
    }
    return [...resourceCompletions, ...primaryCompletions, ...paramCompletions];
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
