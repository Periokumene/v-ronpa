import {
  AssetIdSchema,
  getNaniCommandDefinition,
  type AssetCapability,
  type NaniCommandDefinition,
  type NaniCommandParamSpec,
  type RuntimeValue
} from "@v-ronpa/contracts";
import {
  parseScenario,
  type CommandIR,
  type NaniCommandArgumentSourceMap,
  type TextSpan
} from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import type { NaniDiagnostic } from "./diagnostics";
import {
  mimeSupportsCapability,
  type NaniProjectAsset,
  type NaniProjectAssetIndex
} from "./projectAssets";

export type NaniAssetReferenceUsage = "load" | "selector";

export interface NaniAssetReferenceSlot {
  capability: AssetCapability;
  resolution: "asset-id" | "character-id";
  runtimeParam: string;
  usage: NaniAssetReferenceUsage;
  param: NaniCommandParamSpec;
}

export interface NaniAssetReferenceOccurrence extends NaniAssetReferenceSlot {
  commandId: string;
  value: string;
  span: TextSpan;
}

export interface ResolvedNaniAssetReference extends NaniAssetReferenceOccurrence {
  assetId: string;
  asset: NaniProjectAsset;
  characterId?: string;
}

export function assetReferenceSlot(param: NaniCommandParamSpec): NaniAssetReferenceSlot | undefined {
  if (param.resource) {
    return {
      ...param.resource,
      usage: "load",
      param
    };
  }
  const reference = param.authoring?.assetReference;
  if (!reference) return undefined;
  return {
    capability: reference.capability,
    resolution: reference.resolution,
    runtimeParam: reference.runtimeParam,
    usage: "selector",
    param
  };
}

export function assetReferenceSlots(definition: NaniCommandDefinition): NaniAssetReferenceSlot[] {
  return definition.params.flatMap((param) => {
    const slot = assetReferenceSlot(param);
    return slot ? [slot] : [];
  });
}

export function collectNaniAssetReferences(
  sourceText: string,
  scriptPath: string
): NaniAssetReferenceOccurrence[] {
  const document = parseScenario({ sourceText, scriptPath });
  const compiled = compileRuntimeScript(document).script;
  const occurrences: NaniAssetReferenceOccurrence[] = [];

  for (const runtime of compiled.commands) {
    const definition = getNaniCommandDefinition(runtime.commandId);
    if (!definition) continue;
    const statementIndex = document.scenario.statements.findIndex((statement) =>
      statement.kind === "command"
      && statement.loc.line === runtime.loc.line
      && statement.loc.column === runtime.loc.column
    );
    const statement = document.scenario.statements[statementIndex];
    const sourceMap = document.sourceMap.statements[statementIndex]?.command;
    if (!statement || statement.kind !== "command" || !sourceMap) continue;

    for (const slot of assetReferenceSlots(definition)) {
      const value = runtime.params[slot.runtimeParam];
      if (!isStaticString(value)) continue;
      const origin = effectiveReferenceArgumentOrigin(statement, definition, slot);
      if (!origin) continue;
      const argument = sourceMap.arguments[origin.argumentIndex];
      const span = valueSpan(argument, origin.promoted);
      if (!span) continue;
      occurrences.push({
        ...slot,
        commandId: runtime.commandId,
        value,
        span
      });
    }
  }
  return occurrences;
}

export function computeNaniAssetDiagnostics(
  sourceText: string,
  scriptPath: string,
  index: NaniProjectAssetIndex
): NaniDiagnostic[] {
  return collectNaniAssetReferences(sourceText, scriptPath).flatMap((reference) => {
    if (reference.resolution === "character-id") {
      if (reference.value === "*") return [];
      const character = index.characters.find((candidate) => candidate.characterId === reference.value);
      if (!character) {
        return [assetDiagnostic(
          "character-asset-missing",
          `Character '${reference.value}' has no App asset binding.`,
          reference.span
        )];
      }
      return validateResolvedId(character.assetId, reference, index);
    }
    if (reference.value.startsWith("group:")) return [];
    return validateResolvedId(reference.value, reference, index);
  });
}

export function resolveNaniAssetReferenceAtOffset(
  sourceText: string,
  scriptPath: string,
  offset: number,
  index: NaniProjectAssetIndex
): ResolvedNaniAssetReference | undefined {
  const occurrence = collectNaniAssetReferences(sourceText, scriptPath).find((candidate) =>
    offset >= candidate.span.start && offset <= candidate.span.end
  );
  if (!occurrence) return undefined;
  const character = occurrence.resolution === "character-id"
    ? index.characters.find((candidate) => candidate.characterId === occurrence.value)
    : undefined;
  const assetId = character?.assetId ?? occurrence.value;
  if (!AssetIdSchema.safeParse(assetId).success) return undefined;
  const asset = index.assets.find((candidate) => candidate.id === assetId);
  if (!asset || !mimeSupportsCapability(asset.mimeType, occurrence.capability)) return undefined;
  return {
    ...occurrence,
    assetId,
    asset,
    ...(character ? { characterId: character.characterId } : {})
  };
}

function validateResolvedId(
  assetId: string,
  reference: NaniAssetReferenceOccurrence,
  index: NaniProjectAssetIndex
): NaniDiagnostic[] {
  if (!AssetIdSchema.safeParse(assetId).success) {
    return [assetDiagnostic(
      "invalid-asset-id",
      `Invalid App AssetId '${assetId}'; use a lowercase slash-kebab path without an extension.`,
      reference.span
    )];
  }
  const asset = index.assets.find((candidate) => candidate.id === assetId);
  if (!asset) {
    return [assetDiagnostic(
      "asset-missing",
      `Asset '${assetId}' does not exist in this App asset project.`,
      reference.span
    )];
  }
  if (!mimeSupportsCapability(asset.mimeType, reference.capability)) {
    return [assetDiagnostic(
      "asset-capability-mismatch",
      `Asset '${assetId}' uses MIME '${asset.mimeType}', which does not support '${reference.capability}'.`,
      reference.span
    )];
  }
  return [];
}

function assetDiagnostic(code: string, message: string, span: TextSpan): NaniDiagnostic {
  return { code, message, severity: "error", source: "nani-assets", span };
}

function effectiveReferenceArgumentOrigin(
  command: CommandIR,
  definition: NaniCommandDefinition,
  slot: NaniAssetReferenceSlot
): { argumentIndex: number; promoted?: boolean } | undefined {
  const primaryIndex = command.args.findIndex((argument) => argument.kind === "value");
  const primarySlot = assetReferenceSlots(definition)[0];
  if (primaryIndex >= 0 && primarySlot?.param.name === slot.param.name) {
    return { argumentIndex: primaryIndex };
  }

  const names = new Set([slot.param.name, ...(slot.param.aliases ?? [])].map(normalize));
  let selected: number | undefined;
  for (const [index, argument] of command.args.entries()) {
    if (argument.kind === "param" && names.has(normalize(argument.key))) selected = index;
  }
  if (selected !== undefined) return { argumentIndex: selected };

  if (primarySlot?.param.name !== slot.param.name) return undefined;
  const declared = new Set(definition.params.flatMap((param) =>
    [param.name, ...(param.aliases ?? [])].map(normalize)
  ));
  const promoted = command.args.findIndex((argument) =>
    argument.kind === "param"
    && !declared.has(normalize(argument.key))
    && normalize(argument.key) !== "if"
    && normalize(argument.key) !== "unless"
  );
  return promoted >= 0 ? { argumentIndex: promoted, promoted: true } : undefined;
}

function valueSpan(argument: NaniCommandArgumentSourceMap | undefined, promoted = false): TextSpan | undefined {
  if (!argument) return undefined;
  if (promoted) return argument.span.end > argument.span.start ? argument.span : undefined;
  if (argument.valueSpan && argument.valueSpan.end > argument.valueSpan.start) return argument.valueSpan;
  return argument.span.end > argument.span.start ? argument.span : undefined;
}

function isStaticString(value: RuntimeValue | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("en-US");
}
