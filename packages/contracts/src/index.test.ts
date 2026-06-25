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
  NaniCommandExecutionSchema,
  NaniCommandStatusSchema,
  NaviInteractionConfirmRequestSchema,
  NaviInteractionSensorReportSchema,
  NaviInteractionViewSchema,
  NaviRuntimeStateSchema,
  PixiStageSnapshotSchema,
  RuntimeAssetSchema,
  RuntimeCommandSchema,
  RuntimeScriptSchema,
  SaveDataSchema,
  SaveSlotSummarySchema,
  SettingsSnapshotSchema,
  StoryRuntimeSnapshotSchema,
  StoryRuntimeWaitSchema,
  StoryTextStateSchema,
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

  it("validates Pixi stage snapshots without command history or renderer runtime", () => {
    const snapshot = PixiStageSnapshotSchema.parse({
      version: 2,
      revision: 3,
      backgroundsById: {
        MainBackground: {
          id: "MainBackground",
          kind: "background",
          appearance: "bg:harness"
        }
      },
      charactersById: {
        "character:felix": {
          id: "character:felix",
          kind: "character",
          appearance: "portrait:felix:neutral",
          pos: [0.5, 0],
          visible: true,
          transition: {
            name: "slide",
            durationMs: 400,
            from: [0.15, 0.5],
            to: [0.5, 0]
          }
        }
      },
      actorOrder: ["MainBackground", "character:felix"],
      weather: {
        rain: {
          kind: "rain",
          power: 0.5,
          transition: { durationMs: 400 }
        }
      },
      screenFilters: {
        bokeh: {
          focus: "character:felix",
          dist: 0.3,
          power: 0.75,
          transition: { durationMs: 200 }
        }
      },
      background: { backgroundId: "bg:harness" },
      slots: {
        center: {
          slot: "center",
          characterId: "character:felix",
          portraitId: "portrait:felix:neutral"
        }
      }
    });

    expect(snapshot).toMatchObject({
      version: 2,
      revision: 3,
      backgroundsById: {
        MainBackground: {
          id: "MainBackground",
          kind: "background",
          appearance: "bg:harness",
          visible: true,
          alpha: 1,
          z: 0
        }
      },
      charactersById: {
        "character:felix": {
          id: "character:felix",
          kind: "character",
          appearance: "portrait:felix:neutral",
          pos: [0.5, 0],
          transition: {
            name: "slide",
            durationMs: 400,
            from: [0.15, 0.5],
            to: [0.5, 0]
          },
          visible: true
        }
      },
      actorOrder: ["MainBackground", "character:felix"],
      weather: {
        rain: {
          kind: "rain",
          power: 0.5,
          transition: { durationMs: 400, lazy: false, wait: false }
        }
      },
      screenFilters: {
        bokeh: {
          focus: "character:felix",
          dist: 0.3,
          power: 0.75,
          transition: { durationMs: 200, lazy: false, wait: false }
        }
      },
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
        version: 2,
        slots: { left: { slot: "right", characterId: "character:mira" } }
      })
    ).toThrow();
  });

  it("declares shader snow controls and validates their Pixi weather snapshot fields", () => {
    const snow = getNaniCommandDefinition("snow");
    expect(snow?.params.map((param) => param.name)).toEqual(
      expect.arrayContaining(["xSpeed", "ySpeed", "density", "flakeScale", "sway", "fog", "noise", "seed"])
    );

    const snapshot = PixiStageSnapshotSchema.parse({
      version: 2,
      weather: {
        snow: {
          kind: "snow",
          power: 0.9,
          xSpeed: -0.35,
          ySpeed: 0.72,
          density: 1.45,
          flakeScale: 1.2,
          sway: 0.85,
          fog: 0.32,
          noise: 0.04,
          seed: 17,
          transition: { durationMs: 250 }
        }
      }
    });

    expect(snapshot.weather.snow).toMatchObject({
      kind: "snow",
      density: 1.45,
      flakeScale: 1.2,
      sway: 0.85,
      fog: 0.32,
      noise: 0.04,
      seed: 17,
      transition: { durationMs: 250, lazy: false, wait: false }
    });
    expect(() =>
      PixiStageSnapshotSchema.parse({
        version: 2,
        weather: { snow: { kind: "snow", density: -1, transition: { durationMs: 0 } } }
      })
    ).toThrow();
  });

  it("declares shader glitch controls without changing RuntimeCommand shape", () => {
    const glitch = getNaniCommandDefinition("glitch");
    expect(glitch?.params.map((param) => param.name)).toEqual(
      expect.arrayContaining(["power", "time", "blockJump", "burstJump", "pixelScatter", "colorNoise", "speed", "seed", "wait"])
    );
    const glitchFilter = getNaniCommandDefinition("glitchFilter");
    expect(glitchFilter?.params.map((param) => param.name)).toEqual(
      expect.arrayContaining(["power", "time", "easing", "blockJump", "burstJump", "pixelScatter", "colorNoise", "speed", "seed", "wait"])
    );

    const snapshot = PixiStageSnapshotSchema.parse({
      version: 2,
      screenFilters: {
        glitch: {
          power: 0.4,
          blockJump: 0.5,
          burstJump: 0.25,
          pixelScatter: 0.75,
          colorNoise: 0.35,
          speed: 0.8,
          seed: 12,
          transition: { durationMs: 300, easing: "linear" }
        }
      }
    });
    expect(snapshot.screenFilters.glitch).toMatchObject({
      power: 0.4,
      blockJump: 0.5,
      burstJump: 0.25,
      pixelScatter: 0.75,
      colorNoise: 0.35,
      speed: 0.8,
      seed: 12,
      transition: { durationMs: 300, easing: "linear", lazy: false, wait: false }
    });

    const command = RuntimeCommandSchema.parse({
      commandId: "glitchfilter",
      canonicalName: "glitchFilter",
      category: "effect",
      source: "v-ronpa",
      status: "implemented",
      params: {
        power: 0.9,
        blockJump: 1.2,
        burstJump: 0.75,
        pixelScatter: 1.5,
        colorNoise: 0.8,
        speed: 1.1,
        seed: 31,
        durationMs: 300,
        wait: true
      },
      loc: { scriptPath: "glitch.nani", line: 1, column: 1, raw: "@glitchFilter" }
    });

    expect(command).toEqual({
      commandId: "glitchfilter",
      canonicalName: "glitchFilter",
      category: "effect",
      source: "v-ronpa",
      status: "implemented",
      params: {
        power: 0.9,
        blockJump: 1.2,
        burstJump: 0.75,
        pixelScatter: 1.5,
        colorNoise: 0.8,
        speed: 1.1,
        seed: 31,
        durationMs: 300,
        wait: true
      },
      loc: { scriptPath: "glitch.nani", line: 1, column: 1, raw: "@glitchFilter" }
    });
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

  it("validates additive story runtime text and runtime wait contracts", () => {
    expect(
      StoryRuntimeSnapshotSchema.parse({
        currentScriptPath: "old.nani",
        instructionPointer: 0,
        backlog: [{ speaker: "Felix", text: "Old snapshot." }],
        pendingChoices: [],
        ended: false
      })
    ).not.toHaveProperty("runtimeWait");

    expect(
      StoryRuntimeWaitSchema.parse({
        kind: "input",
        commandId: "input",
        commandIndex: 4,
        variableName: "playerName",
        summary: "Name?"
      })
    ).toMatchObject({ valueType: "string" });

    expect(
      StoryTextStateSchema.parse({
        current: { speaker: "Mira", text: "Current line.", formatId: "warning" }
      })
    ).toMatchObject({
      printerId: "default",
      visible: true,
      current: { speaker: "Mira", text: "Current line.", formatId: "warning" },
      formats: {}
    });

    expect(
      StoryRuntimeSnapshotSchema.parse({
        currentScriptPath: "new.nani",
        instructionPointer: 2,
        runtimeWait: {
          kind: "movie",
          commandId: "movie",
          commandIndex: 1,
          moviePath: "video:validation-intro"
        },
        text: {
          current: { text: "Paused on movie." }
        }
      })
    ).toMatchObject({
      runtimeWait: { allowSkip: true },
      text: { printerId: "default", visible: true }
    });
  });

  it("pins the Naninovel command catalog as the command declaration source", () => {
    const officialCommands = naniCommandCatalog.filter((command) => command.source === "naninovel");

    expect(officialCommands).toHaveLength(78);
    expect(naniCommandCatalog).toHaveLength(84);
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
      source: "v-ronpa",
      status: "stubbed"
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

  it("marks command execution boundaries for Pixi waits and declared-only Naninovel tracks", () => {
    expect(NaniCommandExecutionSchema.parse("media-output")).toBe("media-output");
    expect(NaniCommandExecutionSchema.parse("ui-output")).toBe("ui-output");
    expect(getNaniCommandDefinition("char")).toMatchObject({
      status: "implemented",
      execution: "pixi-presentation"
    });
    expect(getNaniCommandDefinition("flash")).toMatchObject({
      source: "v-ronpa",
      execution: "pixi-presentation"
    });
    expect(getNaniCommandDefinition("async")).toMatchObject({
      status: "stubbed",
      execution: "declared-only"
    });
    expect(getNaniCommandDefinition("await")).toMatchObject({
      status: "stubbed",
      execution: "declared-only"
    });
    expect(getNaniCommandDefinition("bgm")).toMatchObject({
      status: "implemented",
      execution: "media-output"
    });
    expect(getNaniCommandDefinition("showUI")).toMatchObject({
      status: "implemented",
      execution: "ui-output"
    });
    expect(getNaniCommandDefinition("hideUI")).toMatchObject({
      status: "implemented",
      execution: "ui-output"
    });
    expect(getNaniCommandDefinition("input")).toMatchObject({
      status: "implemented",
      execution: "story-control"
    });
    expect(getNaniCommandDefinition("stopVoice")).toMatchObject({
      status: "stubbed",
      execution: "declared-only"
    });
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
        version: 2,
        revision: 2,
        backgroundsById: {
          MainBackground: {
            id: "MainBackground",
            kind: "background",
            appearance: "bg:harness"
          }
        },
        charactersById: {
          "character:felix": {
            id: "character:felix",
            kind: "character",
            appearance: "portrait:felix:neutral",
            pos: [0.5, 0]
          }
        },
        actorOrder: ["MainBackground", "character:felix"],
        weather: {},
        screenFilters: {},
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
      pixiStage: { version: 2, revision: 0, backgroundsById: {}, charactersById: {}, actorOrder: [], weather: {}, screenFilters: {}, slots: {} },
      inventory: { items: {} },
      evidence: { ownedEvidenceIds: [] },
      characters: {}
    });

    expect(save.story).not.toHaveProperty("emittedRuntimeCommands");
  });
});
