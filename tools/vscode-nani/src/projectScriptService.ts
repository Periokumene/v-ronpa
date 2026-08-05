import { basename, dirname, join } from "node:path";
import * as vscode from "vscode";
import {
  analyzeNaniCatalog,
  type NaniCatalogAnalysis as SharedNaniCatalogAnalysis,
  type NaniProjectDiagnostic
} from "@v-ronpa/nani-project";
import { findNearestAssetConfig, projectAssetLoadingEnabled } from "./projectAssetLoader";
import {
  type NaniCatalogAnalysis
} from "./navigationAnalysis";
import {
  loadProjectScriptConfig,
  type NaniProjectScriptConfig,
  type NaniScriptCatalogContext
} from "./projectScripts";
import type { NaniDiagnostic } from "./diagnostics";
import type { NaniProjectAssetService } from "./projectAssetService";

export interface NaniCatalogSnapshot {
  readonly generation: number;
  readonly configGeneration: number;
  readonly context: NaniScriptCatalogContext;
  readonly analysis: NaniCatalogAnalysis;
  readonly sourceUrisByPath: ReadonlyMap<string, vscode.Uri>;
  readonly sourceTextsByPath: ReadonlyMap<string, string>;
  readonly openVersions: ReadonlyMap<string, number>;
}

export interface NaniProjectScriptInvalidation {
  configPath?: string;
}

interface CachedConfig {
  stamp: string;
  value: Promise<NaniProjectScriptConfig>;
}

interface CachedCatalogAnalysis {
  generation: number;
  configGeneration: number;
  openVersionStamp: string;
  value: Promise<AnalyzedCatalog>;
}

interface AnalyzedCatalog {
  shared: SharedNaniCatalogAnalysis;
  sourceUrisByPath: ReadonlyMap<string, vscode.Uri>;
  sourceTextsByPath: ReadonlyMap<string, string>;
  openVersions: ReadonlyMap<string, number>;
}

export class NaniProjectScriptService implements vscode.Disposable {
  private readonly configs = new Map<string, CachedConfig>();
  private readonly analyses = new Map<string, CachedCatalogAnalysis>();
  private readonly watchers = new Map<string, vscode.FileSystemWatcher[]>();
  private readonly logKeys = new Set<string>();
  private readonly projectDiagnostics = vscode.languages.createDiagnosticCollection("nani-project");
  private readonly invalidationEmitter = new vscode.EventEmitter<NaniProjectScriptInvalidation>();
  private generation = 0;
  private readonly configGenerations = new Map<string, number>();
  readonly onDidInvalidate = this.invalidationEmitter.event;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly projectAssets: NaniProjectAssetService
  ) {}

  async getContext(documentUri: vscode.Uri): Promise<NaniScriptCatalogContext | undefined> {
    if (!projectAssetLoadingEnabled(vscode.workspace.isTrusted, documentUri.scheme)) {
      this.logOnce("disabled", "[scripts] Project script indexing requires a trusted file workspace.");
      return undefined;
    }
    const workspace = vscode.workspace.getWorkspaceFolder(documentUri);
    if (!workspace || workspace.uri.scheme !== "file") return undefined;
    const configPath = findNearestAssetConfig(documentUri.fsPath, workspace.uri.fsPath);
    if (!configPath) {
      this.logOnce(`unconfigured:${workspace.uri.fsPath}`, `[scripts] No asset.config.mjs governs ${documentUri.fsPath}; using single-file language support.`);
      return undefined;
    }
    const loadedAssets = await this.projectAssets.getLoaded(documentUri);
    if (!loadedAssets) return undefined;
    const config = await this.getConfig(configPath, workspace.uri.fsPath, loadedAssets.assetBindings);
    const sourcePath = documentUri.fsPath;
    const matches = config.catalogs.filter((catalog) =>
      catalog.scripts.some((script) => script.sourcePath === sourcePath)
    );
    if (matches.length !== 1) return undefined;
    return matches[0];
  }

  async getSnapshot(documentUri: vscode.Uri): Promise<NaniCatalogSnapshot | undefined> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const generation = this.generation;
      const workspace = vscode.workspace.getWorkspaceFolder(documentUri);
      const expectedConfigPath = workspace?.uri.scheme === "file"
        ? findNearestAssetConfig(documentUri.fsPath, workspace.uri.fsPath)
        : undefined;
      const configGeneration = expectedConfigPath
        ? this.configGenerations.get(expectedConfigPath) ?? 0
        : 0;
      const context = await this.getContext(documentUri);
      if (
        generation !== this.generation
        || (expectedConfigPath && configGeneration !== (this.configGenerations.get(expectedConfigPath) ?? 0))
      ) continue;
      if (!context) return undefined;
      const current = context.scripts.find((script) => script.sourcePath === documentUri.fsPath);
      if (!current) return undefined;
      const analyzed = await this.getCatalogAnalysis(context, generation, configGeneration);
      if (
        generation !== this.generation
        || configGeneration !== (this.configGenerations.get(context.configPath) ?? 0)
      ) continue;
      const analysis = projectCatalogView(context.catalogId, current.scriptPath, analyzed.shared);
      const snapshot: NaniCatalogSnapshot = {
        generation,
        configGeneration,
        context,
        analysis,
        sourceUrisByPath: analyzed.sourceUrisByPath,
        sourceTextsByPath: analyzed.sourceTextsByPath,
        openVersions: analyzed.openVersions
      };
      if (!this.isCurrent(snapshot)) continue;
      this.publishLinkProjectDiagnostics(context, analysis);
      return snapshot;
    }
    this.logOnce(
      `unstable:${documentUri.toString()}`,
      `[scripts] Catalog changed repeatedly while indexing ${documentUri.fsPath}; using single-file language support for this request.`
    );
    return undefined;
  }

  isCurrent(snapshot: NaniCatalogSnapshot): boolean {
    if (snapshot.generation !== this.generation) return false;
    if (snapshot.configGeneration !== (this.configGenerations.get(snapshot.context.configPath) ?? 0)) return false;
    for (const [uri, version] of snapshot.openVersions) {
      const document = vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.toString() === uri
      );
      if (!document || document.version !== version) return false;
    }
    return true;
  }

  refreshAll(): void {
    this.generation += 1;
    this.configGenerations.clear();
    this.configs.clear();
    this.analyses.clear();
    this.logKeys.clear();
    for (const watchers of this.watchers.values()) watchers.forEach((watcher) => watcher.dispose());
    this.watchers.clear();
    this.projectDiagnostics.clear();
    this.invalidationEmitter.fire({});
    this.output.appendLine("[scripts] Project script catalogs invalidated.");
  }

  dispose(): void {
    this.refreshAll();
    this.projectDiagnostics.dispose();
    this.invalidationEmitter.dispose();
  }

  refreshConfig(configPath: string): void {
    this.invalidate(configPath);
  }

  private async getConfig(
    configPath: string,
    workspaceRoot: string,
    assetBindings: import("@v-ronpa/nani-project").NaniAssetBindings
  ): Promise<NaniProjectScriptConfig> {
    const configUri = vscode.Uri.file(configPath);
    const stat = await vscode.workspace.fs.stat(configUri);
    const stamp = `${stat.mtime}:${stat.size}`;
    let cached = this.configs.get(configPath);
    if (!cached || cached.stamp !== stamp) {
      if (cached) {
        this.bumpConfigGeneration(configPath);
        this.watchers.get(configPath)?.forEach((watcher) => watcher.dispose());
        this.watchers.delete(configPath);
        this.invalidationEmitter.fire({ configPath });
      }
      const value = loadProjectScriptConfig(configPath, workspaceRoot, assetBindings).catch((error) => ({
        configPath,
        catalogs: [],
        scopeRoots: [],
        warnings: [],
        errors: [errorText(error)]
      }));
      cached = { stamp, value };
      this.configs.set(configPath, cached);
    }
    const config = await cached.value;
    this.ensureWatchers(config);
    this.publishConfigDiagnostics(configPath, config.errors);
    for (const warning of config.warnings) this.logOnce(`warning:${configPath}:${warning}`, `[scripts] ${warning}`);
    return config;
  }

  private ensureWatchers(config: NaniProjectScriptConfig): void {
    if (this.watchers.has(config.configPath)) return;
    const naniConfigWatcher = (() => {
      const path = join(dirname(config.configPath), "nani.config.mjs");
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(dirname(path), basename(path))
      );
      const invalidate = () => this.invalidate(config.configPath);
      watcher.onDidChange(invalidate);
      watcher.onDidCreate(invalidate);
      watcher.onDidDelete(invalidate);
      return watcher;
    })();
    const rootWatchers = config.scopeRoots.map((root) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(root, "**/*.nani")
      );
      const invalidate = () => this.invalidate(config.configPath);
      watcher.onDidChange(invalidate);
      watcher.onDidCreate(invalidate);
      watcher.onDidDelete(invalidate);
      return watcher;
    });
    const watchers = [naniConfigWatcher, ...rootWatchers];
    this.watchers.set(config.configPath, watchers);
  }

  private invalidate(configPath: string): void {
    this.bumpConfigGeneration(configPath);
    this.configs.delete(configPath);
    this.watchers.get(configPath)?.forEach((watcher) => watcher.dispose());
    this.watchers.delete(configPath);
    this.projectDiagnostics.delete(vscode.Uri.file(configPath));
    this.invalidationEmitter.fire({ configPath });
  }

  private publishConfigDiagnostics(configPath: string, errors: readonly string[]): void {
    const uri = vscode.Uri.file(configPath);
    this.projectDiagnostics.set(
      uri,
      errors.map((message) => projectDiagnostic(message, "invalid-project-script-config"))
    );
  }

  private publishLinkProjectDiagnostics(
    context: NaniScriptCatalogContext,
    analysis: NaniCatalogAnalysis
  ): void {
    const uri = vscode.Uri.file(context.configPath);
    const existing = this.projectDiagnostics.get(uri) ?? [];
    this.projectDiagnostics.set(uri, [
      ...existing.filter((diagnostic) => diagnostic.code !== "invalid-script-catalog"),
      ...analysis.projectDiagnostics.map((diagnostic) =>
        projectDiagnostic(diagnostic.message, "invalid-script-catalog")
      )
    ]);
  }

  private logOnce(key: string, message: string): void {
    if (this.logKeys.has(key)) return;
    this.logKeys.add(key);
    this.output.appendLine(message);
  }

  private getCatalogAnalysis(
    context: NaniScriptCatalogContext,
    generation: number,
    configGeneration: number
  ): Promise<AnalyzedCatalog> {
    const openSources = new Map<string, { version: number; sourceText: string }>();
    for (const script of context.scripts) {
      const uri = vscode.Uri.file(script.sourcePath).toString();
      const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === uri);
      if (document) openSources.set(uri, { version: document.version, sourceText: document.getText() });
    }
    const openVersionStamp = [...openSources]
      .map(([uri, source]) => `${uri}:${source.version}`)
      .sort((left, right) => left.localeCompare(right))
      .join("\n");
    const cacheKey = `${context.configPath}\0${context.catalogId}`;
    const cached = this.analyses.get(cacheKey);
    if (
      cached?.generation === generation
      && cached.configGeneration === configGeneration
      && cached.openVersionStamp === openVersionStamp
    ) {
      return cached.value;
    }
    const openVersions = new Map(
      [...openSources].map(([uri, source]) => [uri, source.version] as const)
    );
    const value = analyzeNaniCatalog(context.project, {
      projectRoot: context.projectRoot,
      scopes: context.scopes,
      entries: context.entries,
      assetBindings: context.assetBindings,
      sourceDiagnosticPolicy: "allow-recoverable-command-errors",
      loadSourceText: async (script) => {
        const uri = vscode.Uri.file(script.sourcePath);
        return openSources.get(uri.toString())?.sourceText
          ?? Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      }
    }).then((shared) => ({
      shared,
      sourceUrisByPath: new Map(
        shared.scripts.map((script) => [script.scriptPath, vscode.Uri.file(script.sourcePath)] as const)
      ),
      sourceTextsByPath: new Map(
        shared.scripts.map((script) => [script.scriptPath, script.sourceText] as const)
      ),
      openVersions
    }));
    this.analyses.set(cacheKey, { generation, configGeneration, openVersionStamp, value });
    return value;
  }

  private deleteAnalyses(configPath: string): void {
    for (const key of this.analyses.keys()) {
      if (key.startsWith(`${configPath}\0`)) this.analyses.delete(key);
    }
  }

  private bumpConfigGeneration(configPath: string): void {
    this.configGenerations.set(configPath, (this.configGenerations.get(configPath) ?? 0) + 1);
    this.deleteAnalyses(configPath);
  }
}

function projectCatalogView(
  catalogId: string,
  currentScriptPath: string,
  shared: SharedNaniCatalogAnalysis
): NaniCatalogAnalysis {
  const scriptsByPath = new Map(shared.scripts.map((script) => [script.scriptPath, script] as const));
  const diagnosticsByScriptPath = new Map<string, NaniDiagnostic[]>(
    shared.scripts.map((script) => [script.scriptPath, []])
  );
  const projectDiagnostics: NaniProjectDiagnostic[] = [];
  for (const diagnostic of shared.diagnostics) {
    if (!diagnostic.scriptPath || !diagnostic.span || !scriptsByPath.has(diagnostic.scriptPath)) {
      projectDiagnostics.push(diagnostic);
      continue;
    }
    diagnosticsByScriptPath.get(diagnostic.scriptPath)?.push({
      code: diagnostic.code,
      message: diagnostic.message,
      severity: diagnostic.severity,
      source: "nani",
      span: diagnostic.span
    });
  }
  return {
    navigation: {
      catalogId,
      currentScriptPath,
      scripts: new Map(shared.scripts
        .filter((script) => script.executionDisposition === "runnable")
        .map((script) => [script.scriptPath, {
          scriptPath: script.scriptPath,
          sourceUri: vscode.Uri.file(script.sourcePath).toString(),
          sourceText: script.sourceText,
          labels: script.labels
        }]))
    },
    diagnosticsByScriptPath,
    projectDiagnostics
  };
}

function projectDiagnostic(message: string, code: string): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, 0),
    message,
    vscode.DiagnosticSeverity.Error
  );
  diagnostic.source = "nani-project";
  diagnostic.code = code;
  return diagnostic;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
