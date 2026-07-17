import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { emptyProjectAssetIndex, type NaniProjectAssetIndex } from "./projectAssets";
import {
  findNearestAssetConfig,
  loadProjectAssets,
  projectAssetLoadingEnabled,
  ProjectAssetCache,
  ProjectAssetLoadError
} from "./projectAssetLoader";

export class NaniProjectAssetService implements vscode.Disposable {
  private readonly cache = new ProjectAssetCache();
  private readonly watchers = new Map<string, vscode.FileSystemWatcher[]>();
  private readonly watcherSignatures = new Map<string, string>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly output: vscode.OutputChannel) {
    this.disposables.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.refreshAll())
    );
  }

  async getIndex(documentUri: vscode.Uri): Promise<NaniProjectAssetIndex> {
    if (!projectAssetLoadingEnabled(vscode.workspace.isTrusted, documentUri.scheme)) return emptyProjectAssetIndex;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    if (!workspaceFolder || workspaceFolder.uri.scheme !== "file") return emptyProjectAssetIndex;
    const configPath = findNearestAssetConfig(documentUri.fsPath, workspaceFolder.uri.fsPath);
    if (!configPath) return emptyProjectAssetIndex;
    this.ensureConfigWatcher(configPath);

    try {
      const loaded = await this.cache.get(configPath, () => loadProjectAssets(configPath, workspaceFolder.uri.fsPath));
      this.replaceWatchers(configPath, loaded.watchedPaths);
      for (const warning of loaded.warnings) this.output.appendLine(`[assets] ${warning}`);
      return loaded.index;
    } catch (error) {
      if (error instanceof ProjectAssetLoadError) this.replaceWatchers(configPath, error.watchedPaths);
      this.output.appendLine(`[assets] Failed to load ${configPath}: ${errorMessage(error)}`);
      return emptyProjectAssetIndex;
    }
  }

  refreshAll(): void {
    this.cache.clear();
    for (const watchers of this.watchers.values()) watchers.forEach((watcher) => watcher.dispose());
    this.watchers.clear();
    this.watcherSignatures.clear();
    this.output.appendLine("[assets] Project asset indexes invalidated.");
  }

  dispose(): void {
    this.refreshAll();
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private ensureConfigWatcher(configPath: string): void {
    if (this.watchers.has(configPath)) return;
    this.replaceWatchers(configPath, [configPath]);
  }

  private replaceWatchers(configPath: string, paths: string[]): void {
    const uniquePaths = [...new Set(paths)].sort((left, right) => left.localeCompare(right));
    const signature = uniquePaths.join("\n");
    if (this.watcherSignatures.get(configPath) === signature) return;
    const previous = this.watchers.get(configPath) ?? [];
    previous.forEach((watcher) => watcher.dispose());
    const watchers = uniquePaths.map((path) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(dirname(path), basename(path))
      );
      const invalidate = () => this.invalidate(configPath);
      watcher.onDidCreate(invalidate, this, this.disposables);
      watcher.onDidChange(invalidate, this, this.disposables);
      watcher.onDidDelete(invalidate, this, this.disposables);
      return watcher;
    });
    this.watchers.set(configPath, watchers);
    this.watcherSignatures.set(configPath, signature);
  }

  private invalidate(configPath: string): void {
    this.cache.invalidate(configPath);
    this.output.appendLine(`[assets] Invalidated project index for ${configPath}.`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
