import * as vscode from "vscode";
import { CharacterPreviewController } from "../character-preview/controller";
import { rangeContainsCharacter } from "../character-preview/requestExtractor";
import { provideLanguageHover } from "../language/hover";
import { NANI_LANGUAGE_ID } from "../languageFacts";
import type { NaniProjectContextService } from "../projectContextService";

export function registerHoverCoordinator(
  context: vscode.ExtensionContext,
  characterPreview: CharacterPreviewController,
  project: NaniProjectContextService
): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: NANI_LANGUAGE_ID },
      {
        async provideHover(document, position, token) {
          const target = characterPreview.targetAtLine(document, position.line);
          const range = target?.kind === "request" ? target.request.identityRange : target?.identityRange;
          if (target && range && rangeContainsCharacter(range, position.character)) {
            return characterPreview.provideHover(document, target, token);
          }
          return provideLanguageHover(document, position, project);
        }
      }
    ),
    vscode.commands.registerCommand("v-ronpa-nani.previewCharacterAtCursor", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || (editor.document.languageId !== NANI_LANGUAGE_ID && !editor.document.fileName.endsWith(".nani"))) {
        await vscode.window.showInformationMessage("Open a .nani document to preview a character.");
        return;
      }
      const target = characterPreview.targetAtLine(editor.document, editor.selection.active.line);
      const range = target?.kind === "request" ? target.request.identityRange : target?.identityRange;
      if (!target || !range) {
        await vscode.window.showInformationMessage("The current line has no statically previewable @char identity.");
        return;
      }
      const position = new vscode.Position(range.start.line, range.start.character);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
      await vscode.commands.executeCommand("editor.action.showHover");
    })
  );
}
