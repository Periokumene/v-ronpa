import { describe, expect, it } from "vitest";
import {
  CameraRigDefSchema,
  ContentManifestSchema,
  InputBindingMapSchema,
  InputActionStateSchema,
  NaniCommandDefinitionSchema,
  NaniCommandStatusSchema,
  NaviInteractionConfirmRequestSchema,
  NaviInteractionSensorReportSchema,
  NaviInteractionViewSchema,
  NaviRuntimeStateSchema,
  PresentationCommandSchema,
  RuntimeAssetSchema,
  SaveDataSchema,
  StoryEffectSchema,
  TrialDefinitionSchema,
  TrialRuntimeStateSchema,
  WildcardStoryEffectSchema,
  getNaniCommandDefinition,
  naniCommandCatalog
} from "./index";

describe("contracts", () => {
  it("validates the baseline content manifest", () => {
    const manifest = ContentManifestSchema.parse({
      version: 1,
      assets: [
        { id: "portrait:hero:neutral", kind: "portrait", uri: "/assets/hero.png", tags: ["placeholder"] },
        {
          id: "texture:evidence:keycard-icon",
          kind: "texture",
          uri: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='14' fill='%23ffe66d'/%3E%3Crect x='18' y='34' width='60' height='28' rx='6' fill='%231f2937'/%3E%3Ccircle cx='31' cy='48' r='5' fill='%23ffffff'/%3E%3C/svg%3E",
          tags: ["placeholder", "evidence"]
        }
      ],
      runtimeAssets: [
        {
          id: "glb:academy-hall",
          kind: "glb",
          sourceUri: "assets/source/academy-hall.glb",
          optimizedUri: "assets/runtime/academy-hall.glb",
          format: "glb",
          compression: ["meshopt"],
          lods: [{ level: 0, uri: "assets/runtime/academy-hall.glb", maxDistance: 25 }],
          collisionProxyIds: ["collision:academy-hall"]
        }
      ],
      collisionProxies: [
        {
          id: "collision:academy-hall",
          kind: "navmesh",
          uri: "assets/runtime/academy-hall.navmesh.glb"
        }
      ],
      input: {
        version: 1,
        bindings: [
          { action: "move-forward", device: "keyboard", code: "KeyW", context: "navi" },
          { action: "fire-truth-bullet", device: "mouse", code: "MouseLeft", context: "trial" }
        ]
      },
      maps: [
        {
          id: "map:academy-hall",
          name: "Academy Hall",
          spawn: [0, 1.7, 3],
          walkBounds: {
            min: [-3, 0, -4],
            max: [3, 2.4, 4]
          },
          cameraRig: {
            id: "camera:navi:first-person",
            mode: "first-person",
            position: [0, 1.7, 3],
            fov: 65
          },
          collisionProxyIds: ["collision:academy-hall"],
          interactables: [
            {
              id: "interactable:case-file",
              label: "Case File",
              position: [1, 1, 0],
              radius: 1,
              action: { type: "grant-evidence", evidenceId: "evidence:keycard" }
            },
            {
              id: "interactable:classroom-door",
              label: "Classroom Door",
              position: [0, 1, -3],
              radius: 1,
              action: {
                type: "change-map",
                mapId: "map:classroom",
                pose: { position: [0, 1.7, 2.5], yaw: 3.14, pitch: 0 }
              }
            }
          ]
        }
      ],
      items: [
        {
          id: "gift:coffee",
          name: "Canned Coffee",
          category: "gift",
          description: "A safe placeholder gift item.",
          tags: ["placeholder"]
        }
      ],
      evidence: [
        {
          id: "evidence:keycard",
          name: "Redacted Keycard",
          shortLabel: "Keycard",
          description: "A redacted access card found near the locked door.",
          details: [
            { label: "Access Level", value: "Dormitory wing" },
            { label: "Condition", value: "Scratched magnetic strip" }
          ],
          visual: {
            iconAssetId: "texture:evidence:keycard-icon",
            thumbnailAssetId: "texture:evidence:keycard-icon",
            accentColor: "#ffe66d"
          },
          tags: ["case-01"]
        }
      ],
      trials: []
    });

    expect(manifest.maps[0]?.walkBounds?.min).toEqual([-3, 0, -4]);
    expect(manifest.maps[0]?.interactables[0]?.action.type).toBe("grant-evidence");
    expect(manifest.maps[0]?.interactables[1]?.action.type).toBe("change-map");
    expect(manifest.evidence[0]?.shortLabel).toBe("Keycard");
    expect(manifest.input?.bindings[1]?.action).toBe("fire-truth-bullet");
  });

  it("validates trial debate branches", () => {
    const trial = TrialDefinitionSchema.parse({
      id: "trial:case-01",
      title: "The Locked Door",
      initialSegmentId: "debate:door",
      segments: [
        {
          kind: "debate",
          id: "debate:door",
          presentation: "debate3d",
          script: "trial/case-01.nani#Door",
          truthBullets: [{ evidenceId: "evidence:keycard", label: "Keycard" }],
          keywords: [{ id: "kw:locked", text: "locked", correctEvidenceId: "evidence:keycard" }],
          onCorrect: "discussion:after-door",
          onMiss: "debate:door",
          onTimeout: "discussion:failure"
        }
      ]
    });

    expect(trial.segments[0]?.kind).toBe("debate");
  });

  it("validates presentation command wire shapes", () => {
    expect(
      PresentationCommandSchema.parse({
        type: "camera-focus",
        targetId: "character:felix",
        framing: "close",
        durationMs: 480
      })
    ).toMatchInlineSnapshot(`
      {
        "durationMs": 480,
        "framing": "close",
        "targetId": "character:felix",
        "type": "camera-focus",
      }
    `);
  });

  it("validates navi and trial runtime states", () => {
    expect(
      NaviRuntimeStateSchema.parse({
        substate: "vn2d-overlay",
        activeMapId: "map:academy-hall",
        playerPose: { position: [0, 1.7, 3], yaw: 1.25 },
        inputLock: "dialog"
      })
    ).toMatchObject({ substate: "vn2d-overlay", playerPose: { pitch: 0 }, inputLock: "dialog" });

    expect(
      TrialRuntimeStateSchema.parse({
        trialId: "trial:case-01",
        currentSegmentId: "debate:door",
        presentation: "debate3d",
        inputLock: "trial-targeting"
      })
    ).toMatchObject({ presentation: "debate3d", keywordStates: {} });
  });

  it("validates Navi interaction authority handoff shapes", () => {
    expect(
      NaviInteractionSensorReportSchema.parse({
        mapId: "map:academy-hall",
        pose: { position: [0, 1.7, -2.5], yaw: 0, pitch: 0 },
        facing: [0, 0, -1]
      })
    ).toMatchObject({
      mapId: "map:academy-hall",
      facing: [0, 0, -1]
    });

    expect(() =>
      NaviInteractionSensorReportSchema.parse({
        mapId: "map:academy-hall",
        pose: { position: [0, 1.7, -2.5], yaw: 0, pitch: 0 },
        suggestedInteractableId: "interactable:classroom-door"
      })
    ).toThrow();

    expect(
      NaviInteractionViewSchema.parse({
        activeInteractableId: "interactable:classroom-door",
        canConfirm: true
      })
    ).toMatchObject({ activeInteractableId: "interactable:classroom-door", canConfirm: true });

    expect(
      NaviInteractionViewSchema.parse({
        canConfirm: false,
        blockedReason: "input-lock"
      })
    ).toMatchInlineSnapshot(`
      {
        "blockedReason": "input-lock",
        "canConfirm": false,
      }
    `);

    expect(
      NaviInteractionConfirmRequestSchema.parse({
        mapId: "map:academy-hall",
        pose: { position: [0, 1.7, -2.5] },
        facing: [0, 0, -1]
      })
    ).toMatchObject({
      mapId: "map:academy-hall",
      pose: { yaw: 0, pitch: 0 },
      facing: [0, 0, -1]
    });

    expect(() =>
      NaviInteractionConfirmRequestSchema.parse({
        mapId: "map:academy-hall",
        candidateId: "interactable:classroom-door"
      })
    ).toThrow();
  });

  it("validates input, camera, and runtime asset contracts independently", () => {
    expect(
      InputBindingMapSchema.parse({
        version: 1,
        bindings: [{ action: "interact", device: "keyboard", code: "KeyE", context: "navi" }]
      })
    ).toMatchObject({ bindings: [{ action: "interact" }] });

    expect(
      InputActionStateSchema.parse({
        version: 1,
        context: "navi",
        down: ["move-forward"],
        events: [{ action: "interact", phase: "pressed", sequence: 2 }],
        sequence: 2
      })
    ).toMatchObject({
      context: "navi",
      down: ["move-forward"],
      events: [{ action: "interact", phase: "pressed", sequence: 2 }],
      sequence: 2
    });

    expect(() =>
      InputActionStateSchema.parse({
        version: 1,
        context: "navi",
        down: ["move-forward"],
        rawCode: "KeyW"
      })
    ).toThrow();

    expect(
      CameraRigDefSchema.parse({
        id: "camera:trial:focus",
        mode: "scripted-focus",
        target: [0, 1.4, 0],
        fov: 48
      })
    ).toMatchObject({ mode: "scripted-focus" });

    expect(
      RuntimeAssetSchema.parse({
        id: "texture:portrait:felix",
        kind: "texture",
        optimizedUri: "/assets/portrait-felix.webp",
        format: "webp",
        compression: ["webp"],
        textureBudget: { maxSizePx: 2048, maxBytes: 1048576 }
      })
    ).toMatchObject({ collisionProxyIds: [], lods: [] });
  });

  it("validates story effects as the script-to-director bridge", () => {
    expect(
      StoryEffectSchema.parse({
        type: "presentation",
        command: { type: "flash", color: "#ffffff", durationMs: 160 }
      })
    ).toMatchObject({ type: "presentation" });

    expect(
      StoryEffectSchema.parse({
        type: "trial-event",
        eventType: "break-keyword",
        payload: { keywordId: "kw:locked", evidenceId: "evidence:keycard" }
      })
    ).toMatchObject({ eventType: "break-keyword" });

    expect(
      StoryEffectSchema.parse({
        type: "gameplay-event",
        event: { type: "grant-evidence", evidenceId: "evidence:keycard" }
      })
    ).toMatchObject({ type: "gameplay-event", event: { type: "grant-evidence" } });
  });

  it("pins the Naninovel command catalog as the command declaration source", () => {
    const officialCommands = naniCommandCatalog.filter((command) => command.source === "naninovel");
    const wildcardCommands = naniCommandCatalog.filter((command) => command.source === "wildcard");

    expect(officialCommands).toHaveLength(77);
    expect(wildcardCommands.map((command) => command.id)).toEqual([
      "wildcard-text",
      "wildcard-choice",
      "wildcard-flow",
      "wildcard-state",
      "wildcard-actor",
      "wildcard-scene",
      "wildcard-effect",
      "wildcard-media",
      "wildcard-ui"
    ]);
    expect(() => NaniCommandDefinitionSchema.array().parse(naniCommandCatalog)).not.toThrow();
  });

  it("keeps canonical command names mapped to lowercase runtime ids", () => {
    expect(getNaniCommandDefinition("addchoice")).toMatchObject({
      canonicalName: "addChoice",
      id: "addchoice",
      source: "naninovel"
    });
    expect(getNaniCommandDefinition("stopBgm")).toMatchObject({
      canonicalName: "stopBgm",
      id: "stopbgm",
      source: "naninovel"
    });
    expect(getNaniCommandDefinition("char-enter")).toMatchObject({
      canonicalName: "charenter",
      id: "charenter",
      source: "v-ronpa"
    });
  });

  it("preserves official Naninovel parameter type names in metadata", () => {
    expect(getNaniCommandDefinition("back")?.params).toContainEqual({
      name: "time",
      type: "decimal"
    });
    expect(getNaniCommandDefinition("arrange")?.params).toContainEqual({
      name: "characterPositions",
      type: "named decimal list"
    });
    expect(getNaniCommandDefinition("format")?.params).toContainEqual({
      name: "templates",
      type: "named string list"
    });
    expect(NaniCommandStatusSchema.parse("stubbed")).toBe("stubbed");
  });

  it("marks migrated V-Ronpa compatibility params without pretending they are official Naninovel params", () => {
    expect(getNaniCommandDefinition("back")?.params).toContainEqual({
      name: "effect",
      type: "string",
      source: "v-ronpa"
    });
    expect(getNaniCommandDefinition("shake")?.params).toContainEqual({
      name: "intensity",
      type: "decimal",
      source: "v-ronpa"
    });
    expect(getNaniCommandDefinition("shake")?.params).toContainEqual({
      name: "duration",
      type: "decimal",
      source: "v-ronpa"
    });
  });

  it("validates wildcard story effects without treating them as presentation commands", () => {
    const effect = WildcardStoryEffectSchema.parse({
      type: "wildcard-event",
      wildcardType: "effect",
      routeKey: "pixi:chromatic-burst",
      params: { intensity: 0.8, wait: true },
      sourceCommand: {
        commandId: "wildcard-effect",
        canonicalName: "wildcard-effect",
        loc: { scriptPath: "story.nani", line: 3, column: 1, raw: "@wildcard-effect routeKey:pixi:chromatic-burst" }
      }
    });

    expect(effect).toMatchObject({ type: "wildcard-event", wildcardType: "effect" });
    expect(StoryEffectSchema.parse(effect)).toMatchObject({ routeKey: "pixi:chromatic-burst" });
    expect(effect).not.toHaveProperty("command");
  });

  it("validates versioned save data", () => {
    const save = SaveDataSchema.parse({
      version: 1,
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "navi",
      navi: { substate: "vn2d-overlay", activeMapId: "map:academy-hall", inputLock: "dialog" },
      story: {
        currentScriptPath: "opening.nani",
        instructionPointer: 2,
        variables: { route: "objected" },
        backlog: [{ speaker: "Felix", text: "Good." }],
        pendingChoices: [],
        ended: false
      },
      inventory: { items: { "gift:coffee": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"] },
      characters: {}
    });

    expect(save.version).toBe(1);
  });
});
