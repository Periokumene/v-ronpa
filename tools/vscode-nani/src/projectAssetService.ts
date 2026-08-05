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
  private readonly disposables: vscode.Disposable[] = [];
  private readonly diagnostics = vscode.languages.createDiagnosticCollection("nani-assets");
  private readonly invalidationEmitter = new vscode.EventEmitter<NaniProjectAssetInvalidation>();
  private globalGeneration = 0;
  private readonly configGenerations = new Map<string, number>();
  readonly onDidInvalidate = this.invalidationEmitter.event;

  constructor(private readonly output: vscode.OutputChannel) {
    const configWatcher = vscode.workspace.createFileSystemWatcher("**/asset.config.mjs");
    configWatcher.onDidCreate((uri) => this.invalidate(uri.fsPath));
    this.disposables.push(
      configWatcher,
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

  async getLoaded(documentUri: vscode.Uri): Promise<LoadedProjectAssets | undefined> {
    return this.loadCurrent(documentUri, 0);
  }

  private async loadCurrent(
    documentUri: vscode.Uri,
    attempt: number
  ): Promise<LoadedProjectAssets | undefined> {
    if (!projectAssetLoadingEnabled(vscode.workspace.isTrusted, documentUri.scheme)) return undefined;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    if (!workspaceFolder || workspaceFolder.uri.scheme !== "file") return undefined;
    const configPath = findNearestAssetConfig(documentUri.fsPath, workspaceFolder.uri.fsPath);
    if (!configPath) return undefined;
    this.ensureConfigWatcher(configPath);
    const globalGeneration = this.globalGeneration;
    const configGeneration = this.configGenerations.get(configPath) ?? 0;

    try {
      const loaded = await this.cache.get(configPath, () => loadProjectAssets(configPath, workspaceFolder.uri.fsPath));
      if (
        globalGeneration !== this.globalGeneration
        || configGeneration !== (this.configGenerations.get(configPath) ?? 0)
      ) {
        return attempt < 2 ? this.loadCurrent(documentUri, attempt + 1) : undefined;
      }
      this.replaceWatchers(configPath, loaded.watchedPaths, loaded.watchedRoots);
      this.diagnostics.delete(vscode.Uri.file(configPath));
      for (const warning of loaded.warnings) this.output.appendLine(`[assets] ${warning}`);
      return loaded;
    } catch (error) {
      if (error instanceof ProjectAssetLoadError) {
        this.replaceWatchers(configPath, error.watchedPaths, error.watchedRoots);
      }
      this.diagnostics.set(vscode.Uri.file(configPath), [configDiagnostic(errorMessage(error))]);
      this.output.appendLine(`[assets] Failed to load ${configPath}: ${errorMessage(error)}`);
      return undefined;
    }
  }

  refreshAll(): void {
    this.globalGeneration += 1;
    this.configGenerations.clear();
    this.cache.clear();
    for (const watchers of this.watchers.values()) watchers.forEach((watcher) => watcher.dispose());
    this.watchers.clear();
    this.watcherSignatures.clear();
    this.diagnostics.clear();
    this.invalidationEmitter.fire({});
    this.output.appendLine("[assets] Project asset indexes invalidated.");
  }

  dispose(): void {
    this.refreshAll();
    this.disposables.forEach((disposable) => disposable.dispose());
    this.diagnostics.dispose();
    this.invalidationEmitter.dispose();
  }

  private ensureConfigWatcher(configPath: string): void {
    if (this.watchers.has(configPath)) return;
    this.replaceWatchers(configPath, [configPath], []);
  }

  private replaceWatchers(configPath: string, paths: string[], roots: string[]): void {
    const uniquePaths = [...new Set(paths)].sort((left, right) => left.localeCompare(right));
    const uniqueRoots = [...new Set(roots)].sort((left, right) => left.localeCompare(right));
    const signature = [...uniquePaths.map((path) => `file:${path}`), ...uniqueRoots.map((root) => `root:${root}`)].join("\n");
    if (this.watcherSignatures.get(configPath) === signature) return;
    const previous = this.watchers.get(configPath) ?? [];
    previous.forEach((watcher) => watcher.dispose());
    const fileWatchers = uniquePaths.map((path) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(dirname(path), basename(path))
      );
      const invalidate = () => this.invalidate(configPath);
      watcher.onDidCreate(invalidate);
      watcher.onDidChange(invalidate);
      watcher.onDidDelete(invalidate);
      return watcher;
    });
    const rootWatchers = uniqueRoots.map((root) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(root, "**/*")
      );
      const invalidate = () => this.invalidate(configPath);
      watcher.onDidCreate(invalidate);
      watcher.onDidChange(invalidate);
      watcher.onDidDelete(invalidate);
      return watcher;
    });
    const watchers = [...fileWatchers, ...rootWatchers];
    this.watchers.set(configPath, watchers);
    this.watcherSignatures.set(configPath, signature);
  }

  private invalidate(configPath: string, packRoot?: string): void {
    this.configGenerations.set(configPath, (this.configGenerations.get(configPath) ?? 0) + 1);
    this.cache.invalidate(configPath);
    this.diagnostics.delete(vscode.Uri.file(configPath));
    this.invalidationEmitter.fire(packRoot ? { configPath, packRoot } : { configPath });
    this.output.appendLine(`[assets] Invalidated project index for ${configPath}.`);
  }
}

function configDiagnostic(message: string): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, 0),
    message,
    vscode.DiagnosticSeverity.Error
  );
  diagnostic.source = "nani-assets";
  diagnostic.code = "invalid-project-assets";
  return diagnostic;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
