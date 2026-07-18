import { join } from "node:path";
import * as vscode from "vscode";
import { CharacterPreviewArtifactCache } from "./character-preview/artifactCache";
import { CharacterPreviewController } from "./character-preview/controller";
import { CharacterPreviewEngine } from "./character-preview/engine";
import { registerHoverCoordinator } from "./integration/hoverCoordinator";
import { registerLanguageFeatures } from "./language/register";
import { NaniProjectAssetService } from "./project-resources";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("V-Ronpa Nani");
  const projectAssets = new NaniProjectAssetService(output);
  const artifactCache = new CharacterPreviewArtifactCache(
    join(context.globalStorageUri.fsPath, "character-preview")
  );
  const previewEngine = new CharacterPreviewEngine(artifactCache);
  const characterPreview = new CharacterPreviewController(previewEngine, projectAssets, output);

  context.subscriptions.push(output, projectAssets, characterPreview);
  context.subscriptions.push(
    vscode.commands.registerCommand("v-ronpa-nani.refreshProjectAssets", () => {
      projectAssets.refreshAll();
      void vscode.window.showInformationMessage("V-Ronpa Nani project assets refreshed.");
    })
  );
  registerLanguageFeatures(context, projectAssets, output);
  registerHoverCoordinator(context, characterPreview);
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
