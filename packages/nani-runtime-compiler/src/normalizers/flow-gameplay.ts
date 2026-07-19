import type { CommandNormalizerDescriptor } from "../types";
import {
  compactParams,
  runtimeCommandValue,
  runtimeParam,
  staticScalarValue
} from "../values.ts";

export const flowGameplayNormalizers: Readonly<Record<string, CommandNormalizerDescriptor>> = {
  trialkeyword: {
    acceptsPrimary: true,
    consumedParams: ["id", "text", "speaker", "evidence"],
    normalize: (command) =>
      compactParams({
        keywordId: runtimeCommandValue(command.primary) ?? runtimeParam(command, "id") ?? "kw:unknown",
        text: runtimeParam(command, "text") ?? "keyword",
        evidenceId: runtimeParam(command, "evidence"),
        speakerId: runtimeParam(command, "speaker")
      })
  },
  gameplay: {
    acceptsPrimary: true,
    consumedParams: [
      "type",
      "quantity",
      "item",
      "itemId",
      "id",
      "evidence",
      "evidenceId",
      "character",
      "characterId",
      "status",
      "skill",
      "skillId",
      "delta",
      "affinityDelta"
    ],
    normalize: (command) =>
      compactParams({
        type: runtimeCommandValue(command.primary) ?? runtimeParam(command, "type") ?? "",
        quantity: runtimeParam(command, "quantity") ?? 1,
        itemId: runtimeParam(command, "item") ?? runtimeParam(command, "itemId") ?? runtimeParam(command, "id"),
        evidenceId: runtimeParam(command, "evidence") ?? runtimeParam(command, "evidenceId") ?? runtimeParam(command, "id"),
        characterId: runtimeParam(command, "character") ?? runtimeParam(command, "characterId"),
        status: runtimeParam(command, "status"),
        skillId: runtimeParam(command, "skill") ?? runtimeParam(command, "skillId"),
        affinityDelta: runtimeParam(command, "delta") ?? runtimeParam(command, "affinityDelta") ?? 0
      })
  },
  choice: {
    acceptsPrimary: true,
    consumedParams: ["goto", "id", "enabled", "set"],
    normalize: (command) =>
      compactParams({
        text: runtimeCommandValue(command.primary) ?? "Choice",
        goto: runtimeParam(command, "goto"),
        id: runtimeParam(command, "id"),
        enabled: runtimeParam(command, "enabled"),
        setExpression: runtimeParam(command, "set")
      })
  },
  clearchoice: {
    acceptsPrimary: true,
    consumedParams: ["id"],
    normalize: (command) =>
      compactParams({
        id: runtimeCommandValue(command.primary) ?? runtimeParam(command, "id")
      })
  },
  goto: {
    acceptsPrimary: true,
    consumedParams: ["path"],
    normalize: (command) =>
      compactParams({
        label: runtimeCommandValue(command.primary) ?? runtimeParam(command, "path") ?? ""
      })
  },
  set: {
    acceptsPrimary: true,
    consumedParams: ["expression"],
    normalize: (command) => {
      const key = command.primary ? String(staticScalarValue(command.primary) ?? "") : Object.keys(command.params)[0] ?? "";
      const value = runtimeParam(command, key) ?? runtimeCommandValue(command.primary) ?? true;
      return compactParams({ key, value });
    }
  },
  end: {
    acceptsPrimary: false,
    consumedParams: [],
    normalize: () => ({})
  }
};
