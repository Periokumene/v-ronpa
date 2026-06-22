import type { PixiStageSnapshot, PixiStageSlotId, RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";

export type PixiStageRenderHint =
  | { type: "flash"; color: string; durationMs: number }
  | { type: "shake"; target: string; intensity: number; durationMs: number }
  | {
      type: "trial-keyword";
      keywordId: string;
      text: string;
      evidenceId?: string;
      speakerId?: string;
    }
  | {
      type: "trial-subtitle";
      subtitleId: string;
      text: string;
      style: "dialog" | "barrage" | "keyword";
      speakerId?: string;
      keywordId?: string;
      evidenceId?: string;
    };

export type PixiRuntimeCommandDiagnosticCode =
  | "unresolved-runtime-expression"
  | "unsupported-pixi-command"
  | "unsupported-pixi-params";

export interface PixiRuntimeCommandDiagnostic {
  code: PixiRuntimeCommandDiagnosticCode;
  message: string;
  commandId: string;
}

export interface PixiRuntimeCommandReduction {
  snapshot: PixiStageSnapshot;
  hints: PixiStageRenderHint[];
  diagnostics: PixiRuntimeCommandDiagnostic[];
}

export const pixiStageSlots: PixiStageSlotId[] = ["left", "center", "right"];

export function createInitialPixiStageSnapshot(): PixiStageSnapshot {
  return {
    version: 1,
    revision: 0,
    slots: {}
  };
}

export function reducePixiRuntimeCommand(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand
): PixiRuntimeCommandReduction {
  if (hasUnresolvedExpression(command)) {
    return {
      snapshot,
      hints: [],
      diagnostics: [
        {
          code: "unresolved-runtime-expression",
          commandId: command.commandId,
          message: `@${command.canonicalName} contains unresolved expression params; Pixi requires resolved runtime values.`
        }
      ]
    };
  }

  if (command.commandId === "back") {
    const appearance = stringParam(command, "appearance");
    if (!appearance) return unsupportedPixiParams(snapshot, command, "missing required params: appearance");
    return {
      snapshot: {
        ...snapshot,
        revision: snapshot.revision + 1,
        background: { backgroundId: appearance }
      },
      hints: [],
      diagnostics: []
    };
  }

  if (command.commandId === "charenter") {
    const characterId = stringParam(command, "characterId");
    if (!characterId) return unsupportedPixiParams(snapshot, command, "missing required params: characterId");
    const rawSlot = stringParam(command, "slot");
    if (rawSlot && !isPixiStageSlot(rawSlot)) {
      return unsupportedPixiParams(snapshot, command, `unsupported slot: ${rawSlot}`);
    }
    const slot = rawSlot ?? "center";
    const portrait = {
      slot,
      characterId,
      ...(stringParam(command, "portraitId") ? { portraitId: stringParam(command, "portraitId") } : {})
    };
    return {
      snapshot: {
        ...snapshot,
        revision: snapshot.revision + 1,
        slots: {
          ...snapshot.slots,
          [slot]: portrait
        }
      },
      hints: [],
      diagnostics: []
    };
  }

  if (command.commandId === "flash") {
    return {
      snapshot,
      hints: [
        {
          type: "flash",
          color: stringParam(command, "color") ?? "#ffffff",
          durationMs: numberParam(command, "duration", 160)
        }
      ],
      diagnostics: []
    };
  }

  if (command.commandId === "shake") {
    return {
      snapshot,
      hints: [
        {
          type: "shake",
          target: stringParam(command, "target") ?? "stage",
          intensity: numberParam(command, "intensity", 0.35),
          durationMs: numberParam(command, "duration", 280)
        }
      ],
      diagnostics: []
    };
  }

  if (command.commandId === "trialkeyword") {
    const keywordId = stringParam(command, "keywordId");
    const text = stringParam(command, "text");
    if (!keywordId || !text) {
      const missingParams = [
        keywordId ? undefined : "keywordId",
        text ? undefined : "text"
      ].filter((param): param is string => param !== undefined);
      return unsupportedPixiParams(snapshot, command, `missing required params: ${missingParams.join(", ")}`);
    }
    const hint: PixiStageRenderHint = {
      type: "trial-keyword",
      keywordId,
      text
    };
    const evidenceId = stringParam(command, "evidenceId");
    if (evidenceId) hint.evidenceId = evidenceId;
    const speakerId = stringParam(command, "speakerId");
    if (speakerId) hint.speakerId = speakerId;
    return { snapshot, hints: [hint], diagnostics: [] };
  }

  return unsupportedPixiCommand(snapshot, command);
}

function unsupportedPixiCommand(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  return {
    snapshot,
    hints: [],
    diagnostics: [
      {
        code: "unsupported-pixi-command",
        commandId: command.commandId,
        message: `@${command.canonicalName} is routed to Pixi but is not consumed by pixi-presenter yet.`
      }
    ]
  };
}

function unsupportedPixiParams(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand,
  reason: string
): PixiRuntimeCommandReduction {
  return {
    snapshot,
    hints: [],
    diagnostics: [
      {
        code: "unsupported-pixi-params",
        commandId: command.commandId,
        message: `@${command.canonicalName} is routed to Pixi but cannot be consumed: ${reason}.`
      }
    ]
  };
}

function isPixiStageSlot(value: string): value is "left" | "center" | "right" {
  return value === "left" || value === "center" || value === "right";
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
