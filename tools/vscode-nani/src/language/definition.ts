import * as vscode from "vscode";
import { parseStaticNaniEndpoint } from "@v-ronpa/nani-parser";
import { getEndpointTokenAtPosition } from "../documentContext";
import { offsetRange, resolveNavigationTarget } from "../navigationAnalysis";
import { NANI_LANGUAGE_ID } from "../languageFacts";
import type { NaniProjectContextService } from "../projectContextService";
import { resolveNaniAssetReferenceAtOffset } from "../resourceReferences";

export function registerDefinitionProvider(
  context: vscode.ExtensionContext,
  project: NaniProjectContextService
): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: NANI_LANGUAGE_ID },
      {
        async provideDefinition(document, position) {
          const [snapshot, loadedAssets] = await Promise.all([
            project.getSnapshot(document.uri),
            project.getLoaded(document.uri)
          ]);
          const currentScriptPath = snapshot?.analysis.navigation.currentScriptPath ?? document.uri.fsPath;
          if (loadedAssets) {
            const reference = resolveNaniAssetReferenceAtOffset(
              document.getText(),
              currentScriptPath,
              document.offsetAt(position),
              loadedAssets.index
            );
            if (reference) {
              const target = new vscode.Range(0, 0, 0, 0);
              return [{
                originSelectionRange: new vscode.Range(
                  document.positionAt(reference.span.start),
                  document.positionAt(reference.span.end)
                ),
                targetUri: vscode.Uri.file(reference.asset.sourcePath),
                targetRange: target,
                targetSelectionRange: target
              } satisfies vscode.LocationLink];
            }
          }
          if (!snapshot || !project.isCurrent(snapshot)) return undefined;
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
