import type { CommandNormalizerDescriptor } from "../types";
import {
  compactParams,
  durationMsValue,
  runtimeCommandValue,
  runtimeParam
} from "../values.ts";

export const textUiMediaNormalizers: Readonly<Record<string, CommandNormalizerDescriptor>> = {
  print: {
    acceptsPrimary: true,
    consumedParams: ["text", "author", "as", "printer", "speed", "reset"],
    normalize: (command) =>
      compactParams({
        text: runtimeCommandValue(command.primary) ?? runtimeParam(command, "text") ?? "",
        speaker: runtimeParam(command, "author") ?? runtimeParam(command, "as"),
        printerId: runtimeParam(command, "printer"),
        speed: runtimeParam(command, "speed"),
        reset: runtimeParam(command, "reset"),
        autoNext: false
      })
  },
  append: {
    acceptsPrimary: true,
    consumedParams: ["text", "author", "printer"],
    normalize: (command) =>
      compactParams({
        text: runtimeCommandValue(command.primary) ?? runtimeParam(command, "text") ?? "",
        speaker: runtimeParam(command, "author"),
        printerId: runtimeParam(command, "printer")
      })
  },
  resettext: {
    acceptsPrimary: true,
    consumedParams: ["printerId"],
    normalize: (command) =>
      compactParams({
        printerId: runtimeCommandValue(command.primary) ?? runtimeParam(command, "printerId")
      })
  },
  clearbacklog: {
    acceptsPrimary: false,
    consumedParams: [],
    normalize: () => ({})
  },
  format: {
    acceptsPrimary: true,
    consumedParams: ["templates", "printer"],
    normalize: (command) =>
      compactParams({
        templates: runtimeCommandValue(command.primary) ?? runtimeParam(command, "templates"),
        printerId: runtimeParam(command, "printer")
      })
  },
  showprinter: {
    acceptsPrimary: true,
    consumedParams: ["printerId", "time"],
    normalize: (command) =>
      compactParams({
        printerId: runtimeCommandValue(command.primary) ?? runtimeParam(command, "printerId") ?? "default",
        durationMs: durationMsValue(runtimeParam(command, "time"))
      })
  },
  showui: {
    acceptsPrimary: true,
    consumedParams: ["uINames", "target", "visible", "time", "wait"],
    normalize: (command) =>
      compactParams({
        target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "uINames") ?? runtimeParam(command, "target"),
        visible: runtimeParam(command, "visible") ?? true,
        durationMs: durationMsValue(runtimeParam(command, "time")),
        wait: runtimeParam(command, "wait") ?? false
      })
  },
  hideui: {
    acceptsPrimary: true,
    consumedParams: ["uINames", "target", "time", "wait"],
    normalize: (command) =>
      compactParams({
        target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "uINames") ?? runtimeParam(command, "target"),
        visible: false,
        durationMs: durationMsValue(runtimeParam(command, "time")),
        wait: runtimeParam(command, "wait") ?? false
      })
  },
  toast: {
    acceptsPrimary: true,
    consumedParams: ["text", "appearance", "time"],
    normalize: (command) =>
      compactParams({
        text: runtimeCommandValue(command.primary) ?? runtimeParam(command, "text") ?? "",
        appearance: runtimeParam(command, "appearance"),
        durationMs: durationMsValue(runtimeParam(command, "time"))
      })
  },
  wait: {
    acceptsPrimary: true,
    consumedParams: ["waitMode"],
    normalize: (command) =>
      compactParams({
        waitMode: runtimeCommandValue(command.primary) ?? runtimeParam(command, "waitMode") ?? "i"
      })
  },
  input: {
    acceptsPrimary: true,
    consumedParams: ["variableName", "type", "summary", "value"],
    normalize: (command) =>
      compactParams({
        variableName: runtimeCommandValue(command.primary) ?? runtimeParam(command, "variableName") ?? "",
        valueType: runtimeParam(command, "type") ?? "string",
        summary: runtimeParam(command, "summary"),
        defaultValue: runtimeParam(command, "value")
      })
  },
  bgm: {
    acceptsPrimary: true,
    consumedParams: ["bgmPath", "volume", "fade", "time", "group"],
    normalize: (command) =>
      compactParams({
        bgmPath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "bgmPath") ?? "",
        volume: runtimeParam(command, "volume"),
        fadeMs: durationMsValue(runtimeParam(command, "fade")),
        durationMs: durationMsValue(runtimeParam(command, "time")),
        group: runtimeParam(command, "group")
      })
  },
  stopbgm: {
    acceptsPrimary: true,
    consumedParams: ["bgmPath", "fade", "group"],
    normalize: (command) =>
      compactParams({
        bgmPath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "bgmPath"),
        fadeMs: durationMsValue(runtimeParam(command, "fade")),
        group: runtimeParam(command, "group")
      })
  },
  sfx: {
    acceptsPrimary: true,
    consumedParams: ["sfxPath", "volume", "loop", "fade", "time", "group"],
    normalize: (command) =>
      compactParams({
        sfxPath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "sfxPath") ?? "",
        volume: runtimeParam(command, "volume"),
        loop: runtimeParam(command, "loop"),
        fadeMs: durationMsValue(runtimeParam(command, "fade")),
        durationMs: durationMsValue(runtimeParam(command, "time")),
        group: runtimeParam(command, "group")
      })
  },
  sfxfast: {
    acceptsPrimary: true,
    consumedParams: ["sfxPath", "volume", "group"],
    normalize: (command) =>
      compactParams({
        sfxPath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "sfxPath") ?? "",
        volume: runtimeParam(command, "volume"),
        group: runtimeParam(command, "group")
      })
  },
  stopsfx: {
    acceptsPrimary: true,
    consumedParams: ["sfxPath", "fade", "group"],
    normalize: (command) =>
      compactParams({
        sfxPath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "sfxPath"),
        fadeMs: durationMsValue(runtimeParam(command, "fade")),
        group: runtimeParam(command, "group")
      })
  },
  movie: {
    acceptsPrimary: true,
    consumedParams: ["moviePath", "time", "block"],
    normalize: (command) =>
      compactParams({
        moviePath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "moviePath") ?? "",
        durationMs: durationMsValue(runtimeParam(command, "time")),
        block: runtimeParam(command, "block") ?? false
      })
  }
};
