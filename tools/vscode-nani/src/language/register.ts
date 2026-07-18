import * as vscode from "vscode";
import {
  getNaniCompletions,
  type NaniCompletion,
  type NaniCompletionKind
} from "../completionProvider";
import {
  assertValidNaniDiagnosticSpan,
  computeNaniDiagnostics,
  type NaniDiagnostic
} from "../diagnostics";
import { NANI_LANGUAGE_ID } from "../languageFacts";
import type { NaniProjectAssetService } from "../project-resources";

export interface DeferredCompletionDocumentationContext {
  documentUri: vscode.Uri;
  documentVersion: number;
  line: number;
  completion: NaniCompletion;
  deferredDocumentation: NonNullable<NaniCompletion["deferredDocumentation"]>;
}

export interface DeferredCompletionDocumentationProvider {
  provideCompletionDocumentation(
    context: DeferredCompletionDocumentationContext,
    token: vscode.CancellationToken
  ): Promise<vscode.MarkdownString | undefined>;
}

export function registerLanguageFeatures(
  context: vscode.ExtensionContext,
  projectAssets: NaniProjectAssetService,
  output: vscode.OutputChannel,
  deferredDocumentationProvider?: DeferredCompletionDocumentationProvider
): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(NANI_LANGUAGE_ID);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const completionProvider: vscode.CompletionItemProvider<NaniVscodeCompletionItem> = {
    async provideCompletionItems(document, position) {
      const assetIndex = await projectAssets.getIndex(document.uri);
      return getNaniCompletions(document.getText(), {
        line: position.line,
        character: position.character
      }, assetIndex).map((completion) => toVscodeCompletion(
        completion,
        document.uri,
        document.version,
        position.line
      ));
    },
    async resolveCompletionItem(item, token) {
      const completion = item.completion;
      const deferredDocumentation = completion.deferredDocumentation;
      if (!deferredDocumentationProvider || !deferredDocumentation) return item;
      const documentation = await deferredDocumentationProvider.provideCompletionDocumentation({
        documentUri: item.documentUri,
        documentVersion: item.documentVersion,
        line: item.line,
        completion,
        deferredDocumentation
      }, token);
      if (documentation && !token.isCancellationRequested) item.documentation = documentation;
      return item;
    }
  };
  context.subscriptions.push(diagnostics);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: NANI_LANGUAGE_ID },
      completionProvider,
      "@", " ", ":", "#", "[", "!", ".", ","
    ),
    vscode.workspace.onDidOpenTextDocument(
      (document) => void refreshDiagnostics(document, diagnostics, output)
    ),
    vscode.workspace.onDidChangeTextDocument((event) =>
      scheduleDiagnostics(event.document, diagnostics, timers, output)
    ),
    vscode.workspace.onDidCloseTextDocument((document) => {
      clearScheduledDiagnostic(document, timers);
      diagnostics.delete(document.uri);
    })
  );
  for (const document of vscode.workspace.textDocuments) {
    void refreshDiagnostics(document, diagnostics, output);
  }
}

function scheduleDiagnostics(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
  timers: Map<string, ReturnType<typeof setTimeout>>,
  output: vscode.OutputChannel
): void {
  if (!isNaniDocument(document)) return;
  clearScheduledDiagnostic(document, timers);
  const key = document.uri.toString();
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    void refreshDiagnostics(document, diagnostics, output);
  }, 250));
}

function clearScheduledDiagnostic(
  document: vscode.TextDocument,
  timers: Map<string, ReturnType<typeof setTimeout>>
): void {
  const key = document.uri.toString();
  const timer = timers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  timers.delete(key);
}

async function refreshDiagnostics(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
  output: vscode.OutputChannel
): Promise<void> {
  if (!isNaniDocument(document)) return;
  const version = document.version;
  const sourceText = document.getText();
  const scriptPath = document.uri.fsPath || document.uri.toString();
  await Promise.resolve();
  try {
    const computed = computeNaniDiagnostics(sourceText, scriptPath);
    if (document.isClosed || document.version !== version) return;
    const mapped = computed.map((diagnostic) => toVscodeDiagnostic(document, diagnostic, sourceText.length));
    if (document.isClosed || document.version !== version) return;
    diagnostics.set(document.uri, mapped);
  } catch (error) {
    if (document.isClosed || document.version !== version) return;
    output.appendLine(`[diagnostics] Failed to map ${document.uri.toString()} at version ${version}: ${errorText(error)}`);
    diagnostics.delete(document.uri);
  }
}

function isNaniDocument(document: vscode.TextDocument): boolean {
  return document.languageId === NANI_LANGUAGE_ID || document.fileName.endsWith(".nani");
}

class NaniVscodeCompletionItem extends vscode.CompletionItem {
  constructor(
    readonly completion: NaniCompletion,
    readonly documentUri: vscode.Uri,
    readonly documentVersion: number,
    readonly line: number
  ) {
    super(completion.label, completionKind(completion.kind));
  }
}

function toVscodeCompletion(
  completion: NaniCompletion,
  documentUri: vscode.Uri,
  documentVersion: number,
  line: number
): NaniVscodeCompletionItem {
  const item = new NaniVscodeCompletionItem(completion, documentUri, documentVersion, line);
  item.insertText = completion.isSnippet ? new vscode.SnippetString(completion.insertText) : completion.insertText;
  item.range = toVscodeRange(completion.range);
  if (completion.detail) item.detail = completion.detail;
  if (completion.documentation) item.documentation = completion.documentation;
  if (completion.sortText) item.sortText = completion.sortText;
  return item;
}

function toVscodeDiagnostic(
  document: vscode.TextDocument,
  diagnostic: NaniDiagnostic,
  sourceLength: number
): vscode.Diagnostic {
  assertValidNaniDiagnosticSpan(diagnostic, sourceLength);
  const mapped = new vscode.Diagnostic(
    new vscode.Range(document.positionAt(diagnostic.span.start), document.positionAt(diagnostic.span.end)),
    diagnostic.message,
    diagnosticSeverity(diagnostic.severity)
  );
  mapped.source = diagnostic.source;
  mapped.code = diagnostic.code;
  return mapped;
}

function toVscodeRange(range: import("../documentContext").NaniRange): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  );
}

function completionKind(kind: NaniCompletionKind): vscode.CompletionItemKind {
  switch (kind) {
    case "command": return vscode.CompletionItemKind.Function;
    case "param": return vscode.CompletionItemKind.Property;
    case "value": return vscode.CompletionItemKind.Value;
    case "label": return vscode.CompletionItemKind.Reference;
    case "snippet": return vscode.CompletionItemKind.Snippet;
    case "resource": return vscode.CompletionItemKind.File;
  }
}

function diagnosticSeverity(severity: NaniDiagnostic["severity"]): vscode.DiagnosticSeverity {
  switch (severity) {
    case "error": return vscode.DiagnosticSeverity.Error;
    case "warning": return vscode.DiagnosticSeverity.Warning;
    case "info": return vscode.DiagnosticSeverity.Information;
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}
