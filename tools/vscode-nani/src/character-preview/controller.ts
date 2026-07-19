import { dirname } from "node:path";
import * as vscode from "vscode";
import type { NaniProjectAssetService } from "../project-resources";
import { CharacterPreviewEngine } from "./engine";
import {
  characterPreviewRequestKey,
  extractCharacterPreviewTarget
} from "./requestExtractor";
import type {
  CharacterPreviewRequest,
  CharacterPreviewTarget,
  PreviewArtifact
} from "./types";

interface LastValidPreview {
  request: CharacterPreviewRequest;
  artifact: PreviewArtifact;
}

interface PreviewFailure {
  key: string;
  message: string;
}

export class CharacterPreviewController implements vscode.Disposable {
  private readonly lastValid = new Map<string, Map<number, LastValidPreview>>();
  private readonly failures = new Map<string, Map<number, PreviewFailure>>();
  private readonly disposables: vscode.Disposable[] = [];
  private resourceGeneration = 0;

  constructor(
    private readonly engine: CharacterPreviewEngine,
    private readonly projectAssets: NaniProjectAssetService,
    private readonly output: vscode.OutputChannel
  ) {
    this.disposables.push(
      projectAssets.onDidInvalidate(() => {
        this.resourceGeneration += 1;
        this.engine.invalidate();
        this.lastValid.clear();
        this.failures.clear();
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!event.contentChanges.some((change) => /[\r\n]/u.test(change.text) || change.range.start.line !== change.range.end.line)) return;
        this.clearDocument(event.document.uri);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => this.clearDocument(document.uri))
    );
  }

  initialize(): Promise<void> {
    return this.engine.initialize();
  }

  targetAtLine(document: vscode.TextDocument, line: number): CharacterPreviewTarget | undefined {
    if (line < 0 || line >= document.lineCount) return undefined;
    return extractCharacterPreviewTarget(document.lineAt(line).text, {
      documentUri: document.uri.toString(),
      documentVersion: document.version,
      line,
      scriptPath: document.uri.fsPath || document.uri.toString()
    });
  }

  async provideHover(
    document: vscode.TextDocument,
    target: CharacterPreviewTarget,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    const range = target.kind === "request" ? target.request.identityRange : target.identityRange;
    const last = this.lastFor(document.uri, range.start.line);
    if (target.kind === "unavailable") {
      return this.hover(range, last, "invalid", target.message);
    }

    const request = target.request;
    const key = characterPreviewRequestKey(request);
    const hot = this.engine.peek(request);
    if (hot) {
      const current = { request, artifact: hot };
      this.setLast(document.uri, request.line, current);
      this.clearFailure(document.uri, request.line);
      return this.hover(request.identityRange, current, "ready");
    }
    const failure = this.failureFor(document.uri, request.line);
    if (failure?.key === key) return this.hover(request.identityRange, last, "invalid", failure.message);

    if (last && characterPreviewRequestKey(last.request) !== key) {
      void this.generate(document, request).catch(() => undefined);
      return this.hover(request.identityRange, last, "updating", "正在生成当前外观；再次悬停将显示最新结果。");
    }

    try {
      const current = await this.generate(document, request);
      if (!current || token.isCancellationRequested || document.version !== request.documentVersion) return undefined;
      return this.hover(request.identityRange, current, "ready");
    } catch (error) {
      if (token.isCancellationRequested) return undefined;
      return this.hover(request.identityRange, last, "invalid", errorMessage(error));
    }
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
    this.lastValid.clear();
    this.failures.clear();
    this.engine.invalidate();
  }

  private async generate(
    document: vscode.TextDocument,
    request: CharacterPreviewRequest
  ): Promise<LastValidPreview | undefined> {
    const key = characterPreviewRequestKey(request);
    const resourceGeneration = this.resourceGeneration;
    try {
      const descriptor = await this.projectAssets.getCharacterPackDescriptor(document.uri, request.characterId);
      if (!descriptor) {
        throw new Error(`未在当前项目的生成资产中找到角色 '${request.characterId}'。`);
      }
      if (resourceGeneration !== this.resourceGeneration) return undefined;
      const artifact = await this.engine.generate(request, descriptor);
      if (resourceGeneration !== this.resourceGeneration) return undefined;
      if (!this.requestIsCurrent(document, request, key)) return undefined;
      const current = { request, artifact };
      this.setLast(document.uri, request.line, current);
      this.clearFailure(document.uri, request.line);
      return current;
    } catch (error) {
      const message = errorMessage(error);
      if (resourceGeneration === this.resourceGeneration && this.requestIsCurrent(document, request, key)) {
        this.setFailure(document.uri, request.line, { key, message });
      }
      this.output.appendLine(`[char-preview] ${document.uri.toString()}:${request.line + 1} ${message}`);
      throw error;
    }
  }

  private requestIsCurrent(
    document: vscode.TextDocument,
    request: CharacterPreviewRequest,
    key: string
  ): boolean {
    if (document.isClosed || document.version !== request.documentVersion) return false;
    const current = this.targetAtLine(document, request.line);
    return current?.kind === "request" && characterPreviewRequestKey(current.request) === key;
  }

  private hover(
    range: import("../documentContext").NaniRange,
    last: LastValidPreview | undefined,
    status: "ready" | "updating" | "invalid",
    message?: string
  ): vscode.Hover {
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.supportHtml = true;
    markdown.isTrusted = false;
    if (last) {
      const expression = last.request.appearanceExpression || "default";
      markdown.appendMarkdown(`### ${escapeMarkdown(last.request.characterId)} · ${escapeMarkdown(expression)}\n\n`);
      const uri = vscode.Uri.file(last.artifact.path);
      markdown.baseUri = vscode.Uri.file(`${dirname(last.artifact.path)}/`);
      markdown.appendMarkdown(`<img src="${escapeHtml(uri.toString(true))}" width="320" height="420" alt="${escapeHtml(last.request.characterId)} character preview">\n\n`);
      markdown.appendMarkdown(`${last.artifact.layerCount} active layers · static layered composition\n\n`);
    } else {
      markdown.appendMarkdown("### Character preview\n\n");
    }
    if (status === "updating") {
      markdown.appendMarkdown(`> ⚠️ ${escapeMarkdown(message ?? "正在更新角色预览。")}\n`);
    } else if (status === "invalid") {
      const prefix = last ? "当前表达式无效，显示上次有效预览。 " : "无法生成角色预览。 ";
      markdown.appendMarkdown(`> ⚠️ ${escapeMarkdown(prefix + (message ?? "未知错误"))}\n`);
    }
    return new vscode.Hover(markdown, toVscodeRange(range));
  }

  private lastFor(uri: vscode.Uri, line: number): LastValidPreview | undefined {
    return this.lastValid.get(uri.toString())?.get(line);
  }

  private setLast(uri: vscode.Uri, line: number, value: LastValidPreview): void {
    const byLine = this.lastValid.get(uri.toString()) ?? new Map<number, LastValidPreview>();
    byLine.set(line, value);
    this.lastValid.set(uri.toString(), byLine);
  }

  private failureFor(uri: vscode.Uri, line: number): PreviewFailure | undefined {
    return this.failures.get(uri.toString())?.get(line);
  }

  private setFailure(uri: vscode.Uri, line: number, value: PreviewFailure): void {
    const byLine = this.failures.get(uri.toString()) ?? new Map<number, PreviewFailure>();
    byLine.set(line, value);
    this.failures.set(uri.toString(), byLine);
  }

  private clearFailure(uri: vscode.Uri, line: number): void {
    this.failures.get(uri.toString())?.delete(line);
  }

  private clearDocument(uri: vscode.Uri): void {
    this.lastValid.delete(uri.toString());
    this.failures.delete(uri.toString());
  }
}

function toVscodeRange(range: import("../documentContext").NaniRange): vscode.Range {
  return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character);
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+.!|>-]/gu, "\\$&");
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
