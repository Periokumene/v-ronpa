import * as vscode from "vscode";
import { getNaniHover } from "../hoverProvider";

export function provideLanguageHover(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Hover | undefined {
  const hover = getNaniHover(document.getText(), {
    line: position.line,
    character: position.character
  });
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
