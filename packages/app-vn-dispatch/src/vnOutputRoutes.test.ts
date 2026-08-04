import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, NaniCommandSource, NaniCommandStatus, RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import {
  defaultVnOutputRouteTable,
  routeRuntimeCommand,
  selectRuntimeCommandsForTarget,
  type VnOutputRouteTable
} from "./vnOutputRoutes";

describe("VN output routes", () => {
  it("supports one-to-many fixed route targets", () => {
    const command = runtimeCommand("toast", "ui", { text: "Line" });
    const routeTable: VnOutputRouteTable = {
      ...defaultVnOutputRouteTable,
      commands: {
        ...defaultVnOutputRouteTable.commands,
        toast: ["ui", "debug"]
      }
    };

    expect(routeRuntimeCommand(command, routeTable)).toEqual(["ui", "debug"]);
  });

  it("keeps print out of UI and media command streams because dialog and dialogue audio are app-derived", () => {
    const commands: RuntimeCommand[] = [
      runtimeCommand("print", "text", { text: "Line", autoNext: false, textId: "voice_validation_0001" }),
      runtimeCommand("back", "scene", { appearance: "bg/harness" }),
      runtimeCommand("char", "actor", { target: "Ema", appearanceExpression: "Pensive1,ArmR3", pos: [50, 0] })
    ];

    expect(selectRuntimeCommandsForTarget(commands, "pixi")).toEqual([commands[1], commands[2]]);
    expect(selectRuntimeCommandsForTarget(commands, "ui")).toEqual([]);
    expect(selectRuntimeCommandsForTarget(commands, "media")).toEqual([]);
    expect(selectRuntimeCommandsForTarget(commands, "debug")).toEqual([commands[0]]);
  });

  it("keeps cue identity while routing its surface projection and hideCue through UI", () => {
    const cue = runtimeCommand("cue", "text", { text: "Cue", author: "Narrator" });
    const hideCue = runtimeCommand("hidecue", "ui", { durationMs: 400, wait: true });

    expect(routeRuntimeCommand(cue)).toEqual(["ui", "debug"]);
    expect(routeRuntimeCommand(hideCue)).toEqual(["ui"]);
    expect(selectRuntimeCommandsForTarget([cue, hideCue], "ui")).toEqual([cue, hideCue]);
    expect(selectRuntimeCommandsForTarget([cue, hideCue], "debug")).toEqual([cue]);
  });

  it("routes promoted media/UI commands by contract execution authority", () => {
    const commands: RuntimeCommand[] = [
      runtimeCommand("bgm", "media", { bgmPath: "bgm/investigation" }, "naninovel", "implemented"),
      runtimeCommand("toast", "ui", { text: "Debug" }, "naninovel", "implemented"),
      runtimeCommand("customState", "state", { id: "door" }, "v-ronpa", "implemented")
    ];

    expect(selectRuntimeCommandsForTarget(commands, "media")).toEqual([commands[0]]);
    expect(selectRuntimeCommandsForTarget(commands, "ui")).toEqual([commands[1]]);
    expect(selectRuntimeCommandsForTarget(commands, "app")).toEqual([commands[2]]);
  });

  it("does not route known unpromoted media or story-control commands through category fallback", () => {
    const commands: RuntimeCommand[] = [
      runtimeCommand("voice", "media", { primary: "voice/zh/voice_validation_0001" }, "naninovel", "stubbed"),
      runtimeCommand("stopvoice", "media", {}, "naninovel", "stubbed"),
      runtimeCommand("wait", "flow", { waitMode: "i" }, "naninovel", "implemented"),
      runtimeCommand("unknownMedia", "media", { path: "raw" }, "v-ronpa", "implemented")
    ];

    expect(routeRuntimeCommand(commands[0]!)).toEqual(["debug"]);
    expect(routeRuntimeCommand(commands[1]!)).toEqual(["debug"]);
    expect(routeRuntimeCommand(commands[2]!)).toEqual(["app"]);
    expect(routeRuntimeCommand(commands[3]!)).toEqual(["media"]);
    expect(selectRuntimeCommandsForTarget(commands, "media")).toEqual([commands[3]]);
  });

  it("requires explicit command or category routes for every runtime command", () => {
    const command = runtimeCommand("focus", "effect", { target: "Ema", duration: 320 });
    const routeTable: VnOutputRouteTable = {
      ...defaultVnOutputRouteTable,
      commands: {
        ...defaultVnOutputRouteTable.commands,
        focus: ["pixi", "debug"]
      }
    };

    expect(routeRuntimeCommand(command, routeTable)).toEqual(["pixi", "debug"]);
    expect(selectRuntimeCommandsForTarget([command], "debug", routeTable)).toEqual([command]);
  });
});

function runtimeCommand(
  commandId: string,
  category: NaniCommandCategory,
  params: Record<string, RuntimeValue>,
  source: NaniCommandSource = "v-ronpa",
  status: NaniCommandStatus = "implemented"
): RuntimeCommand {
  return {
    commandId,
    canonicalName: commandId,
    category,
    source,
    status,
    params,
    loc: {
      scriptPath: "route-test.nani",
      line: 1,
      column: 1,
      raw: `@${commandId}`
    }
  };
}
