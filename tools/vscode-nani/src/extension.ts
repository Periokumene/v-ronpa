import { join } from "node:path";
import * as vscode from "vscode";
import { CharacterPreviewArtifactCache } from "./character-preview/artifactCache";
import { CharacterPreviewController } from "./character-preview/controller";
import { CharacterPreviewEngine } from "./character-preview/engine";
import { CharacterCompletionPreviewProvider } from "./integration/completionPreviewProvider";
import { registerHoverCoordinator } from "./integration/hoverCoordinator";
import { registerLanguageFeatures } from "./language/register";
import { registerDefinitionProvider } from "./language/definition";
import { NaniProjectContextService } from "./project-resources";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("V-Ronpa Nani");
  const project = new NaniProjectContextService(output);
  const artifactCache = new CharacterPreviewArtifactCache(
    join(context.globalStorageUri.fsPath, "character-preview")
  );
  const previewEngine = new CharacterPreviewEngine(artifactCache);
  const characterPreview = new CharacterPreviewController(previewEngine, project, output);
  const completionPreview = new CharacterCompletionPreviewProvider(previewEngine, project, output);

  context.subscriptions.push(output, project, characterPreview, completionPreview);
  context.subscriptions.push(
    vscode.commands.registerCommand("v-ronpa-nani.refreshProjectAssets", () => {
      project.refreshAll();
      void vscode.window.showInformationMessage(
        "V-Ronpa Nani project assets and script catalogs refreshed."
      );
    })
  );
  registerLanguageFeatures(context, project, output, completionPreview);
  registerHoverCoordinator(context, characterPreview, project);
  registerDefinitionProvider(context, project);
  void characterPreview.initialize().catch((error) => {
    output.appendLine(`[char-preview] Failed to initialize artifact cache: ${errorMessage(error)}`);
  });
}

export function deactivate(): void {
  // VS Code disposes extension subscriptions.
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
