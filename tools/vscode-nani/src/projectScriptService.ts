import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { findNearestAssetConfig, projectAssetLoadingEnabled } from "./projectAssetLoader";
import {
  analyzeNaniCatalog,
  analyzeNaniDocument,
  type NaniCatalogAnalysis,
  type NaniDocumentAnalysis
} from "./navigationAnalysis";
import {
  loadProjectScriptConfig,
  type NaniProjectScriptConfig,
  type NaniScriptCatalogContext,
  type NaniScriptRegistration
} from "./projectScripts";

export interface NaniCatalogSnapshot {
  readonly generation: number;
  readonly context: NaniScriptCatalogContext;
  readonly analysis: NaniCatalogAnalysis;
  readonly sourceUrisByPath: ReadonlyMap<string, vscode.Uri>;
  readonly openVersions: ReadonlyMap<string, number>;
}

export interface NaniProjectScriptInvalidation {
  configPath?: string;
}

interface CachedAnalysis {
  stamp: string;
  analysis: NaniDocumentAnalysis;
}

interface CachedConfig {
  stamp: string;
  value: Promise<NaniProjectScriptConfig>;
}

export class NaniProjectScriptService implements vscode.Disposable {
  private readonly configs = new Map<string, CachedConfig>();
  private readonly watchers = new Map<string, vscode.FileSystemWatcher[]>();
  private readonly analysisCache = new Map<string, CachedAnalysis>();
  private readonly logKeys = new Set<string>();
  private readonly projectDiagnostics = vscode.languages.createDiagnosticCollection("nani-project");
  private readonly invalidationEmitter = new vscode.EventEmitter<NaniProjectScriptInvalidation>();
  private generation = 0;
  readonly onDidInvalidate = this.invalidationEmitter.event;

  constructor(private readonly output: vscode.OutputChannel) {}

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
    const config = await this.getConfig(configPath, workspace.uri.fsPath);
    const sourcePath = documentUri.fsPath;
    const matches = config.catalogs.filter((catalog) =>
      catalog.scripts.some((script) => script.sourcePath === sourcePath)
    );
    if (matches.length !== 1) {
      this.logOnce(
        `unregistered:${sourcePath}`,
        `[scripts] ${sourcePath} is not registered in exactly one supported Nani catalog; using single-file language support.`
      );
      return undefined;
    }
    return matches[0];
  }

  async getSnapshot(documentUri: vscode.Uri): Promise<NaniCatalogSnapshot | undefined> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const generation = this.generation;
      const context = await this.getContext(documentUri);
      if (generation !== this.generation) continue;
      if (!context) return undefined;
      const records = await Promise.all(
        context.scripts.map(async (registration) => ({
          registration,
          ...(await this.analyzeRegistration(registration))
        }))
      );
      if (generation !== this.generation) continue;
      const current = context.scripts.find((script) => script.sourcePath === documentUri.fsPath);
      if (!current) return undefined;
      const analysis = analyzeNaniCatalog(
        context.catalogId,
        current.scriptPath,
        context.entry,
        records.map((record) => ({
          sourceUri: record.uri.toString(),
          analysis: record.analysis
        }))
      );
      for (const message of analysis.projectionErrors) {
        this.output.appendLine(`[scripts] Source-map projection failed: ${message}`);
      }
      const snapshot: NaniCatalogSnapshot = {
        generation,
        context,
        analysis,
        sourceUrisByPath: new Map(
          records.map((record) => [record.registration.scriptPath, record.uri] as const)
        ),
        openVersions: new Map(
          records.flatMap((record) =>
            record.openVersion === undefined
              ? []
              : [[record.uri.toString(), record.openVersion] as const]
          )
        )
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
    this.configs.clear();
    this.analysisCache.clear();
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

  private async getConfig(configPath: string, workspaceRoot: string): Promise<NaniProjectScriptConfig> {
    const configUri = vscode.Uri.file(configPath);
    const stat = await vscode.workspace.fs.stat(configUri);
    const stamp = `${stat.mtime}:${stat.size}`;
    let cached = this.configs.get(configPath);
    if (!cached || cached.stamp !== stamp) {
      if (cached) {
        this.generation += 1;
        this.analysisCache.clear();
        this.watchers.get(configPath)?.forEach((watcher) => watcher.dispose());
        this.watchers.delete(configPath);
        this.invalidationEmitter.fire({ configPath });
      }
      const value = loadProjectScriptConfig(configPath, workspaceRoot).catch((error) => ({
        configPath,
        catalogs: [],
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
    const paths = new Set([
      config.configPath,
      ...config.catalogs.flatMap((catalog) => catalog.scripts.map((script) => script.sourcePath))
    ]);
    const watchers = [...paths].map((path) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(dirname(path), basename(path))
      );
      const invalidate = () => this.invalidate(config.configPath);
      watcher.onDidChange(invalidate);
      watcher.onDidCreate(invalidate);
      watcher.onDidDelete(invalidate);
      return watcher;
    });
    this.watchers.set(config.configPath, watchers);
  }

  private invalidate(configPath: string): void {
    this.generation += 1;
    this.configs.delete(configPath);
    this.analysisCache.clear();
    this.watchers.get(configPath)?.forEach((watcher) => watcher.dispose());
    this.watchers.delete(configPath);
    this.projectDiagnostics.delete(vscode.Uri.file(configPath));
    this.invalidationEmitter.fire({ configPath });
  }

  private async analyzeRegistration(registration: NaniScriptRegistration): Promise<{
    uri: vscode.Uri;
    analysis: NaniDocumentAnalysis;
    openVersion?: number;
  }> {
    const uri = vscode.Uri.file(registration.sourcePath);
    const open = vscode.workspace.textDocuments.find(
      (document) => document.uri.toString() === uri.toString()
    );
    if (open) {
      const stamp = `open:${open.version}`;
      return {
        uri,
        analysis: this.cachedAnalysis(uri, stamp, open.getText(), registration.scriptPath),
        openVersion: open.version
      };
    }
    const stat = await vscode.workspace.fs.stat(uri);
    const stamp = `disk:${stat.mtime}:${stat.size}`;
    const cached = this.analysisCache.get(uri.toString());
    if (cached?.stamp === stamp) return { uri, analysis: cached.analysis };
    const sourceText = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    return {
      uri,
      analysis: this.cachedAnalysis(uri, stamp, sourceText, registration.scriptPath)
    };
  }

  private cachedAnalysis(
    uri: vscode.Uri,
    stamp: string,
    sourceText: string,
    scriptPath: string
  ): NaniDocumentAnalysis {
    const key = uri.toString();
    const cached = this.analysisCache.get(key);
    if (cached?.stamp === stamp) return cached.analysis;
    const analysis = analyzeNaniDocument(sourceText, scriptPath);
    this.analysisCache.set(key, { stamp, analysis });
    return analysis;
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
