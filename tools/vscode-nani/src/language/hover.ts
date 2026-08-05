import * as vscode from "vscode";
import { getNaniHover } from "../hoverProvider";
import type { NaniProjectContextService } from "../projectContextService";
import { resolveNaniAssetReferenceAtOffset } from "../resourceReferences";

export async function provideLanguageHover(
  document: vscode.TextDocument,
  position: vscode.Position,
  project?: NaniProjectContextService
): Promise<vscode.Hover | undefined> {
  const [snapshot, loadedAssets] = project
    ? await Promise.all([project.getSnapshot(document.uri), project.getLoaded(document.uri)])
    : [undefined, undefined] as const;
  const navigation = snapshot && project?.isCurrent(snapshot)
    ? snapshot.analysis.navigation
    : undefined;
  if (loadedAssets) {
    const reference = resolveNaniAssetReferenceAtOffset(
      document.getText(),
      navigation?.currentScriptPath ?? document.uri.fsPath,
      document.offsetAt(position),
      loadedAssets.index
    );
    if (reference) {
      const range = new vscode.Range(
        document.positionAt(reference.span.start),
        document.positionAt(reference.span.end)
      );
      const identity = reference.characterId
        ? `Character: \`${reference.characterId}\`\n\nAssetId: \`${reference.assetId}\``
        : `AssetId: \`${reference.assetId}\``;
      return new vscode.Hover(new vscode.MarkdownString([
        `**Nani App asset · ${reference.usage}**`,
        "",
        identity,
        `MIME: \`${reference.asset.mimeType}\``,
        `Capability: \`${reference.capability}\``,
        `URI: \`${reference.asset.uri}\``
      ].join("\n\n")), range);
    }
  }
  const hover = getNaniHover(document.getText(), {
    line: position.line,
    character: position.character
  }, navigation);
  if (!hover) return undefined;
  return new vscode.Hover(
    new vscode.MarkdownString(hover.contents),
    new vscode.Range(
      hover.range.start.line,
      hover.range.start.character,
      hover.range.end.line,
      hover.range.end.character
    )
  );
}
