import * as vscode from "vscode";
import { getNaniHover } from "../hoverProvider";
import type { NaniProjectScriptService } from "../projectScriptService";

export async function provideLanguageHover(
  document: vscode.TextDocument,
  position: vscode.Position,
  scripts?: NaniProjectScriptService
): Promise<vscode.Hover | undefined> {
  const snapshot = scripts ? await scripts.getSnapshot(document.uri) : undefined;
  const navigation = snapshot && scripts?.isCurrent(snapshot)
    ? snapshot.analysis.navigation
    : undefined;
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
