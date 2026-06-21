import type { NaniCommandCategory, RuntimeCommand } from "@v-ronpa/contracts";

export type VnRuntimeProfile = "vn2d" | "vn3d";

export type VnOutputRouteTarget = "ui" | "pixi" | "r3f" | "gameplay" | "media" | "navi" | "trial" | "wildcard" | "debug" | "app";

export interface VnWildcardRouteConfig {
  defaultTargets: VnOutputRouteTarget[];
  routeKeys?: Record<string, VnOutputRouteTarget[]>;
}

export interface VnOutputRouteTable {
  commands: Partial<Record<string, VnOutputRouteTarget[]>>;
  categories: Partial<Record<NaniCommandCategory, VnOutputRouteTarget[]>>;
  wildcards: Partial<Record<string, VnWildcardRouteConfig>>;
}

export interface VnOutputRouteContext {
  profile?: VnRuntimeProfile;
}

export const defaultVnOutputRouteTable: VnOutputRouteTable = {
  commands: {
    print: ["debug"],
    back: ["pixi"],
    charenter: ["pixi"],
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
  },
  wildcards: {
    text: { defaultTargets: ["ui"] },
    choice: { defaultTargets: ["ui"] },
    flow: { defaultTargets: ["app"] },
    state: { defaultTargets: ["app"] },
    actor: { defaultTargets: ["pixi"] },
    scene: { defaultTargets: ["pixi"] },
    effect: { defaultTargets: ["pixi"] },
    media: { defaultTargets: ["media"] },
    ui: { defaultTargets: ["ui"] }
  }
};

export function routeRuntimeCommand(
  command: RuntimeCommand,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): VnOutputRouteTarget[] {
  void context;
  if (command.source === "wildcard") return routeWildcardCommand(command, routeTable, context);
  return routeTable.commands[command.commandId] ?? routeTable.categories[command.category] ?? ["debug"];
}

export function routeWildcardCommand(
  command: RuntimeCommand,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): VnOutputRouteTarget[] {
  void context;
  const wildcardType = stringParam(command, "wildcardType") ?? command.commandId.slice("wildcard-".length);
  const routeKey = stringParam(command, "routeKey");
  const config = routeTable.wildcards[wildcardType];
  return (routeKey ? config?.routeKeys?.[routeKey] : undefined) ?? config?.defaultTargets ?? ["wildcard"];
}

export function selectRuntimeCommandsForTarget(
  commands: RuntimeCommand[],
  target: VnOutputRouteTarget,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): RuntimeCommand[] {
  return commands.filter((command) => routeRuntimeCommand(command, routeTable, context).includes(target));
}

function stringParam(command: RuntimeCommand, key: string): string | undefined {
  const value = command.params[key];
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item) : undefined
    );
    return items.some((item) => item === undefined) ? undefined : items.join(",");
  }
  return undefined;
}
