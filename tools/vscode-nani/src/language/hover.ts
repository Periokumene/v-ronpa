import * as vscode from "vscode";
import { getNaniHover } from "../hoverProvider";
import type { NaniProjectContextService } from "../projectContextService";
import type { NaniProjectAsset } from "../projectAssets";
import { resolveNaniAssetReferenceAtOffset } from "../resourceReferences";

export interface NaniAssetHoverPreviewProvider {
  appendAssetHoverPreview(
    markdown: vscode.MarkdownString,
    documentUri: vscode.Uri,
    asset: NaniProjectAsset,
    token: vscode.CancellationToken
  ): Promise<void>;
}

export async function provideLanguageHover(
  document: vscode.TextDocument,
  position: vscode.Position,
  project: NaniProjectContextService,
  assetPreview: NaniAssetHoverPreviewProvider | undefined,
  token: vscode.CancellationToken
): Promise<vscode.Hover | undefined> {
  const [snapshot, loadedAssets] = await Promise.all([
    project.getSnapshot(document.uri),
    project.getLoaded(document.uri)
  ]);
  const navigation = snapshot && project.isCurrent(snapshot)
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
      const markdown = new vscode.MarkdownString([
        `**Nani App asset · ${reference.usage}**`,
        "",
        identity,
        `MIME: \`${reference.asset.mimeType}\``,
        `Capability: \`${reference.capability}\``,
        `URI: \`${reference.asset.uri}\``
      ].join("\n\n"));
      if (assetPreview) {
        await assetPreview.appendAssetHoverPreview(markdown, document.uri, reference.asset, token);
        if (token.isCancellationRequested) return undefined;
      }
      return new vscode.Hover(markdown, range);
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
