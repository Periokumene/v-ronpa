import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { emptyProjectAssetIndex, type NaniProjectAssetIndex } from "./projectAssets";
import {
  findNearestAssetConfig,
  loadProjectAssets,
  projectAssetLoadingEnabled,
  ProjectAssetCache,
  ProjectAssetLoadError,
  type LoadedProjectAssets,
  type NaniCharacterPackDescriptor
} from "./projectAssetLoader";

export interface NaniProjectAssetInvalidation {
  configPath?: string;
  packRoot?: string;
}

export class NaniProjectAssetService implements vscode.Disposable {
  private readonly cache = new ProjectAssetCache();
  private readonly watchers = new Map<string, vscode.FileSystemWatcher[]>();
  private readonly watcherSignatures = new Map<string, string>();
  private readonly packWatchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly invalidationEmitter = new vscode.EventEmitter<NaniProjectAssetInvalidation>();
  readonly onDidInvalidate = this.invalidationEmitter.event;

  constructor(private readonly output: vscode.OutputChannel) {
    this.disposables.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.refreshAll())
    );
  }

  async getIndex(documentUri: vscode.Uri): Promise<NaniProjectAssetIndex> {
    return (await this.getLoaded(documentUri))?.index ?? emptyProjectAssetIndex;
  }

  async getCharacterPackDescriptor(
    documentUri: vscode.Uri,
    characterId: string
  ): Promise<NaniCharacterPackDescriptor | undefined> {
    const loaded = await this.getLoaded(documentUri);
    return loaded?.characterPacks[characterId] ?? loaded?.characterPacks[characterId.toLowerCase()];
  }

  private async getLoaded(documentUri: vscode.Uri): Promise<LoadedProjectAssets | undefined> {
    if (!projectAssetLoadingEnabled(vscode.workspace.isTrusted, documentUri.scheme)) return undefined;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    if (!workspaceFolder || workspaceFolder.uri.scheme !== "file") return undefined;
    const configPath = findNearestAssetConfig(documentUri.fsPath, workspaceFolder.uri.fsPath);
    if (!configPath) return undefined;
    this.ensureConfigWatcher(configPath);

    try {
      const loaded = await this.cache.get(configPath, () => loadProjectAssets(configPath, workspaceFolder.uri.fsPath));
      this.replaceWatchers(configPath, loaded.watchedPaths);
      this.ensurePackWatchers(configPath, loaded.characterPacks);
      for (const warning of loaded.warnings) this.output.appendLine(`[assets] ${warning}`);
      return loaded;
    } catch (error) {
      if (error instanceof ProjectAssetLoadError) this.replaceWatchers(configPath, error.watchedPaths);
      this.output.appendLine(`[assets] Failed to load ${configPath}: ${errorMessage(error)}`);
      return undefined;
    }
  }

  refreshAll(): void {
    this.cache.clear();
    for (const watchers of this.watchers.values()) watchers.forEach((watcher) => watcher.dispose());
    this.watchers.clear();
    this.watcherSignatures.clear();
    for (const watcher of this.packWatchers.values()) watcher.dispose();
    this.packWatchers.clear();
    this.invalidationEmitter.fire({});
    this.output.appendLine("[assets] Project asset indexes invalidated.");
  }

  dispose(): void {
    this.refreshAll();
    this.disposables.forEach((disposable) => disposable.dispose());
    this.invalidationEmitter.dispose();
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

  private ensurePackWatchers(
    configPath: string,
    characterPacks: Readonly<Record<string, NaniCharacterPackDescriptor>>
  ): void {
    const unique = new Map<string, NaniCharacterPackDescriptor>();
    for (const pack of Object.values(characterPacks)) unique.set(pack.rootPath, pack);
    for (const pack of unique.values()) {
      if (this.packWatchers.has(pack.rootPath)) continue;
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(pack.rootPath, "**/*.{json,png}")
      );
      const invalidate = () => this.invalidate(configPath, pack.rootPath);
      watcher.onDidCreate(invalidate, this, this.disposables);
      watcher.onDidChange(invalidate, this, this.disposables);
      watcher.onDidDelete(invalidate, this, this.disposables);
      this.packWatchers.set(pack.rootPath, watcher);
    }
  }

  private invalidate(configPath: string, packRoot?: string): void {
    this.cache.invalidate(configPath);
    this.invalidationEmitter.fire(packRoot ? { configPath, packRoot } : { configPath });
    this.output.appendLine(`[assets] Invalidated project index for ${configPath}.`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
