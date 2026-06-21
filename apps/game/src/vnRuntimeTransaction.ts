import type { GameplayEvent, PixiStageSnapshot, PresentationCommand, RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import {
  reducePixiStageCommand,
  type PixiStageCommandReduction,
  type PixiStageRenderHint
} from "@v-ronpa/pixi-presenter";
import {
  defaultVnOutputRouteTable,
  selectRuntimeCommandsForTarget,
  type VnOutputRouteTable,
  type VnRuntimeProfile
} from "./vnOutputRoutes";

export interface VnRuntimePresentationTransactionInput {
  runtimeCommands: RuntimeCommand[];
  previousPixiStage: PixiStageSnapshot;
  profile?: VnRuntimeProfile;
  routeTable?: VnOutputRouteTable;
}

export interface VnRuntimePresentationTransaction {
  pixiStage: PixiStageSnapshot;
  pixiHints: PixiStageRenderHint[];
  gameplayEvents: GameplayEvent[];
  diagnostics: VnRuntimeTransactionDiagnostic[];
}

export interface VnRuntimeTransactionDiagnostic {
  code: "unresolved-runtime-expression";
  message: string;
  commandId: string;
}

export function createVnRuntimePresentationTransaction({
  runtimeCommands,
  previousPixiStage,
  profile = "vn2d",
  routeTable = defaultVnOutputRouteTable
}: VnRuntimePresentationTransactionInput): VnRuntimePresentationTransaction {
  const routeContext = { profile };
  const diagnostics = runtimeCommands
    .filter(hasUnresolvedExpression)
    .map((command) => ({
      code: "unresolved-runtime-expression" as const,
      message: `@${command.canonicalName} contains unresolved expression params; app adapters require resolved runtime values.`,
      commandId: command.commandId
    }));
  const pixiCommands = selectRuntimeCommandsForTarget(runtimeCommands, "pixi", routeTable, routeContext);
  const pixiReduction = pixiCommands.reduce<PixiStageCommandReduction>(
    (current, command) => {
      const presentationCommand = runtimeCommandToPixiPresentationCommand(command);
      if (!presentationCommand) return current;
      const next = reducePixiStageCommand(current.snapshot, presentationCommand);
      return {
        snapshot: next.snapshot,
        hints: [...current.hints, ...next.hints]
      };
    },
    { snapshot: previousPixiStage, hints: [] }
  );
  const gameplayEvents = selectRuntimeCommandsForTarget(runtimeCommands, "gameplay", routeTable, routeContext)
    .map(runtimeCommandToGameplayEvent)
    .filter((event): event is GameplayEvent => event !== undefined);

  return {
    pixiStage: pixiReduction.snapshot,
    pixiHints: pixiReduction.hints,
    gameplayEvents,
    diagnostics
  };
}

export function runtimeCommandToPixiPresentationCommand(command: RuntimeCommand): PresentationCommand | undefined {
  if (hasUnresolvedExpression(command)) return undefined;

  if (command.commandId === "back") {
    const stageCommand: PresentationCommand = {
      type: "set-background",
      backgroundId: stringParam(command, "appearance") ?? "bg:unknown"
    };
    const effect = stringParam(command, "effect");
    if (effect) stageCommand.effect = effect;
    return stageCommand;
  }

  if (command.commandId === "charenter") {
    const stageCommand: PresentationCommand = {
      type: "char-enter",
      characterId: stringParam(command, "characterId") ?? "character:unknown",
      slot: pixiSlotParam(command, "slot") ?? "center",
      effect: stringParam(command, "effect") ?? "fadeIn"
    };
    const portraitId = stringParam(command, "portraitId");
    if (portraitId) stageCommand.portraitId = portraitId;
    return stageCommand;
  }

  if (command.commandId === "shake") {
    return {
      type: "shake",
      target: stringParam(command, "target") ?? "stage",
      intensity: numberParam(command, "intensity", 0.35),
      durationMs: numberParam(command, "duration", 280)
    };
  }

  if (command.commandId === "flash") {
    return {
      type: "flash",
      color: stringParam(command, "color") ?? "#ffffff",
      durationMs: numberParam(command, "duration", 160)
    };
  }

  if (command.commandId === "focus") {
    return {
      type: "focus",
      target: stringParam(command, "target") ?? "stage",
      durationMs: numberParam(command, "duration", 500)
    };
  }

  if (command.commandId === "trialkeyword") {
    const stageCommand: PresentationCommand = {
      type: "trial-keyword",
      keywordId: stringParam(command, "keywordId") ?? "kw:unknown",
      text: stringParam(command, "text") ?? "keyword"
    };
    const evidenceId = stringParam(command, "evidenceId");
    if (evidenceId) stageCommand.evidenceId = evidenceId;
    const speakerId = stringParam(command, "speakerId");
    if (speakerId) stageCommand.speakerId = speakerId;
    return stageCommand;
  }

  return undefined;
}

export function runtimeCommandToGameplayEvent(command: RuntimeCommand): GameplayEvent | undefined {
  if (command.commandId !== "gameplay") return undefined;
  if (hasUnresolvedExpression(command)) return undefined;

  const type = stringParam(command, "type") ?? "";
  const quantity = numberParam(command, "quantity", 1);
  const itemId = stringParam(command, "itemId");
  const evidenceId = stringParam(command, "evidenceId");
  const characterId = stringParam(command, "characterId");
  const status = stringParam(command, "status");
  const skillId = stringParam(command, "skillId");

  if (type === "grant-item" && itemId) return { type, itemId, quantity };
  if (type === "remove-item" && itemId) return { type, itemId, quantity };
  if (type === "consume-item" && itemId) return { type, itemId, quantity };
  if (type === "grant-evidence" && evidenceId) return { type, evidenceId };
  if (type === "remove-evidence" && evidenceId) return { type, evidenceId };
  if (type === "change-character-affinity" && characterId) {
    return { type, characterId, affinityDelta: numberParam(command, "affinityDelta", 0) };
  }
  if (type === "add-character-status" && characterId && status) return { type, characterId, status };
  if (type === "remove-character-status" && characterId && status) return { type, characterId, status };
  if (type === "unlock-character-skill" && characterId && skillId) return { type, characterId, skillId };
  return undefined;
}

function pixiSlotParam(command: RuntimeCommand, key: string): "left" | "center" | "right" | undefined {
  const value = stringParam(command, key);
  return value === "left" || value === "center" || value === "right" ? value : undefined;
}

function stringParam(command: RuntimeCommand, key: string): string | undefined {
  const value = scalarValue(command.params[key]);
  return value === undefined ? undefined : String(value);
}

function numberParam(command: RuntimeCommand, key: string, fallback: number): number {
  const value = scalarValue(command.params[key]);
  return typeof value === "number" ? value : fallback;
}

function scalarValue(value: RuntimeValue | undefined): string | number | boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => String(scalarValue(item))).join(",");
  return undefined;
}

function hasUnresolvedExpression(command: RuntimeCommand): boolean {
  return Object.values(command.params).some(runtimeValueHasExpression);
}

function runtimeValueHasExpression(value: RuntimeValue): boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return false;
  if (Array.isArray(value)) return value.some(runtimeValueHasExpression);
  return true;
}
