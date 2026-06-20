import { describe, expect, it } from "vitest";
import type { PresentationCommand, StoryEffect } from "@v-ronpa/contracts";
import {
  defaultVnOutputRouteTable,
  routePresentationCommand,
  routeStoryEffect,
  selectEffectsForTarget,
  selectPresentationCommandsForTarget,
  type VnOutputRouteTable
} from "./vnOutputRoutes";

describe("VN output routes", () => {
  it("supports one-to-many fixed route targets", () => {
    const command: PresentationCommand = { type: "print", text: "Line", autoNext: false };
    const routeTable: VnOutputRouteTable = {
      ...defaultVnOutputRouteTable,
      presentationCommands: {
        ...defaultVnOutputRouteTable.presentationCommands,
        print: ["ui", "debug"]
      }
    };

    expect(routePresentationCommand(command, routeTable)).toEqual(["ui", "debug"]);
  });

  it("routes selected presentation commands by target", () => {
    const commands: PresentationCommand[] = [
      { type: "print", text: "Line", autoNext: false },
      { type: "set-background", backgroundId: "bg:harness" },
      { type: "char-enter", characterId: "character:felix", slot: "center", effect: "fadeIn" }
    ];

    expect(selectPresentationCommandsForTarget(commands, "pixi")).toEqual([commands[1], commands[2]]);
    expect(selectPresentationCommandsForTarget(commands, "ui")).toEqual([commands[0]]);
  });

  it("routes non-presentation effects from the incremental effect stream", () => {
    const effects: StoryEffect[] = [
      { type: "gameplay-event", event: { type: "grant-evidence", evidenceId: "evidence:keycard" } },
      { type: "media-event", eventType: "play-bgm", assetId: "bgm:investigation" },
      { type: "navi-event", eventType: "close-overlay" }
    ];

    expect(selectEffectsForTarget(effects, "gameplay")).toEqual([effects[0]]);
    expect(selectEffectsForTarget(effects, "media")).toEqual([effects[1]]);
    expect(selectEffectsForTarget(effects, "navi")).toEqual([effects[2]]);
  });

  it("keeps presentation effects out of Pixi execution to avoid duplicate presentation playback", () => {
    const effect: StoryEffect = {
      type: "presentation",
      command: { type: "flash", color: "#ffffff", durationMs: 160 }
    };

    expect(routeStoryEffect(effect)).toEqual(["debug"]);
    expect(selectEffectsForTarget([effect], "pixi")).toEqual([]);
    expect(selectEffectsForTarget([effect], "debug")).toEqual([effect]);
  });

  it("routes wildcard effects by wildcardType with routeKey overrides", () => {
    const effect: StoryEffect = {
      type: "wildcard-event",
      wildcardType: "effect",
      routeKey: "ui:shake-debug",
      params: { intensity: 0.8 },
      sourceCommand: { commandId: "wildcard-effect", canonicalName: "wildcard-effect" }
    };
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

    expect(routeStoryEffect(effect, routeTable)).toEqual(["ui", "debug"]);
    expect(selectEffectsForTarget([effect], "ui", routeTable)).toEqual([effect]);
    expect(
      routeStoryEffect(
        {
          ...effect,
          routeKey: "pixi:burst"
        },
        routeTable
      )
    ).toEqual(["pixi"]);
  });
});
