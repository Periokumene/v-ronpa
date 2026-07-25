import * as vscode from "vscode";
import { parseStaticNaniEndpoint } from "@v-ronpa/nani-parser";
import { getEndpointTokenAtPosition } from "../documentContext";
import { offsetRange, resolveNavigationTarget } from "../navigationAnalysis";
import { NANI_LANGUAGE_ID } from "../languageFacts";
import type { NaniProjectScriptService } from "../projectScriptService";

export function registerDefinitionProvider(
  context: vscode.ExtensionContext,
  scripts: NaniProjectScriptService
): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: NANI_LANGUAGE_ID },
      {
        async provideDefinition(document, position) {
          const snapshot = await scripts.getSnapshot(document.uri);
          if (!snapshot || !scripts.isCurrent(snapshot)) return undefined;
          const token = getEndpointTokenAtPosition(document.getText(), {
            line: position.line,
            character: position.character
          });
          if (!token) return undefined;
          const parsed = parseStaticNaniEndpoint(
            token.raw,
            snapshot.analysis.navigation.currentScriptPath
          );
          const target = parsed.ok
            ? resolveNavigationTarget(token.raw, snapshot.analysis.navigation)
            : undefined;
          if (!parsed.ok || !target) return undefined;
          const targetUri = vscode.Uri.parse(target.script.sourceUri);
          const targetSelection = target.labelSpan
            ? toVscodeRange(offsetRange(target.script.sourceText, target.labelSpan))
            : new vscode.Range(0, 0, 0, 0);
          return [{
            originSelectionRange: toVscodeRange(token.range),
            targetUri,
            targetRange: targetSelection,
            targetSelectionRange: targetSelection
          } satisfies vscode.LocationLink];
        }
      }
    )
  );
}

function toVscodeRange(range: import("../documentContext").NaniRange): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  );
}
