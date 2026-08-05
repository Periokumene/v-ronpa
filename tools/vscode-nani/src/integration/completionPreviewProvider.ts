import { dirname } from "node:path";
import * as vscode from "vscode";
import type { CharacterPreviewEngine } from "../character-preview/engine";
import {
  CHARACTER_PREVIEW_HEIGHT,
  CHARACTER_PREVIEW_WIDTH,
  CHARACTER_TOKEN_PREVIEW_HEIGHT,
  CHARACTER_TOKEN_PREVIEW_WIDTH
} from "../character-preview/svgRenderer";
import type { CharacterPreviewRequest } from "../character-preview/types";
import type {
  DeferredCompletionDocumentationContext,
  DeferredCompletionDocumentationProvider
} from "../language/register";
import type { NaniProjectContextService } from "../project-resources";

export class CharacterCompletionPreviewProvider
implements DeferredCompletionDocumentationProvider, vscode.Disposable {
  private resourceGeneration = 0;
  private readonly invalidationSubscription: vscode.Disposable;

  constructor(
    private readonly engine: CharacterPreviewEngine,
    private readonly projectAssets: NaniProjectContextService,
    private readonly output: vscode.OutputChannel
  ) {
    this.invalidationSubscription = projectAssets.onDidInvalidate(() => {
      this.resourceGeneration += 1;
    });
  }

  async provideCompletionDocumentation(
    context: DeferredCompletionDocumentationContext,
    token: vscode.CancellationToken
  ): Promise<vscode.MarkdownString | undefined> {
    if (context.deferredDocumentation.kind !== "character-appearance-token") return undefined;
    if (!this.isCurrent(context, token)) return undefined;
    const generation = this.resourceGeneration;
    const candidate = context.deferredDocumentation;
    const appearanceExpression = [candidate.baseAppearanceExpression, candidate.candidateToken]
      .filter(Boolean)
      .join(",");
    const request: CharacterPreviewRequest = {
      documentUri: context.documentUri.toString(),
      documentVersion: context.documentVersion,
      line: context.line,
      identityRange: context.completion.range,
      characterId: candidate.characterId,
      appearanceExpression
    };

    try {
      const descriptor = await this.projectAssets.getCharacterPackDescriptor(
        context.documentUri,
        candidate.characterId
      );
      if (!descriptor) throw new Error(`Character pack not found: ${candidate.characterId}`);
      if (generation !== this.resourceGeneration || !this.isCurrent(context, token)) return undefined;
      const artifacts = await this.engine.generateCompletion(
        request,
        candidate.baseAppearanceExpression,
        descriptor
      );
      if (generation !== this.resourceGeneration || !this.isCurrent(context, token)) return undefined;
      return completionMarkdown(candidate.candidateToken, artifacts);
    } catch (error) {
      if (!this.isCurrent(context, token)) return undefined;
      this.output.appendLine(
        `[char-preview] completion ${context.documentUri.toString()}:${context.line + 1} ${errorMessage(error)}`
      );
      return completionFailureMarkdown(candidate.candidateToken);
    }
  }

  dispose(): void {
    this.invalidationSubscription.dispose();
  }

  private isCurrent(
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

function completionMarkdown(
  candidateToken: string,
  artifacts: Awaited<ReturnType<CharacterPreviewEngine["generateCompletion"]>>
): vscode.MarkdownString {
  const markdown = markdownDocument(candidateToken);
  markdown.baseUri = vscode.Uri.file(`${dirname(artifacts.complete.path)}/`);
  if (artifacts.contribution) {
    markdown.appendMarkdown("**当前候选**\n\n");
    markdown.appendMarkdown(imageMarkup(
      artifacts.contribution.path,
      CHARACTER_TOKEN_PREVIEW_WIDTH,
      CHARACTER_TOKEN_PREVIEW_HEIGHT,
      `${candidateToken} candidate preview`,
      280
    ));
  } else {
    markdown.appendMarkdown("*该候选没有新增的独立图像。*\n\n");
  }
  markdown.appendMarkdown("**应用后的角色**\n\n");
  markdown.appendMarkdown(imageMarkup(
    artifacts.complete.path,
    CHARACTER_PREVIEW_WIDTH,
    CHARACTER_PREVIEW_HEIGHT,
    `${candidateToken} complete character preview`,
    220
  ));
  markdown.appendMarkdown("静态分层组装\n");
  return markdown;
}

function completionFailureMarkdown(candidateToken: string): vscode.MarkdownString {
  const markdown = markdownDocument(candidateToken);
  markdown.appendMarkdown("> ⚠️ 无法生成这个候选的角色预览；详情见 V-Ronpa Nani 输出。\n");
  return markdown;
}

function markdownDocument(candidateToken: string): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.supportHtml = true;
  markdown.isTrusted = false;
  markdown.appendMarkdown(`### ${escapeMarkdown(candidateToken)}\n\n`);
  return markdown;
}

function imageMarkup(
  path: string,
  sourceWidth: number,
  sourceHeight: number,
  alt: string,
  displayWidth: number
): string {
  const displayHeight = Math.round(displayWidth * sourceHeight / sourceWidth);
  const uri = vscode.Uri.file(path).toString(true);
  return `<img src="${escapeHtml(uri)}" width="${displayWidth}" height="${displayHeight}" alt="${escapeHtml(alt)}">\n\n`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+.!|>-]/gu, "\\$&");
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
