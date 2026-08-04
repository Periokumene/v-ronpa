import { basename, dirname } from "node:path";
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

export interface NaniCatalogSnapshot {
  readonly generation: number;
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

export class NaniProjectScriptService implements vscode.Disposable {
  private readonly configs = new Map<string, CachedConfig>();
  private readonly watchers = new Map<string, vscode.FileSystemWatcher[]>();
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
    if (matches.length !== 1) return undefined;
    return matches[0];
  }

  async getSnapshot(documentUri: vscode.Uri): Promise<NaniCatalogSnapshot | undefined> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const generation = this.generation;
      const context = await this.getContext(documentUri);
      if (generation !== this.generation) continue;
      if (!context) return undefined;
      const openVersions = new Map<string, number>();
      const sharedAnalysis = await analyzeNaniCatalog(context.project, {
        projectRoot: context.projectRoot,
        scopes: context.scopes,
        entries: context.entries,
        assetBindings: context.assetBindings,
        sourceDiagnosticPolicy: "allow-recoverable-command-errors",
        loadSourceText: async (script) => {
          const uri = vscode.Uri.file(script.sourcePath);
          const open = vscode.workspace.textDocuments.find(
            (candidate) => candidate.uri.toString() === uri.toString()
          );
          if (open) {
            openVersions.set(uri.toString(), open.version);
            return open.getText();
          }
          return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
        }
      });
      if (generation !== this.generation) continue;
      const current = context.scripts.find((script) => script.sourcePath === documentUri.fsPath);
      if (!current) return undefined;
      const analysis = projectCatalogView(context.catalogId, current.scriptPath, sharedAnalysis);
      const snapshot: NaniCatalogSnapshot = {
        generation,
        context,
        analysis,
        sourceUrisByPath: new Map(
          sharedAnalysis.scripts.map((script) => [script.scriptPath, vscode.Uri.file(script.sourcePath)] as const)
        ),
        sourceTextsByPath: new Map(
          sharedAnalysis.scripts.map((script) => [script.scriptPath, script.sourceText] as const)
        ),
        openVersions
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
        this.watchers.get(configPath)?.forEach((watcher) => watcher.dispose());
        this.watchers.delete(configPath);
        this.invalidationEmitter.fire({ configPath });
      }
      const value = loadProjectScriptConfig(configPath, workspaceRoot).catch((error) => ({
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
    const configWatcher = (() => {
      const path = config.configPath;
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
    const watchers = [configWatcher, ...rootWatchers];
    this.watchers.set(config.configPath, watchers);
  }

  private invalidate(configPath: string): void {
    this.generation += 1;
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
