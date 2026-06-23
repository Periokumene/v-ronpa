import type { NaniCommandCategory, RuntimeCommand } from "@v-ronpa/contracts";

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
  return routeTable.commands[command.commandId] ?? routeTable.categories[command.category] ?? ["debug"];
}

export function selectRuntimeCommandsForTarget(
  commands: RuntimeCommand[],
  target: VnOutputRouteTarget,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): RuntimeCommand[] {
  return commands.filter((command) => routeRuntimeCommand(command, routeTable, context).includes(target));
}
