import { describe, expect, it } from "vitest";
import {
  CameraRigDefSchema,
  ContentManifestSchema,
  GameInteractionContextSchema,
  GameModeSchema,
  GameOverlayKindSchema,
  GameUiActionSchema,
  InputBindingMapSchema,
  InputActionStateSchema,
  InteractionCapabilitySnapshotSchema,
  InteractionStyleProfileSchema,
  NaniCommandDefinitionSchema,
  NaniCommandStatusSchema,
  NaviInteractionConfirmRequestSchema,
  NaviInteractionSensorReportSchema,
  NaviInteractionViewSchema,
  NaviRuntimeStateSchema,
  PixiStageSnapshotSchema,
  PresentationCommandSchema,
  RuntimeAssetSchema,
  RuntimeCommandSchema,
  RuntimeScriptSchema,
  SaveDataSchema,
  SaveSlotSummarySchema,
  SettingsSnapshotSchema,
  createDefaultSettingsSnapshot,
  TrialDefinitionSchema,
  TrialRuntimeStateSchema,
  UiAssetRefSchema,
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
      uiAssets: [
        {
          id: "ui:title:bg",
          role: "title-background",
          uri: "/harness/ui/title-bg.webp",
          slice: "stretch",
          tags: ["harness"]
        }
      ],
      interactionStyles: [
        {
          id: "style:harness:vn",
          name: "Harness VN",
          assets: [{ id: "ui:dialog:frame", role: "dialog-frame", assetId: "ui:title:bg", slice: "nine-slice" }],
          tokens: { accentColor: "#ffd166", panelOpacity: 0.82, motionScale: 1 }
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
              id: "interactable:trial-door",
              label: "Trial Door",
              position: [-1, 1, -2],
              radius: 1,
              action: {
                type: "start-trial",
                trialId: "trial:case-01",
                segmentId: "debate:door"
              }
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
    expect(manifest.maps[0]?.interactables[1]?.action.type).toBe("start-trial");
    expect(manifest.maps[0]?.interactables[2]?.action.type).toBe("change-map");
    expect(manifest.evidence[0]?.shortLabel).toBe("Keycard");
    expect(manifest.input?.bindings[1]?.action).toBe("fire-truth-bullet");
    expect(manifest.uiAssets[0]?.role).toBe("title-background");
    expect(manifest.interactionStyles[0]?.assets[0]?.slice).toBe("nine-slice");
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

  it("validates Pixi stage snapshots without command history or renderer runtime", () => {
    const snapshot = PixiStageSnapshotSchema.parse({
      version: 1,
      revision: 3,
      background: { backgroundId: "bg:harness" },
      slots: {
        center: {
          slot: "center",
          characterId: "character:felix",
          portraitId: "portrait:felix:neutral"
        }
      }
    });

    expect(snapshot).toEqual({
      version: 1,
      revision: 3,
      background: { backgroundId: "bg:harness" },
      slots: {
        center: {
          slot: "center",
          characterId: "character:felix",
          portraitId: "portrait:felix:neutral"
        }
      }
    });
    expect(snapshot).not.toHaveProperty("commands");
    expect(snapshot).not.toHaveProperty("displayObjects");
    expect(() =>
      PixiStageSnapshotSchema.parse({
        version: 1,
        slots: { left: { slot: "right", characterId: "character:mira" } }
      })
    ).toThrow();
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

  it("validates game interaction shell contracts", () => {
    expect(GameModeSchema.parse("title")).toBe("title");
    expect(GameOverlayKindSchema.parse("vn-save")).toBe("vn-save");
    expect(GameUiActionSchema.parse("open-backlog")).toBe("open-backlog");
    expect(() => GameUiActionSchema.parse("back")).toThrow();

    expect(
      GameInteractionContextSchema.parse({
        mode: "navi",
        overlayStack: ["vn-backlog"],
        naviSubstate: "vn2d-overlay",
        inputLock: "dialog",
        hasActiveStory: true,
        storyHasChoices: false,
        isAtStableStop: true
      })
    ).toMatchObject({
      mode: "navi",
      overlayStack: ["vn-backlog"],
      hasActiveStory: true,
      storyEnded: false
    });

    expect(
      InteractionCapabilitySnapshotSchema.parse({
        canSave: true,
        canLoad: true,
        canOpenBacklog: true
      })
    ).toMatchObject({
      canSave: true,
      canLoad: true,
      canOpenSettings: true,
      canOpenPauseMenu: false
    });
    expect(InteractionCapabilitySnapshotSchema.parse({ canBack: true })).not.toHaveProperty("canBack");

    expect(SettingsSnapshotSchema.parse({ version: 1 })).toEqual(createDefaultSettingsSnapshot());
    expect(createDefaultSettingsSnapshot()).toMatchObject({
      version: 1,
      system: { language: "zh-CN", skipAll: false, preferFullscreen: false },
      display: { textSpeed: 0.5, textSize: "medium", textboxOpacity: 0.75, fontFamilyId: "font:default" },
      sound: {
        masterVolume: 1,
        bgmVolume: 0.25,
        sfxVolume: 1,
        voiceVolume: 1,
        uiVolume: 0.5,
        muted: false,
        voiceInterruption: "continue"
      },
      automation: { autoSpeed: 0.5, skipSpeed: 0.5 }
    });
    expect(() => SettingsSnapshotSchema.parse({ version: 1, placeholder: true })).toThrow();
    expect(() => SettingsSnapshotSchema.parse({ version: 1, sound: { masterVolume: 1.2 } })).toThrow();

    expect(
      SaveSlotSummarySchema.parse({
        id: "slot:vertical:1",
        label: "Slot 1",
        savedAt: "2026-06-20T00:00:00.000Z",
        mode: "navi",
        speaker: "Felix",
        text: "A saved line."
      })
    ).toMatchObject({ mode: "navi", text: "A saved line." });

    expect(
      UiAssetRefSchema.parse({
        id: "ui:button:frame",
        role: "button-frame",
        assetId: "texture:evidence:keycard-icon",
        slice: "nine-slice"
      })
    ).toMatchObject({ role: "button-frame", tags: [] });

    expect(
      InteractionStyleProfileSchema.parse({
        id: "style:default",
        name: "Default",
        assets: [{ id: "ui:toolbar:icon", role: "toolbar-icon", uri: "/harness/ui/icon.png" }],
        tokens: { accentColor: "#6ee7d8", panelOpacity: 0.9 }
      })
    ).toMatchObject({ assets: [{ role: "toolbar-icon" }], tokens: { accentColor: "#6ee7d8", panelOpacity: 0.9 } });
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

  it("validates runtime commands and runtime scripts as the command dispatch bridge", () => {
    const command = RuntimeCommandSchema.parse({
      commandId: "flash",
      canonicalName: "flash",
      category: "effect",
      source: "v-ronpa",
      status: "implemented",
      params: {
        color: "#ffffff",
        duration: 160,
        enabled: true,
        easing: { type: "expression", source: "$flashEase" },
        stops: [0, 0.5, 1]
      },
      condition: { type: "expression", source: "flashEnabled" },
      loc: { scriptPath: "story.nani", line: 2, column: 1, raw: "@flash color:#ffffff duration:160" },
      sourceCommand: {
        rawCommandId: "flash",
        rawPrimary: undefined,
        rawParams: { color: "#ffffff", duration: 160 },
        rawFlags: {}
      }
    });

    expect(command).toMatchObject({
      commandId: "flash",
      params: { color: "#ffffff", duration: 160 },
      condition: { type: "expression", source: "flashEnabled" }
    });

    expect(
      RuntimeScriptSchema.parse({
        scriptPath: "story.nani",
        commands: [command],
        labels: { Start: 0 },
        assets: [{ id: "bg:harness", kind: "background", uri: "/bg.png" }],
        dependencies: [{ endpoint: "common.nani" }]
      })
    ).toMatchObject({ scriptPath: "story.nani", commands: [{ commandId: "flash" }] });
  });

  it("validates versioned save data", () => {
    const save = SaveDataSchema.parse({
      version: 2,
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
      pixiStage: {
        version: 1,
        revision: 2,
        background: { backgroundId: "bg:harness" },
        slots: {
          center: { slot: "center", characterId: "character:felix", portraitId: "portrait:felix:neutral" }
        }
      },
      inventory: { items: { "gift:coffee": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"] },
      characters: {}
    });

    expect(save.version).toBe(2);
    expect(save.pixiStage.background?.backgroundId).toBe("bg:harness");
    expect(save).not.toHaveProperty("summary");
  });

  it("rejects v2 save data without a Pixi stage snapshot", () => {
    expect(() =>
      SaveDataSchema.parse({
        version: 2,
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "navi",
        story: {
          currentScriptPath: "opening.nani",
          instructionPointer: 2,
          variables: {},
          backlog: [],
          pendingChoices: [],
          ended: false
        },
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      })
    ).toThrow();
  });

  it("does not persist runtime command streams in save data", () => {
    const save = SaveDataSchema.parse({
      version: 2,
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "navi",
      story: {
        currentScriptPath: "opening.nani",
        instructionPointer: 2,
        variables: {},
        backlog: [],
        pendingChoices: [],
        ended: false,
        emittedRuntimeCommands: []
      },
      pixiStage: { version: 1, revision: 0, slots: {} },
      inventory: { items: {} },
      evidence: { ownedEvidenceIds: [] },
      characters: {}
    });

    expect(save.story).not.toHaveProperty("emittedRuntimeCommands");
  });
});
