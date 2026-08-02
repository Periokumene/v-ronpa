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
  type CommandIR,
  type NaniSourceDiagnostic,
  type ParsedScenarioDocument,
  type TextSpan
} from "@v-ronpa/nani-parser";
import {
  classifyNaniDiagnosticDisposition,
  compileRuntimeScript,
  digestRuntimeScriptSemantics,
  linkRuntimeScriptCatalog,
  type NaniDiagnosticDisposition,
  type NaniDiagnosticSource,
  type NaniSourceDiagnosticPolicy,
  type RuntimeScriptCatalogDiagnostic
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
  labels: Readonly<Record<string, TextSpan>>;
  diagnostics: readonly NaniProjectDiagnostic[];
  metadata: NaniScriptMetadata;
}

export interface NaniCatalogAnalysis {
  entries: readonly NaniEntryConfig[];
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
  entries: readonly NaniEntryConfig[];
  sourceDiagnosticPolicy: NaniSourceDiagnosticPolicy;
  loadSourceText?: (script: DiscoveredNaniScript) => Promise<string>;
}

interface AnalyzedNaniScriptRecord {
  analyzed: AnalyzedNaniScript;
  document: ParsedScenarioDocument;
}

export class NaniProjectDiscoveryError extends Error {
  readonly diagnostics: readonly NaniProjectDiagnostic[];

  constructor(diagnostics: readonly NaniProjectDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    this.name = "NaniProjectDiscoveryError";
    this.diagnostics = diagnostics;
  }
}

export function parseNaniProjectConfig(value: unknown): NaniProjectConfig {
  const project = strictRecord(
    value,
    ["scopes", "mainEntry", "testEntries", "voiceLocales"],
    "naniProject must be an object."
  );
  const scopeValues = strictRecord(
    project.scopes,
    ["production", "development", "test"],
    "naniProject.scopes must be an object."
  );
  const scopes: NaniProjectConfig["scopes"] = {};
  for (const scope of ["production", "development", "test"] as const) {
    if (scopeValues[scope] === undefined) continue;
    const scopeValue = strictRecord(
      scopeValues[scope],
      ["sourceRoot", "scriptRoot"],
      `naniProject.scopes.${scope} must be an object.`
    );
    scopes[scope] = {
      sourceRoot: requiredString(scopeValue.sourceRoot, `naniProject.scopes.${scope}.sourceRoot`),
      scriptRoot: requiredString(scopeValue.scriptRoot, `naniProject.scopes.${scope}.scriptRoot`)
    };
  }
  const testEntryValues = strictRecord(
    project.testEntries,
    undefined,
    "naniProject.testEntries must be an object."
  );
  const testEntries = Object.fromEntries(
    Object.entries(testEntryValues).map(([name, entry]) => [
      name,
      parseEntryConfig(entry, "test", `naniProject.testEntries.${name}`)
    ])
  );
  if (!Array.isArray(project.voiceLocales) || !project.voiceLocales.every(
    (locale) => typeof locale === "string" && locale.length > 0
  )) {
    throw new Error("naniProject.voiceLocales must be an array of non-empty strings.");
  }
  const mainEntry = parseEntryConfig(project.mainEntry, "production", "naniProject.mainEntry");
  const entryIds = [mainEntry, ...Object.values(testEntries)].map((entry) => entry.id);
  if (new Set(entryIds).size !== entryIds.length) {
    throw new Error("naniProject entry ids must be unique.");
  }
  return {
    scopes,
    mainEntry,
    testEntries,
    voiceLocales: [...project.voiceLocales]
  };
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
  if (options.entries.length === 0) {
    throw new NaniProjectDiscoveryError([
      discoveryDiagnostic("catalog-entry-missing", "Nani catalog analysis requires at least one entry.")
    ]);
  }
  const discovered = await discoverNaniProjectScripts(config, options);
  const loadSourceText = options.loadSourceText ?? ((script: DiscoveredNaniScript) =>
    readFile(script.sourcePath, "utf8"));
  const records = await Promise.all(discovered.map((script) => analyzeScript(
    script,
    config.voiceLocales,
    options.sourceDiagnosticPolicy,
    loadSourceText
  )));
  const scripts = records.map((record) => record.analyzed);
  const recordsByPath = new Map(records.map((record) => [record.analyzed.scriptPath, record] as const));
  const diagnostics = scripts.flatMap((script) => [...script.diagnostics]);
  const runnableScripts = scripts.filter((script) => script.executionDisposition === "runnable");
  const selectedScopes = options.scopes ?? (["production", "development", "test"] as const);
  const linkDiagnostics = dedupeCatalogDiagnostics(
    options.entries.flatMap((entry) => linkRuntimeScriptCatalog(
      entry,
      runnableScripts.map((script) => script.runtimeScript)
    ).diagnostics)
  );
  for (const diagnostic of linkDiagnostics) {
    diagnostics.push(catalogDiagnostic(diagnostic, recordsByPath));
  }
  if (selectedScopes.includes("production") && selectedScopes.includes("development")) {
    const productionScripts = runnableScripts.filter((script) => script.scope === "production");
    const developmentPaths = new Set(
      runnableScripts.filter((script) => script.scope === "development").map((script) => script.scriptPath)
    );
    const productionDiagnostics = dedupeCatalogDiagnostics(
      options.entries
        .filter((entry) => entry.scope === "production")
        .flatMap((entry) => linkRuntimeScriptCatalog(
          entry,
          productionScripts.map((script) => script.runtimeScript)
        ).diagnostics)
    );
    for (const diagnostic of productionDiagnostics) {
      if (diagnostic.code !== "endpoint-script-missing" || diagnostic.commandIndex === undefined || !diagnostic.endpoint) {
        continue;
      }
      const endpoint = parseStaticNaniEndpoint(diagnostic.endpoint, diagnostic.scriptPath);
      if (!endpoint.ok || !developmentPaths.has(endpoint.endpoint.scriptPath)) continue;
      const record = recordsByPath.get(diagnostic.scriptPath);
      const command = record?.analyzed.runtimeScript.commands[diagnostic.commandIndex];
      diagnostics.push({
        source: "catalog",
        code: "development-only-target",
        severity: "warning",
        disposition: "advisory",
        message: `Navigation target '${endpoint.endpoint.scriptPath}' is valid only in the development catalog and will fail production validation.`,
        scope: "production",
        scriptPath: diagnostic.scriptPath,
        ...(command ? { loc: command.loc } : {}),
        ...(record ? { span: navigationDiagnosticSpan(record, diagnostic) } : {})
      });
    }
  }
  const fatalPaths = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.disposition === "fatal" && diagnostic.scriptPath)
      .map((diagnostic) => diagnostic.scriptPath!)
  );
  const finalScripts = scripts.map((script) => ({
    ...script,
    executionDisposition: fatalPaths.has(script.scriptPath)
      ? "fatal" as const
      : script.executionDisposition,
    diagnostics: diagnostics.filter((diagnostic) =>
      diagnostic.scriptPath === script.scriptPath && diagnostic.source !== "entry"
    )
  }));
  return {
    entries: [...options.entries],
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
  policy: NaniSourceDiagnosticPolicy,
  loadSourceText: (script: DiscoveredNaniScript) => Promise<string>
): Promise<AnalyzedNaniScriptRecord> {
  const sourceText = await loadSourceText(discovered);
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
    document: parsed,
    analyzed: {
      ...discovered,
      sourceText,
      source,
      runtimeScript: compiled.script,
      semanticRevision,
      executionDisposition: diagnostics.some((diagnostic) => diagnostic.disposition === "fatal")
        ? "fatal"
        : "runnable",
      labels: labelSpans(parsed),
      diagnostics,
      metadata: {
        scriptRevision: semanticRevision,
        assetRefs: deriveScriptAssetRefs(compiled.script, voiceLocales),
        characterPreloadPlan: deriveLayeredCharacterPreloadPlan(compiled.script)
      }
    }
  };
}

function labelSpans(document: ParsedScenarioDocument): Readonly<Record<string, TextSpan>> {
  const labels: Record<string, TextSpan> = {};
  for (const [index, statement] of document.scenario.statements.entries()) {
    if (statement.kind !== "label") continue;
    const span = document.sourceMap.statements[index]?.nameSpan;
    if (span) labels[statement.name] = span;
  }
  return labels;
}

function catalogDiagnostic(
  diagnostic: RuntimeScriptCatalogDiagnostic,
  recordsByPath: ReadonlyMap<string, AnalyzedNaniScriptRecord>
): NaniProjectDiagnostic {
  const record = recordsByPath.get(diagnostic.scriptPath);
  const command = diagnostic.commandIndex === undefined
    ? undefined
    : record?.analyzed.runtimeScript.commands[diagnostic.commandIndex];
  return {
    source: diagnostic.code === "entry-script-missing" ? "entry" : "catalog",
    code: diagnostic.code,
    severity: diagnostic.severity,
    disposition: "fatal",
    message: diagnostic.message,
    scriptPath: diagnostic.scriptPath,
    ...(record ? { scope: record.analyzed.scope } : {}),
    ...(command ? { loc: command.loc } : {}),
    ...(record && diagnostic.commandIndex !== undefined
      ? { span: navigationDiagnosticSpan(record, diagnostic) }
      : {})
  };
}

function navigationDiagnosticSpan(
  record: AnalyzedNaniScriptRecord,
  diagnostic: RuntimeScriptCatalogDiagnostic
): TextSpan {
  const runtime = record.analyzed.runtimeScript.commands[diagnostic.commandIndex ?? -1];
  if (!runtime) throw new Error(`Missing runtime command ${String(diagnostic.commandIndex)}.`);
  const statementIndex = record.document.scenario.statements.findIndex(
    (statement) =>
      statement.kind === "command"
      && statement.loc.line === runtime.loc.line
      && statement.loc.column === runtime.loc.column
      && statement.commandId === runtime.sourceCommand?.rawCommandId
  );
  const statement = record.document.scenario.statements[statementIndex];
  const source = record.document.sourceMap.statements[statementIndex]?.command;
  if (!statement || statement.kind !== "command" || !source) {
    throw new Error(`Unable to map navigation command in ${runtime.loc.scriptPath}.`);
  }
  const argumentIndex = navigationArgumentIndex(statement);
  const argument = source.arguments[argumentIndex];
  const span = argument?.valueSpan && argument.valueSpan.end > argument.valueSpan.start
    ? argument.valueSpan
    : argument?.span;
  if (!span) throw new Error(`Unable to map navigation endpoint in ${runtime.loc.scriptPath}.`);
  return span;
}

function navigationArgumentIndex(command: CommandIR): number {
  if (command.commandId === "goto") {
    const index = command.args.findIndex((argument) => argument.kind === "value");
    if (index >= 0) return index;
  }
  if (command.commandId === "choice") {
    const index = command.args.findIndex(
      (argument) => argument.kind === "param" && argument.key.toLowerCase() === "goto"
    );
    if (index >= 0) return index;
  }
  throw new Error(`Command @${command.commandId} has no navigation endpoint argument.`);
}

function dedupeCatalogDiagnostics(
  diagnostics: readonly RuntimeScriptCatalogDiagnostic[]
): readonly RuntimeScriptCatalogDiagnostic[] {
  const unique = new Map<string, RuntimeScriptCatalogDiagnostic>();
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.scriptPath,
      diagnostic.endpoint ?? "",
      diagnostic.commandIndex ?? "",
      diagnostic.message
    ].join("\0");
    if (!unique.has(key)) unique.set(key, diagnostic);
  }
  return [...unique.values()];
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

function parseEntryConfig(
  value: unknown,
  scope: "production" | "test",
  name: string
): NaniEntryConfig {
  const entry = strictRecord(
    value,
    ["id", "scope", "initialScriptPath", "startLabel"],
    `${name} must be an object.`
  );
  if (entry.scope !== scope) throw new Error(`${name}.scope must be '${scope}'.`);
  const startLabel = entry.startLabel === undefined
    ? undefined
    : requiredString(entry.startLabel, `${name}.startLabel`);
  return {
    id: requiredString(entry.id, `${name}.id`),
    scope,
    initialScriptPath: requiredString(entry.initialScriptPath, `${name}.initialScriptPath`),
    ...(startLabel ? { startLabel } : {})
  };
}

function strictRecord(
  value: unknown,
  allowedKeys: readonly string[] | undefined,
  message: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  const candidate = value as Record<string, unknown>;
  if (allowedKeys) {
    const unknown = Object.keys(candidate).find((key) => !allowedKeys.includes(key));
    if (unknown) throw new Error(`${message.replace(/\.$/u, "")} Unknown key '${unknown}'.`);
  }
  return candidate;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}
