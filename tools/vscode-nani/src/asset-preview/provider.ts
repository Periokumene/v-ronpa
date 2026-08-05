import { dirname } from "node:path";
import * as vscode from "vscode";
import type {
  DeferredCompletionDocumentationContext,
  DeferredCompletionDocumentationProvider
} from "../language/register";
import type { NaniAssetHoverPreviewProvider } from "../language/hover";
import type { NaniProjectAsset } from "../projectAssets";
import type { NaniProjectContextService } from "../project-resources";
import { AssetImagePreviewEngine, isDirectlyPreviewableImageMimeType, isImageMimeType } from "./engine";
import { ASSET_IMAGE_PREVIEW_HEIGHT, ASSET_IMAGE_PREVIEW_WIDTH } from "./svgRenderer";

export class AssetImagePreviewProvider
implements DeferredCompletionDocumentationProvider, NaniAssetHoverPreviewProvider, vscode.Disposable {
  private resourceGeneration = 0;
  private readonly invalidationSubscription: vscode.Disposable;

  constructor(
    private readonly engine: AssetImagePreviewEngine,
    private readonly projectAssets: NaniProjectContextService,
    private readonly output: vscode.OutputChannel
  ) {
    this.invalidationSubscription = projectAssets.onDidInvalidate(() => {
      this.resourceGeneration += 1;
      this.engine.invalidate();
    });
  }

  async provideCompletionDocumentation(
    context: DeferredCompletionDocumentationContext,
    token: vscode.CancellationToken
  ): Promise<vscode.MarkdownString | undefined> {
    if (context.deferredDocumentation.kind !== "asset-image") return undefined;
    const assetId = context.deferredDocumentation.assetId;
    if (!this.completionIsCurrent(context, token)) return undefined;
    const generation = this.resourceGeneration;
    const index = await this.projectAssets.getIndex(context.documentUri);
    const asset = index.assets.find((candidate) => candidate.id === assetId);
    if (!asset || !isImageMimeType(asset.mimeType)) return undefined;
    if (generation !== this.resourceGeneration || !this.completionIsCurrent(context, token)) return undefined;
    return this.documentation(asset, context.documentUri, token, generation, "completion");
  }

  async appendAssetHoverPreview(
    markdown: vscode.MarkdownString,
    documentUri: vscode.Uri,
    asset: NaniProjectAsset,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (!isImageMimeType(asset.mimeType) || token.isCancellationRequested) return;
    markdown.supportHtml = true;
    markdown.isTrusted = false;
    markdown.appendMarkdown("\n\n");
    const generation = this.resourceGeneration;
    await this.appendPreview(markdown, asset, documentUri, token, generation, "hover");
  }

  dispose(): void {
    this.invalidationSubscription.dispose();
    this.engine.invalidate();
  }

  private async documentation(
    asset: NaniProjectAsset,
    documentUri: vscode.Uri,
    token: vscode.CancellationToken,
    generation: number,
    surface: "completion" | "hover"
  ): Promise<vscode.MarkdownString | undefined> {
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.supportHtml = true;
    markdown.isTrusted = false;
    markdown.appendMarkdown(`### ${escapeMarkdown(asset.id)}\n\n`);
    markdown.appendMarkdown(`MIME: \`${asset.mimeType}\`\n\nURI: \`${escapeCode(asset.uri)}\`\n\n`);
    await this.appendPreview(markdown, asset, documentUri, token, generation, surface);
    if (generation !== this.resourceGeneration || token.isCancellationRequested) return undefined;
    return markdown;
  }

  private async appendPreview(
    markdown: vscode.MarkdownString,
    asset: NaniProjectAsset,
    documentUri: vscode.Uri,
    token: vscode.CancellationToken,
    generation: number,
    surface: "completion" | "hover"
  ): Promise<void> {
    if (!isDirectlyPreviewableImageMimeType(asset.mimeType)) {
      markdown.appendMarkdown("> ⚠️ KTX2 是有效图像资源，但当前 VS Code 预览器不支持直接显示该格式。\n");
      return;
    }
    try {
      const artifact = await this.engine.generate(asset);
      if (generation !== this.resourceGeneration || token.isCancellationRequested) return;
      markdown.baseUri = vscode.Uri.file(`${dirname(artifact.path)}/`);
      const uri = vscode.Uri.file(artifact.path).toString(true);
      markdown.appendMarkdown(`<img src="${escapeHtml(uri)}" width="${ASSET_IMAGE_PREVIEW_WIDTH}" height="${ASSET_IMAGE_PREVIEW_HEIGHT}" alt="${escapeHtml(asset.id)} asset preview">\n\n`);
      markdown.appendMarkdown("固定框 · 完整显示 · 保持比例\n");
    } catch (error) {
      if (generation !== this.resourceGeneration || token.isCancellationRequested) return;
      this.output.appendLine(
        `[asset-preview] ${surface} ${documentUri.toString()} ${asset.id} ${errorMessage(error)}`
      );
      markdown.appendMarkdown("> ⚠️ 无法生成该图像资源的预览；详情见 V-Ronpa Nani 输出。\n");
    }
  }

  private completionIsCurrent(
    context: DeferredCompletionDocumentationContext,
    token: vscode.CancellationToken
  ): boolean {
    if (token.isCancellationRequested) return false;
    const document = vscode.workspace.textDocuments.find(
      (candidate) => candidate.uri.toString() === context.documentUri.toString()
    );
    return Boolean(document && !document.isClosed && document.version === context.documentVersion);
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+.!|>-]/gu, "\\$&");
}

function escapeCode(value: string): string {
  return value.replace(/`/gu, "\\`");
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
