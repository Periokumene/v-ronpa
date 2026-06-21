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

  it("keeps print out of the UI command stream because dialog reads Story state", () => {
    const commands: RuntimeCommand[] = [
      runtimeCommand("print", "text", { text: "Line", autoNext: false }),
      runtimeCommand("back", "scene", { appearance: "bg:harness" }),
      runtimeCommand("charenter", "actor", { characterId: "character:felix", slot: "center", effect: "fadeIn" })
    ];

    expect(selectRuntimeCommandsForTarget(commands, "pixi")).toEqual([commands[1], commands[2]]);
    expect(selectRuntimeCommandsForTarget(commands, "ui")).toEqual([]);
    expect(selectRuntimeCommandsForTarget(commands, "debug")).toEqual([commands[0]]);
  });

  it("routes uncased commands through category fallback", () => {
    const commands: RuntimeCommand[] = [
      runtimeCommand("bgm", "media", { bgmPath: "bgm:investigation" }, "naninovel", "stubbed"),
      runtimeCommand("toast", "ui", { text: "Debug" }, "naninovel", "stubbed"),
      runtimeCommand("lock", "state", { id: "door" }, "naninovel", "stubbed")
    ];

    expect(selectRuntimeCommandsForTarget(commands, "media")).toEqual([commands[0]]);
    expect(selectRuntimeCommandsForTarget(commands, "ui")).toEqual([commands[1]]);
    expect(selectRuntimeCommandsForTarget(commands, "app")).toEqual([commands[2]]);
  });

  it("routes wildcard commands by wildcardType with routeKey overrides", () => {
    const command = runtimeCommand(
      "wildcard-effect",
      "effect",
      {
        wildcardType: "effect",
        routeKey: "ui:shake-debug",
        intensity: 0.8
      },
      "wildcard"
    );
    const routeTable: VnOutputRouteTable = {
      ...defaultVnOutputRouteTable,
      wildcards: {
        ...defaultVnOutputRouteTable.wildcards,
        effect: {
          defaultTargets: ["pixi"],
          routeKeys: {
            "ui:shake-debug": ["ui", "debug"]
          }
        }
      }
    };

    expect(routeRuntimeCommand(command, routeTable)).toEqual(["ui", "debug"]);
    expect(selectRuntimeCommandsForTarget([command], "ui", routeTable)).toEqual([command]);
    expect(
      routeRuntimeCommand(
        {
          ...command,
          params: {
            ...command.params,
            routeKey: "pixi:burst"
          }
        },
        routeTable
      )
    ).toEqual(["pixi"]);
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
