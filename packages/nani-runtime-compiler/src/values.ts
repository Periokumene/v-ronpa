import type { RuntimeValue } from "@v-ronpa/contracts";
import type { NaniValue } from "@v-ronpa/nani-parser";
import type { CommandShape } from "./types";

export function runtimePrimaryValueFromRawParam(raw: string): NaniValue {
  return raw.startsWith("#")
    ? { type: "raw", value: raw }
    : raw.includes(",")
      ? parseRawList(raw)
      : { type: "string", value: raw };
}

function parseRawList(raw: string): NaniValue {
  return { type: "list", value: raw.split(",").map(runtimePrimaryValueFromRawParam) };
}

export function getCommandParam(command: CommandShape, key: string): NaniValue | undefined {
  const direct = command.params[key];
  if (direct) return direct;
  const normalized = normalizeParamName(key);
  for (const candidate in command.params) {
    if (normalizeParamName(candidate) === normalized) return command.params[candidate];
  }
  return undefined;
}

export function runtimeParam(command: CommandShape, key: string): RuntimeValue | undefined {
  const value = runtimeCommandValue(getCommandParam(command, key));
  if (value !== undefined) return value;
  const normalized = normalizeParamName(key);
  for (const candidate in command.flags) {
    if (normalizeParamName(candidate) === normalized) return command.flags[candidate];
  }
  return undefined;
}

export function runtimeCommandValue(value: NaniValue | undefined): RuntimeValue | undefined {
  return value ? runtimeValue(value) : undefined;
}

export function staticScalarValue(value: NaniValue | undefined): string | number | boolean | undefined {
  if (!value) return undefined;
  if (value.type === "string" || value.type === "number" || value.type === "boolean") return value.value;
  if (value.type === "raw") return value.value;
  if (value.type === "expression") return undefined;
  return value.value.map((item) => String(staticScalarValue(item))).join(",");
}

export function runtimeValue(value: NaniValue | undefined): RuntimeValue {
  if (!value) return true;
  switch (value.type) {
    case "string":
    case "number":
    case "boolean":
      return value.value;
    case "raw":
      return value.value;
    case "expression":
      return { type: "expression", source: value.source };
    case "list":
      return value.value.map(runtimeValue);
  }
}

export function plainCommandValue(value: NaniValue): unknown {
  switch (value.type) {
    case "string":
    case "number":
    case "boolean":
      return value.value;
    case "raw":
      return value.value;
    case "expression":
      return { expression: value.source };
    case "list":
      return value.value.map(plainCommandValue);
  }
}

export function plainParamRecord(params: Record<string, NaniValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, plainCommandValue(value)]));
}

export function compactParams(params: Record<string, RuntimeValue | undefined>): Record<string, RuntimeValue> {
  return Object.fromEntries(Object.entries(params).filter((entry): entry is [string, RuntimeValue] => entry[1] !== undefined));
}

export function normalizeParamName(name: string): string {
  return name.toLowerCase();
}

export function scenePositionRuntimeParam(command: CommandShape, key: string): RuntimeValue | undefined {
  const value = runtimeParam(command, key);
  if (value === undefined) return undefined;
  if (typeof value === "number") return [value, 0];
  if (value && !Array.isArray(value) && typeof value === "object" && value.type === "expression") return [value, 0];
  return value;
}

export function durationMsValue(value: RuntimeValue | undefined): RuntimeValue | undefined {
  if (typeof value === "number") return Math.max(0, Math.round(value * 1000));
  if (value && !Array.isArray(value) && typeof value === "object" && value.type === "expression") {
    return { type: "expression", source: "(" + value.source + ")*1000" };
  }
  return value;
}

export function splitNamedString(value: RuntimeValue | undefined): { id?: RuntimeValue; value?: RuntimeValue } {
  if (value === undefined) return {};
  if (typeof value !== "string") return { id: value };
  const dot = value.indexOf(".");
  if (dot < 0) return { id: value };
  return { id: value.slice(0, dot), value: value.slice(dot + 1) };
}

export function splitNamedAppearanceExpression(
  value: RuntimeValue | undefined
): { id?: RuntimeValue; value?: RuntimeValue } {
  if (value === undefined) return {};
  if (Array.isArray(value)) {
    const [first, ...rest] = value;
    if (typeof first !== "string") return { id: value };
    const named = splitNamedString(first);
    if (typeof named.id !== "string") return { id: value };
    if (typeof named.value !== "string") return { id: named.id };
    const expressions = [named.value, ...rest.map(stringRuntimeValue)].filter(
      (item): item is string => Boolean(item)
    );
    return {
      id: named.id,
      value: expressions.join(",")
    };
  }
  return splitNamedString(value);
}

function stringRuntimeValue(value: RuntimeValue): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function createGenericParams(command: CommandShape): Record<string, RuntimeValue> {
  const params: Record<string, RuntimeValue> = {};
  if (command.primary) params.primary = runtimeValue(command.primary);
  for (const [key, value] of Object.entries(command.params)) params[key] = runtimeValue(value);
  for (const [key, value] of Object.entries(command.flags)) params[key] = value;
  return params;
}
