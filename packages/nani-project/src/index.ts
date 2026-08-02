import { readFile, readdir, lstat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  AssetRef,
  RuntimeScript,
  VnEntryDef,
  VnRuntimeScriptCatalog,
  VnRuntimeScriptSource
} from "@v-ronpa/contracts";
import {
  deriveLayeredCharacterPreloadPlan,
  type LayeredCharacterPreloadPlan
} from "@v-ronpa/layered-character";
import {
  parseScenario,
  parseStaticNaniEndpoint,
  type NaniSourceDiagnostic,
  type TextSpan
} from "@v-ronpa/nani-parser";
import {
  classifyNaniDiagnosticDisposition,
  compileRuntimeScript,
  digestRuntimeScriptSemantics,
  linkRuntimeScriptCatalog,
  type NaniDiagnosticDisposition,
  type NaniDiagnosticSource,
  type NaniSourceDiagnosticPolicy
} from "@v-ronpa/nani-runtime-compiler";

export type NaniScope = "production" | "development" | "test";

export interface NaniProjectScopeConfig {
  sourceRoot: string;
  scriptRoot: string;
}

export interface NaniEntryConfig {
  id: string;
  scope: "production" | "test";
  initialScriptPath: string;
  startLabel?: string;
}

export interface NaniProjectConfig {
  scopes: Partial<Record<NaniScope, NaniProjectScopeConfig>>;
  mainEntry: NaniEntryConfig;
  testEntries: Readonly<Record<string, NaniEntryConfig>>;
  voiceLocales: readonly string[];
}

export interface DiscoveredNaniScript {
  scope: NaniScope;
  sourcePath: string;
  sourceFile: string;
  relativePath: string;
  scriptPath: string;
}

export interface NaniProjectDiagnostic {
  source: NaniDiagnosticSource;
  code: string;
  severity: "info" | "warning" | "error";
  disposition: NaniDiagnosticDisposition;
  message: string;
  scope?: NaniScope;
  scriptPath?: string;
  loc?: {
    scriptPath: string;
    line: number;
    column: number;
    raw: string;
  };
  span?: TextSpan;
}

export interface NaniScriptMetadata {
  scriptRevision: string;
  assetRefs: readonly AssetRef[];
  characterPreloadPlan: LayeredCharacterPreloadPlan;
}

export interface AnalyzedNaniScript extends DiscoveredNaniScript {
  sourceText: string;
  source: VnRuntimeScriptSource;
  runtimeScript: RuntimeScript;
  semanticRevision: string;
  executionDisposition: "runnable" | "fatal";
  diagnostics: readonly NaniProjectDiagnostic[];
  metadata: NaniScriptMetadata;
}

export interface NaniCatalogAnalysis {
  entry: NaniEntryConfig;
  scripts: readonly AnalyzedNaniScript[];
  catalog: VnRuntimeScriptCatalog;
  diagnostics: readonly NaniProjectDiagnostic[];
  hasFatalDiagnostics: boolean;
  hasRecoverableDiagnostics: boolean;
}

export interface DiscoverNaniProjectOptions {
  projectRoot: string;
  scopes?: readonly NaniScope[];
}

export interface AnalyzeNaniCatalogOptions extends DiscoverNaniProjectOptions {
  entry: NaniEntryConfig;
  sourceDiagnosticPolicy: NaniSourceDiagnosticPolicy;
}

export class NaniProjectDiscoveryError extends Error {
  readonly diagnostics: readonly NaniProjectDiagnostic[];

  constructor(diagnostics: readonly NaniProjectDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    this.name = "NaniProjectDiscoveryError";
    this.diagnostics = diagnostics;
  }
}

export async function discoverNaniProjectScripts(
  config: NaniProjectConfig,
  options: DiscoverNaniProjectOptions
): Promise<readonly DiscoveredNaniScript[]> {
  const projectRoot = resolve(options.projectRoot);
  const selectedScopes = options.scopes ?? (["production", "development", "test"] as const);
  const diagnostics: NaniProjectDiagnostic[] = [];
  const discovered: DiscoveredNaniScript[] = [];

  for (const scope of selectedScopes) {
    const scopeConfig = config.scopes[scope];
    if (!scopeConfig) continue;
    const sourceRoot = resolve(projectRoot, scopeConfig.sourceRoot);
    if (!isWithin(projectRoot, sourceRoot)) {
      diagnostics.push(discoveryDiagnostic(
        "source-root-outside-project",
        `Nani ${scope} source root '${scopeConfig.sourceRoot}' escapes the project root.`,
        scope
      ));
      continue;
    }
    const scriptRoot = normalizeScriptRoot(scopeConfig.scriptRoot);
    if (scriptRoot === undefined) {
      diagnostics.push(discoveryDiagnostic(
        "invalid-script-root",
        `Nani ${scope} script root '${scopeConfig.scriptRoot}' must be a relative normalized POSIX path.`,
        scope
      ));
      continue;
    }

    let rootStat;
    try {
      rootStat = await lstat(sourceRoot);
    } catch {
      diagnostics.push(discoveryDiagnostic(
        "source-root-missing",
        `Configured Nani ${scope} source root '${scopeConfig.sourceRoot}' does not exist.`,
        scope
      ));
      continue;
    }
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      diagnostics.push(discoveryDiagnostic(
        rootStat.isSymbolicLink() ? "symlink-not-supported" : "source-root-not-directory",
        `Configured Nani ${scope} source root '${scopeConfig.sourceRoot}' must be a real directory.`,
        scope
      ));
      continue;
    }

    await walkNaniFiles(sourceRoot, sourceRoot, async (sourcePath, relativePath) => {
      const scriptPath = scriptRoot ? `${scriptRoot}/${relativePath}` : relativePath;
      discovered.push({
        scope,
        sourcePath,
        sourceFile: toPosix(relative(projectRoot, sourcePath)),
        relativePath,
        scriptPath
      });
    }, diagnostics, scope);
  }

  const byPath = new Map<string, DiscoveredNaniScript>();
  const byFoldedPath = new Map<string, DiscoveredNaniScript>();
  for (const script of discovered) {
    const duplicate = byPath.get(script.scriptPath);
    if (duplicate) {
      diagnostics.push(discoveryDiagnostic(
        "duplicate-script-path",
        `Nani logical path '${script.scriptPath}' is produced by both '${duplicate.sourceFile}' and '${script.sourceFile}'.`,
        script.scope,
        script.scriptPath
      ));
    } else {
      byPath.set(script.scriptPath, script);
    }
    const folded = script.scriptPath.toLocaleLowerCase("en-US");
    const collision = byFoldedPath.get(folded);
    if (collision && collision.scriptPath !== script.scriptPath) {
      diagnostics.push(discoveryDiagnostic(
        "script-path-case-collision",
        `Nani logical paths '${collision.scriptPath}' and '${script.scriptPath}' differ only by case.`,
        script.scope,
        script.scriptPath
      ));
    } else {
      byFoldedPath.set(folded, script);
    }
  }

  if (diagnostics.length > 0) throw new NaniProjectDiscoveryError(diagnostics);
  return discovered.sort((left, right) => stablePathCompare(left.scriptPath, right.scriptPath));
}

export async function analyzeNaniCatalog(
  config: NaniProjectConfig,
  options: AnalyzeNaniCatalogOptions
): Promise<NaniCatalogAnalysis> {
  const discovered = await discoverNaniProjectScripts(config, options);
  const scripts = await Promise.all(discovered.map((script) => analyzeScript(
    script,
    config.voiceLocales,
    options.sourceDiagnosticPolicy
  )));
  const diagnostics = scripts.flatMap((script) => script.diagnostics);
  const runnableScripts = scripts.filter((script) => script.executionDisposition === "runnable");
  const linked = linkRuntimeScriptCatalog(
    options.entry,
    runnableScripts.map((script) => script.runtimeScript)
  );
  for (const diagnostic of linked.diagnostics) {
    diagnostics.push({
      source: diagnostic.code === "entry-script-missing" ? "entry" : "catalog",
      code: diagnostic.code,
      severity: diagnostic.severity,
      disposition: "fatal",
      message: diagnostic.message,
      scriptPath: diagnostic.scriptPath
    });
  }
  if (options.scopes?.includes("production") && options.scopes.includes("development")) {
    const productionScripts = runnableScripts.filter((script) => script.scope === "production");
    const developmentPaths = new Set(
      runnableScripts.filter((script) => script.scope === "development").map((script) => script.scriptPath)
    );
    const productionLink = linkRuntimeScriptCatalog(
      options.entry,
      productionScripts.map((script) => script.runtimeScript)
    );
    for (const diagnostic of productionLink.diagnostics) {
      if (diagnostic.code !== "endpoint-script-missing" || diagnostic.commandIndex === undefined || !diagnostic.endpoint) {
        continue;
      }
      const endpoint = parseStaticNaniEndpoint(diagnostic.endpoint, diagnostic.scriptPath);
      if (!endpoint.ok || !developmentPaths.has(endpoint.endpoint.scriptPath)) continue;
      const sourceScript = productionScripts.find((script) => script.scriptPath === diagnostic.scriptPath);
      const command = sourceScript?.runtimeScript.commands[diagnostic.commandIndex];
      diagnostics.push({
        source: "catalog",
        code: "development-only-target",
        severity: "warning",
        disposition: "advisory",
        message: `Navigation target '${endpoint.endpoint.scriptPath}' is valid only in the development catalog and will fail production validation.`,
        scope: "production",
        scriptPath: diagnostic.scriptPath,
        ...(command ? { loc: command.loc } : {})
      });
    }
  }
  const fatalPaths = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.disposition === "fatal" && diagnostic.scriptPath)
      .map((diagnostic) => diagnostic.scriptPath!)
  );
  const finalScripts = scripts.map((script) => fatalPaths.has(script.scriptPath)
    ? { ...script, executionDisposition: "fatal" as const }
    : script);
  return {
    entry: options.entry,
    scripts: finalScripts,
    catalog: finalScripts
      .filter((script) => script.executionDisposition === "runnable")
      .map((script) => script.source),
    diagnostics,
    hasFatalDiagnostics: diagnostics.some((diagnostic) => diagnostic.disposition === "fatal"),
    hasRecoverableDiagnostics: diagnostics.some((diagnostic) => diagnostic.disposition === "recoverable")
  };
}

export function naniEntryLocator(
  entry: NaniEntryConfig
): Pick<VnEntryDef, "id" | "initialScriptPath" | "startLabel"> {
  return {
    id: entry.id,
    initialScriptPath: entry.initialScriptPath,
    ...(entry.startLabel ? { startLabel: entry.startLabel } : {})
  };
}

async function analyzeScript(
  discovered: DiscoveredNaniScript,
  voiceLocales: readonly string[],
  policy: NaniSourceDiagnosticPolicy
): Promise<AnalyzedNaniScript> {
  const sourceText = await readFile(discovered.sourcePath, "utf8");
  const parsed = parseScenario({ sourceText, scriptPath: discovered.scriptPath });
  const compiled = compileRuntimeScript(parsed);
  const semanticRevision = await digestRuntimeScriptSemantics(compiled.script);
  const diagnostics = [
    ...parsed.diagnostics.map((diagnostic) => sourceDiagnostic("parser", diagnostic, policy, discovered)),
    ...compiled.diagnostics.map((diagnostic) => sourceDiagnostic("compiler", diagnostic, policy, discovered))
  ];
  const source: VnRuntimeScriptSource = {
    scriptPath: discovered.scriptPath,
    sourceText,
    scriptRevision: semanticRevision
  };
  return {
    ...discovered,
    sourceText,
    source,
    runtimeScript: compiled.script,
    semanticRevision,
    executionDisposition: diagnostics.some((diagnostic) => diagnostic.disposition === "fatal")
      ? "fatal"
      : "runnable",
    diagnostics,
    metadata: {
      scriptRevision: semanticRevision,
      assetRefs: deriveScriptAssetRefs(compiled.script, voiceLocales),
      characterPreloadPlan: deriveLayeredCharacterPreloadPlan(compiled.script)
    }
  };
}

function sourceDiagnostic(
  source: "parser" | "compiler",
  diagnostic: NaniSourceDiagnostic,
  policy: NaniSourceDiagnosticPolicy,
  discovered: DiscoveredNaniScript
): NaniProjectDiagnostic {
  return {
    source,
    code: diagnostic.code,
    severity: diagnostic.severity,
    disposition: classifyNaniDiagnosticDisposition({
      source,
      code: diagnostic.code,
      severity: diagnostic.severity
    }, policy),
    message: diagnostic.message,
    scope: discovered.scope,
    scriptPath: discovered.scriptPath,
    loc: diagnostic.loc,
    span: diagnostic.span
  };
}

async function walkNaniFiles(
  sourceRoot: string,
  directory: string,
  accept: (sourcePath: string, relativePath: string) => Promise<void>,
  diagnostics: NaniProjectDiagnostic[],
  scope: NaniScope
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => stablePathCompare(left.name, right.name));
  for (const entry of entries) {
    const sourcePath = resolve(directory, entry.name);
    const relativePath = toPosix(relative(sourceRoot, sourcePath));
    const stat = await lstat(sourcePath);
    if (stat.isSymbolicLink()) {
      diagnostics.push(discoveryDiagnostic(
        "symlink-not-supported",
        `Nani scope '${scope}' contains unsupported symlink '${relativePath}'.`,
        scope
      ));
      continue;
    }
    if (stat.isDirectory()) {
      await walkNaniFiles(sourceRoot, sourcePath, accept, diagnostics, scope);
      continue;
    }
    if (stat.isFile() && entry.name.endsWith(".nani")) await accept(sourcePath, relativePath);
  }
}

function normalizeScriptRoot(value: string): string | undefined {
  if (isAbsolute(value) || value.includes("\\")) return undefined;
  const normalized = value.replace(/^\.\//u, "").replace(/\/$/u, "");
  if (!normalized || normalized === ".") return "";
  if (normalized.split("/").some((part) => !part || part === "." || part === "..")) return undefined;
  return normalized;
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function discoveryDiagnostic(
  code: string,
  message: string,
  scope?: NaniScope,
  scriptPath?: string
): NaniProjectDiagnostic {
  return {
    source: "discovery",
    code,
    severity: "error",
    disposition: "fatal",
    message,
    ...(scope ? { scope } : {}),
    ...(scriptPath ? { scriptPath } : {})
  };
}

function deriveScriptAssetRefs(
  script: RuntimeScript,
  voiceLocales: readonly string[]
): readonly AssetRef[] {
  const refs = [...script.assets];
  for (const command of script.commands) {
    const textId = command.commandId === "print" && typeof command.params.textId === "string"
      ? command.params.textId
      : undefined;
    if (!textId) continue;
    for (const locale of voiceLocales) {
      refs.push({ id: `voice:${locale}:${textId}`, kind: "voice", tags: [] });
    }
  }
  const byId = new Map<string, AssetRef>();
  for (const ref of refs) {
    if (ref.id.startsWith("group:")) continue;
    const previous = byId.get(ref.id);
    if (previous && previous.kind !== ref.kind) {
      throw new Error(`Script asset '${ref.id}' is referenced as both '${previous.kind}' and '${ref.kind}'.`);
    }
    byId.set(ref.id, { id: ref.id, kind: ref.kind, tags: ref.tags ?? [] });
  }
  return [...byId.values()].sort((left, right) =>
    left.id.localeCompare(right.id) || left.kind.localeCompare(right.kind)
  );
}

function stablePathCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosix(value: string): string {
  return value.split(sep).join("/");
}
