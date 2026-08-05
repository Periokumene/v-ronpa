import {
  collectLabels,
  getCompletionContext,
  getInlineTextMode,
  lineAt,
  type NaniPosition,
  type NaniRange
} from "./documentContext";
import {
  allowedValueCompletionFacts,
  commandCompletionFacts,
  paramCompletionFacts,
  primaryValueCompletionFacts
} from "./languageFacts";
import { emptyProjectAssetIndex, type NaniProjectAssetIndex } from "./projectAssets";
import { getNaniResourceCompletions, pinpAuthoringState } from "./resourceCompletions";
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
  const fontSnippet = fontFaceSnippetCompletion(sourceText, position);
  if (fontSnippet) return [fontSnippet];
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
    const pinp = pinpAuthoringState(sourceText, position);
    const hiddenPinpParams = pinp.hide
      ? new Set(["assetId:", "pos:", "height:", "ratio:", "alt:", ...(pinp.effectNone ? ["time:"] : [])])
      : new Set<string>();
    const paramCompletions: NaniCompletion[] = paramCompletionFacts(context.commandId, context.usedParams)
      .filter((fact) => !hiddenPinpParams.has(fact.label))
      .map((fact) => ({
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
    const staged: NaniCompletion[] = [
      {
        label: "[-]",
        insertText: "[-]",
        kind: "snippet",
        range: context.range,
        detail: "Inline staged-text input stop",
        documentation: "提交当前累计正文并等待一次输入，然后继续显示同一条剧情文本。",
        isSnippet: false,
        sortText: "2"
      },
      ...(context.mode === "explicit-unquoted" ? [] : [{
        label: "[wait i]",
        insertText: "[wait i]",
        kind: "snippet" as const,
        range: context.range,
        detail: "Inline staged-text input stop · long form",
        documentation: "`[-]` 的等价长写法；在显式 `@print` / `@cue` 中仅允许放在引号正文内。",
        isSnippet: false,
        sortText: "3"
      }])
    ];
    if (context.mode !== "dialogue") return staged;
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
      },
      ...staged
    ];
  }

  return [];
}

function fontFaceSnippetCompletion(
  sourceText: string,
  position: NaniPosition
): NaniCompletion | undefined {
  const line = lineAt(sourceText, position.line);
  const before = line.slice(0, Math.min(position.character, line.length));
  if (!getInlineTextMode(line, position.character)) return undefined;
  const match = /<(?:f(?:o(?:n(?:t)?)?)?)?$/iu.exec(before);
  if (!match) return undefined;
  const start = match.index;
  return {
    label: "<font face=\"serif\">…</font>",
    insertText: "<font face=\"${1:serif}\">${2:text}</font>",
    kind: "snippet",
    range: {
      start: { line: position.line, character: start },
      end: { line: position.line, character: position.character }
    },
    detail: "Rich text FontFaceId",
    documentation: "使用小写 slash-free FontFaceId；字体注册由 App manifest 管理。",
    isSnippet: true,
    sortText: "0-font-face"
  };
}
