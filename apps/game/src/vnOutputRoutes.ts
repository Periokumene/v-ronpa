import type { NaniWildcardType, PresentationCommand, StoryEffect } from "@v-ronpa/contracts";

export type VnRuntimeProfile = "vn2d" | "vn3d";

export type VnOutputRouteTarget = "ui" | "pixi" | "r3f" | "gameplay" | "media" | "navi" | "trial" | "wildcard" | "debug" | "app";

export interface VnWildcardRouteConfig {
  defaultTargets: VnOutputRouteTarget[];
  routeKeys?: Record<string, VnOutputRouteTarget[]>;
}

export interface VnOutputRouteTable {
  presentationCommands: Partial<Record<PresentationCommand["type"], VnOutputRouteTarget[]>>;
  effects: Partial<Record<StoryEffect["type"], VnOutputRouteTarget[]>>;
  wildcards: Partial<Record<NaniWildcardType, VnWildcardRouteConfig>>;
}

export interface VnOutputRouteContext {
  profile?: VnRuntimeProfile;
}

export const defaultVnOutputRouteTable: VnOutputRouteTable = {
  presentationCommands: {
    print: ["ui"],
    "set-background": ["pixi"],
    "char-enter": ["pixi"],
    shake: ["pixi"],
    flash: ["pixi"],
    focus: ["pixi"],
    "trial-keyword": ["pixi"],
    "trial-subtitle": ["pixi"],
    "camera-focus": ["r3f"],
    "stage-actor": ["r3f"]
  },
  effects: {
    presentation: ["debug"],
    "gameplay-event": ["gameplay"],
    "media-event": ["media"],
    "navi-event": ["navi"],
    "trial-event": ["trial"],
    "wildcard-event": ["wildcard"]
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

export function routePresentationCommand(
  command: PresentationCommand,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): VnOutputRouteTarget[] {
  void context;
  return routeTable.presentationCommands[command.type] ?? ["debug"];
}

export function routeStoryEffect(
  effect: StoryEffect,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): VnOutputRouteTarget[] {
  void context;
  if (effect.type === "wildcard-event") return routeWildcardEffect(effect, routeTable, context);
  return routeTable.effects[effect.type] ?? ["debug"];
}

export function routeWildcardEffect(
  effect: Extract<StoryEffect, { type: "wildcard-event" }>,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): VnOutputRouteTarget[] {
  void context;
  const config = routeTable.wildcards[effect.wildcardType];
  return config?.routeKeys?.[effect.routeKey] ?? config?.defaultTargets ?? ["wildcard"];
}

export function selectPresentationCommandsForTarget(
  commands: PresentationCommand[],
  target: VnOutputRouteTarget,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): PresentationCommand[] {
  return commands.filter((command) => routePresentationCommand(command, routeTable, context).includes(target));
}

export function selectEffectsForTarget(
  effects: StoryEffect[],
  target: VnOutputRouteTarget,
  routeTable: VnOutputRouteTable = defaultVnOutputRouteTable,
  context: VnOutputRouteContext = {}
): StoryEffect[] {
  return effects.filter((effect) => routeStoryEffect(effect, routeTable, context).includes(target));
}

export function selectNewStoryEffects(previousEffectsLength: number, effects: StoryEffect[]): StoryEffect[] {
  return effects.slice(Math.max(0, previousEffectsLength));
}
