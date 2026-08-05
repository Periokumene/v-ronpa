import { join } from "node:path";
import * as vscode from "vscode";
import { AssetImagePreviewEngine } from "./asset-preview/engine";
import { AssetImagePreviewProvider } from "./asset-preview/provider";
import { CharacterPreviewArtifactCache } from "./character-preview/artifactCache";
import { CharacterPreviewController } from "./character-preview/controller";
import { CharacterPreviewEngine } from "./character-preview/engine";
import {
  CharacterCompletionPreviewProvider,
  CompositeCompletionDocumentationProvider
} from "./integration/completionPreviewProvider";
import { registerHoverCoordinator } from "./integration/hoverCoordinator";
import { registerLanguageFeatures } from "./language/register";
import { registerDefinitionProvider } from "./language/definition";
import { NaniProjectContextService } from "./project-resources";
import { SvgPreviewArtifactStore } from "./preview/artifactStore";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("V-Ronpa Nani");
  const project = new NaniProjectContextService(output);
  const artifactCache = new CharacterPreviewArtifactCache(
    join(context.globalStorageUri.fsPath, "character-preview")
  );
  const previewEngine = new CharacterPreviewEngine(artifactCache);
  const characterPreview = new CharacterPreviewController(previewEngine, project, output);
  const characterCompletionPreview = new CharacterCompletionPreviewProvider(previewEngine, project, output);
  const assetPreviewEngine = new AssetImagePreviewEngine(new SvgPreviewArtifactStore(
    join(context.globalStorageUri.fsPath, "asset-preview"),
    { maxArtifacts: 32, maxBytes: 96 * 1024 * 1024 }
  ));
  const assetPreview = new AssetImagePreviewProvider(assetPreviewEngine, project, output);
  const completionPreview = new CompositeCompletionDocumentationProvider([
    characterCompletionPreview,
    assetPreview
  ]);

  context.subscriptions.push(output, project, characterPreview, characterCompletionPreview, assetPreview);
  context.subscriptions.push(
    vscode.commands.registerCommand("v-ronpa-nani.refreshProjectAssets", () => {
      project.refreshAll();
      void vscode.window.showInformationMessage(
        "V-Ronpa Nani project assets and script catalogs refreshed."
      );
    })
  );
  registerLanguageFeatures(context, project, output, completionPreview);
  registerHoverCoordinator(context, characterPreview, project, assetPreview);
  registerDefinitionProvider(context, project);
  void characterPreview.initialize().catch((error) => {
    output.appendLine(`[char-preview] Failed to initialize artifact cache: ${errorMessage(error)}`);
  });
  void assetPreviewEngine.initialize().catch((error) => {
    output.appendLine(`[asset-preview] Failed to initialize artifact cache: ${errorMessage(error)}`);
  });
}

export function deactivate(): void {
  // VS Code disposes extension subscriptions.
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
