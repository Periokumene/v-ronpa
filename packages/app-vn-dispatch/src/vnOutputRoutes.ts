import { getNaniCommandDefinition, type NaniCommandCategory, type RuntimeCommand } from "@v-ronpa/contracts";

export type VnRuntimeProfile = "vn2d" | "vn3d";

export type VnOutputRouteTarget = "ui" | "pixi" | "r3f" | "gameplay" | "media" | "navi" | "trial" | "debug" | "app";

export interface VnOutputRouteTable {
  commands: Partial<Record<string, VnOutputRouteTarget[]>>;
  categories: Partial<Record<NaniCommandCategory, VnOutputRouteTarget[]>>;
}

export interface VnOutputRouteContext {
  profile?: VnRuntimeProfile;
}

export const defaultVnOutputRouteTable: VnOutputRouteTable = {
  commands: {
    print: ["debug"],
    cue: ["ui", "debug"],
    back: ["pixi"],
    charenter: ["debug"],
    shake: ["pixi"],
    flash: ["pixi"],
    focus: ["pixi"],
    trialkeyword: ["pixi"],
    gameplay: ["gameplay"]
  },
  categories: {
    media: ["media"],
    ui: ["ui"],
    actor: ["pixi"],
    scene: ["pixi"],
    effect: ["pixi"],
    state: ["app"],
    flow: ["app"],
    choice: ["ui"],
    text: ["debug"]
  }
};

export function routeRuntimeCommand(
  command: RuntimeCommand,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): VnOutputRouteTarget[] {
  void context;
  const explicitRoute = routeTable.commands[command.commandId];
  if (explicitRoute) return explicitRoute;

  const definition = getNaniCommandDefinition(command.commandId);
  if (definition) {
    switch (definition.execution) {
      case "pixi-presentation":
        return ["pixi"];
      case "gameplay":
        return ["gameplay"];
      case "media-output":
        return definition.status === "implemented" ? ["media"] : ["debug"];
      case "ui-output":
        return definition.status === "implemented" ? ["ui"] : ["debug"];
      case "story-control":
        return ["app"];
      case "declared-only":
        return ["debug"];
    }
  }

  return routeTable.categories[command.category] ?? ["debug"];
}

export function selectRuntimeCommandsForTarget(
  commands: RuntimeCommand[],
  target: VnOutputRouteTarget,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): RuntimeCommand[] {
  return commands.filter((command) => routeRuntimeCommand(command, routeTable, context).includes(target));
}
