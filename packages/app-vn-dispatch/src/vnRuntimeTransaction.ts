import type { GameplayEvent, PixiStageSnapshot, RuntimeCommand, RuntimeValue, StoryPresentationWaitTask } from "@v-ronpa/contracts";
import {
  reducePixiRuntimeCommand,
  type PixiRuntimeCommandReduction,
  type PixiStageRenderHint
} from "@v-ronpa/pixi-presenter";
import {
  defaultVnOutputRouteTable,
  selectRuntimeCommandsForTarget,
  type VnOutputRouteTable,
  type VnRuntimeProfile
} from "./vnOutputRoutes";
import {
  createInitialMediaRuntimeState,
  reduceMediaRuntimeCommands,
  type MediaRuntimeDiagnostic,
  type MediaRuntimeEffect,
  type MediaRuntimeState
} from "./mediaRuntime";
import {
  createInitialUiRuntimeState,
  reduceUiRuntimeCommands,
  type UiRuntimeDiagnostic,
  type UiRuntimeState
} from "./uiRuntime";

export interface VnRuntimePresentationTransactionInput {
  runtimeCommands: RuntimeCommand[];
  previousPixiStage: PixiStageSnapshot;
  previousMediaState?: MediaRuntimeState;
  previousUiState?: UiRuntimeState;
  profile?: VnRuntimeProfile;
  routeTable?: VnOutputRouteTable;
}

export interface VnRuntimePresentationTransaction {
  pixiStage: PixiStageSnapshot;
  pixiHints: PixiStageRenderHint[];
  pixiWaitTasks: StoryPresentationWaitTask[];
  gameplayEvents: GameplayEvent[];
  mediaState: MediaRuntimeState;
  mediaEffects: MediaRuntimeEffect[];
  mediaDiagnostics: MediaRuntimeDiagnostic[];
  uiState: UiRuntimeState;
  uiDiagnostics: UiRuntimeDiagnostic[];
  diagnostics: VnRuntimeTransactionDiagnostic[];
}

export interface VnRuntimeTransactionDiagnostic {
  code: "unresolved-runtime-expression" | "unsupported-pixi-command" | "unsupported-pixi-params" | "normalized-pixi-params";
  message: string;
  commandId: string;
}

export function createVnRuntimePresentationTransaction({
  runtimeCommands,
  previousMediaState = createInitialMediaRuntimeState(),
  previousPixiStage,
  previousUiState = createInitialUiRuntimeState(),
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
  const pixiReduction = pixiCommands.reduce<PixiRuntimeCommandReduction>(
    (current, command) => {
      if (hasUnresolvedExpression(command)) return current;
      const next = reducePixiRuntimeCommand(current.snapshot, command);
      return {
        snapshot: next.snapshot,
        hints: [...current.hints, ...next.hints],
        waitTasks: [...current.waitTasks, ...next.waitTasks],
        diagnostics: [...current.diagnostics, ...next.diagnostics]
      };
    },
    { snapshot: previousPixiStage, hints: [], waitTasks: [], diagnostics: [] }
  );
  const gameplayEvents = selectRuntimeCommandsForTarget(runtimeCommands, "gameplay", routeTable, routeContext)
    .map(runtimeCommandToGameplayEvent)
    .filter((event): event is GameplayEvent => event !== undefined);
  const mediaReduction = reduceMediaRuntimeCommands(
    previousMediaState,
    selectRuntimeCommandsForTarget(runtimeCommands, "media", routeTable, routeContext).filter((command) => !hasUnresolvedExpression(command))
  );
  const uiReduction = reduceUiRuntimeCommands(
    previousUiState,
    selectRuntimeCommandsForTarget(runtimeCommands, "ui", routeTable, routeContext).filter((command) => !hasUnresolvedExpression(command))
  );

  return {
    pixiStage: pixiReduction.snapshot,
    pixiHints: pixiReduction.hints,
    pixiWaitTasks: pixiReduction.waitTasks,
    gameplayEvents,
    mediaState: mediaReduction.state,
    mediaEffects: mediaReduction.effects,
    mediaDiagnostics: mediaReduction.diagnostics,
    uiState: uiReduction.state,
    uiDiagnostics: uiReduction.diagnostics,
    diagnostics: [...diagnostics, ...pixiReduction.diagnostics]
  };
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
