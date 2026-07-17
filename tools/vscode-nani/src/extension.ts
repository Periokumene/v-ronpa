import * as vscode from "vscode";
import { getNaniCompletions, type NaniCompletionKind } from "./completionProvider";
import { computeNaniDiagnostics, type NaniDiagnostic } from "./diagnostics";
import { getNaniHover } from "./hoverProvider";
import { NANI_LANGUAGE_ID } from "./languageFacts";
import type { NaniRange } from "./documentContext";
import { NaniProjectAssetService } from "./projectAssetService";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(NANI_LANGUAGE_ID);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const output = vscode.window.createOutputChannel("V-Ronpa Nani");
  const projectAssets = new NaniProjectAssetService(output);

  context.subscriptions.push(diagnostics, output, projectAssets);
  context.subscriptions.push(
    vscode.commands.registerCommand("v-ronpa-nani.refreshProjectAssets", () => {
      projectAssets.refreshAll();
      void vscode.window.showInformationMessage("V-Ronpa Nani project assets refreshed.");
    })
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: NANI_LANGUAGE_ID },
      {
        async provideCompletionItems(document, position) {
          const assetIndex = await projectAssets.getIndex(document.uri);
          return getNaniCompletions(document.getText(), {
            line: position.line,
            character: position.character
          }, assetIndex).map(toVscodeCompletion);
        }
      },
      "@",
      " ",
      ":",
      "#",
      "[",
      "!",
      ".",
      ","
    )
  );
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: NANI_LANGUAGE_ID },
      {
        provideHover(document, position) {
          const hover = getNaniHover(document.getText(), {
            line: position.line,
            character: position.character
          });
          if (!hover) return undefined;
          return new vscode.Hover(new vscode.MarkdownString(hover.contents), toVscodeRange(hover.range));
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => refreshDiagnostics(document, diagnostics)),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleDiagnostics(event.document, diagnostics, timers)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      clearScheduledDiagnostic(document, timers);
      diagnostics.delete(document.uri);
    })
  );

  for (const document of vscode.workspace.textDocuments) {
    refreshDiagnostics(document, diagnostics);
  }
}

export function deactivate(): void {
  // No persistent resources.
}

function scheduleDiagnostics(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
  timers: Map<string, ReturnType<typeof setTimeout>>
): void {
  if (!isNaniDocument(document)) return;
  clearScheduledDiagnostic(document, timers);
  const key = document.uri.toString();
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      refreshDiagnostics(document, diagnostics);
    }, 250)
  );
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

function refreshDiagnostics(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): void {
  if (!isNaniDocument(document)) return;
  const scriptPath = document.uri.fsPath || document.uri.toString();
  diagnostics.set(document.uri, computeNaniDiagnostics(document.getText(), scriptPath).map(toVscodeDiagnostic));
}

function isNaniDocument(document: vscode.TextDocument): boolean {
  return document.languageId === NANI_LANGUAGE_ID || document.fileName.endsWith(".nani");
}

function toVscodeCompletion(completion: ReturnType<typeof getNaniCompletions>[number]): vscode.CompletionItem {
  const item = new vscode.CompletionItem(completion.label, completionKind(completion.kind));
  item.insertText = completion.isSnippet ? new vscode.SnippetString(completion.insertText) : completion.insertText;
  item.range = toVscodeRange(completion.range);
  if (completion.detail) item.detail = completion.detail;
  if (completion.documentation) item.documentation = completion.documentation;
  if (completion.sortText) item.sortText = completion.sortText;
  return item;
}

function toVscodeDiagnostic(diagnostic: NaniDiagnostic): vscode.Diagnostic {
  const vscodeDiagnostic = new vscode.Diagnostic(
    toVscodeRange(diagnostic.range),
    diagnostic.message,
    diagnosticSeverity(diagnostic.severity)
  );
  vscodeDiagnostic.source = diagnostic.source;
  if (diagnostic.code) vscodeDiagnostic.code = diagnostic.code;
  return vscodeDiagnostic;
}

function toVscodeRange(range: NaniRange): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  );
}

function completionKind(kind: NaniCompletionKind): vscode.CompletionItemKind {
  switch (kind) {
    case "command":
      return vscode.CompletionItemKind.Function;
    case "param":
      return vscode.CompletionItemKind.Property;
    case "value":
      return vscode.CompletionItemKind.Value;
    case "label":
      return vscode.CompletionItemKind.Reference;
    case "snippet":
      return vscode.CompletionItemKind.Snippet;
    case "resource":
      return vscode.CompletionItemKind.File;
  }
}

function diagnosticSeverity(severity: NaniDiagnostic["severity"]): vscode.DiagnosticSeverity {
  switch (severity) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "info":
      return vscode.DiagnosticSeverity.Information;
  }
}
