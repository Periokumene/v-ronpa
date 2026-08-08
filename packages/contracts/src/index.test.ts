import { describe, expect, it } from "vitest";
import {
  AssetDefinitionSchema,
  AssetIdSchema,
  CameraRigDefSchema,
  ContentManifestSchema,
  FontFaceIdSchema,
  GameInteractionContextSchema,
  GameModeSchema,
  GameOverlayKindSchema,
  GamePauseSectionSchema,
  GameUiActionSchema,
  InputBindingMapSchema,
  IdSchema,
  InputActionStateSchema,
  InteractionCapabilitySnapshotSchema,
  LayeredCharacterDefinitionSchema,
  LayeredCharacterLayerRefSchema,
  LayeredCharacterLayerMetadataSchema,
  NaniCommandDefinitionSchema,
  NaniCommandParamAuthoringSchema,
  NaniCommandExecutionSchema,
  NaniCommandStatusSchema,
  NaviInteractionConfirmRequestSchema,
  NaviInteractionSensorReportSchema,
  NaviInteractionViewSchema,
  NaviRuntimeStateSchema,
  PIXI_INNER_BACKGROUND_ID,
  PIXI_MAIN_BACKGROUND_ID,
  PixiPresentationTaskKindSchema,
  PixiStageSnapshotSchema,
  RichTextDocumentSchema,
  RuntimeCommandSchema,
  RuntimeScriptSchema,
  RuntimeTextStageSchema,
  SAVE_BACKLOG_LIMIT,
  SaveDataSchema,
  SaveModeSchema,
  SaveSlotSummarySchema,
  SettingsSnapshotSchema,
  StoryPresentationWaitTaskSchema,
  StoryRuntimeSnapshotSchema,
  StoryRuntimeWaitSchema,
  StoryTextChannelSchema,
  StoryTextStateSchema,
  createDefaultSettingsSnapshot,
  createSaveSlotSummaryFromSaveData,
  createSaveableStorySnapshot,
  TrialDefinitionSchema,
  TrialRuntimeStateSchema,
  VnMediaCheckpointSchema,
  VnUiCheckpointSchema,
  VnUiSurfaceIdSchema,
  getNaniCommandDefinition,
  naniCommandCatalog
} from "./index";

describe("contracts", () => {
  it("keeps App-relative AssetId stricter than general identities", () => {
    expect(AssetIdSchema.parse("bg/home")).toBe("bg/home");
    expect(AssetIdSchema.parse("voice/zh/voice-0001")).toBe("voice/zh/voice-0001");
    for (const value of [
      "bg:home",
      "bg/Home",
      "bg/home.png",
      "/bg/home",
      "https://example.com/bg/home",
      "bg//home",
      "bg/./home",
      "bg/../home"
    ]) {
      expect(AssetIdSchema.safeParse(value).success, value).toBe(false);
    }

    expect(IdSchema.parse("vn:game-a-main")).toBe("vn:game-a-main");
    expect(FontFaceIdSchema.parse("default")).toBe("default");
    expect(FontFaceIdSchema.parse("fusion-pixel-zh-hans")).toBe("fusion-pixel-zh-hans");
    expect(FontFaceIdSchema.safeParse("font:serif").success).toBe(false);
  });

  it("validates runtime text stage bounds", () => {
    expect(RuntimeTextStageSchema.parse({ index: 1, count: 3 })).toEqual({ index: 1, count: 3 });
    expect(() => RuntimeTextStageSchema.parse({ index: 0, count: 1 })).toThrow();
    expect(() => RuntimeTextStageSchema.parse({ index: -1, count: 3 })).toThrow();
    expect(() => RuntimeTextStageSchema.parse({ index: 3, count: 3 })).toThrow();
  });

  it("validates the baseline content manifest", () => {
    const manifest = ContentManifestSchema.parse({
      version: 5,
      assets: [
        { id: "char/ema", uri: "assets/char/ema/character.json", mimeType: "application/json" },
        { id: "thumb/keycard", uri: "assets/thumb/keycard.png", mimeType: "image/png" },
        { id: "bleep/dialogue-default", uri: "assets/bleep/dialogue-default.ogg", mimeType: "audio/ogg" },
        { id: "bleep/dialogue-felix", uri: "assets/bleep/dialogue-felix.ogg", mimeType: "audio/ogg" },
        { id: "font/serif-regular", uri: "assets/font/serif.woff2", mimeType: "font/woff2" },
        { id: "model/academy-hall", uri: "assets/model/academy-hall.glb", mimeType: "model/gltf-binary" }
      ],
      requirements: [{ id: "char/ema", capability: "json" }],
      audio: {
        dialogueBleep: {
          defaultSound: { assetId: "bleep/dialogue-default", gain: 0.45 },
          speakerOverrides: {
            Felix: { assetId: "bleep/dialogue-felix" },
            Narrator: null
          }
        }
      },
      fonts: [{
        id: "serif",
        family: "Serif",
        source: { type: "asset", assetId: "font/serif-regular" },
        weight: "400",
        style: "normal"
      }],
      collisionProxies: [
        {
          id: "collision:academy-hall",
          kind: "navmesh",
          assetId: "model/academy-hall"
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
          requirements: [{ id: "model/academy-hall", capability: "model" }],
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
            iconAssetId: "thumb/keycard",
            thumbnailAssetId: "thumb/keycard",
            accentColor: "#ffe66d"
          },
          tags: ["case-01"]
        }
      ],
      trials: []
    });

    expect(manifest.audio?.dialogueBleep).toMatchObject({
      enabled: true,
      speakerOverrides: {
        Felix: { assetId: "bleep/dialogue-felix", gain: 1 },
        Narrator: null
      }
    });
    expect(manifest.maps[0]?.walkBounds?.min).toEqual([-3, 0, -4]);
    expect(manifest.maps[0]?.interactables[0]?.action.type).toBe("grant-evidence");
    expect(manifest.maps[0]?.interactables[1]?.action.type).toBe("start-trial");
    expect(manifest.maps[0]?.interactables[2]?.action.type).toBe("change-map");
    expect(manifest.evidence[0]?.shortLabel).toBe("Keycard");
    expect(manifest.input?.bindings[1]?.action).toBe("fire-truth-bullet");
    expect(manifest.fonts[0]).toMatchObject({
      id: "serif",
      source: { type: "asset", assetId: "font/serif-regular" }
    });
  });

  it("rejects old content manifest versions and stale uiAssets declarations", () => {
    expect(() => ContentManifestSchema.parse({ version: 2, maps: [], items: [], trials: [] })).toThrow();
    expect(() =>
      ContentManifestSchema.parse({
        version: 3,
        uiAssets: [{ id: "ui:title:bg", role: "title-background", assetId: "texture/title/bg" }],
        maps: [],
        items: [],
        trials: []
      })
    ).toThrow();
  });

  it("validates rich text documents and font runtime assets", () => {
    expect(
      RichTextDocumentSchema.parse({
        text: "Warning",
        runs: [{ start: 0, end: 7, style: { bold: true, color: "#ff5577", fontFaceId: "serif" } }]
      })
    ).toMatchObject({ text: "Warning" });
    expect(() =>
      RichTextDocumentSchema.parse({
        text: "Short",
        runs: [{ start: 0, end: 6, style: { bold: true } }]
      })
    ).toThrow();
    expect(AssetDefinitionSchema.parse({ id: "font/serif-regular", uri: "assets/font/serif.woff2", mimeType: "font/woff2" })).toMatchObject({
      id: "font/serif-regular",
      mimeType: "font/woff2"
    });
  });

  it("keeps rich text snapshots aligned with their plain text fields", () => {
    const loc = { scriptPath: "rich.nani", line: 1, column: 1, raw: "@print" };

    expect(
      RuntimeCommandSchema.parse({
        commandId: "print",
        canonicalName: "print",
        category: "text",
        source: "v-ronpa",
        status: "implemented",
        params: { text: "Warning" },
        richText: { text: "Warning", runs: [{ start: 0, end: 7, style: { bold: true } }] },
        loc
      }).richText?.text
    ).toBe("Warning");
    expect(() =>
      RuntimeCommandSchema.parse({
        commandId: "print",
        canonicalName: "print",
        category: "text",
        source: "v-ronpa",
        status: "implemented",
        params: { text: "Warning" },
        richText: { text: "Mismatch", runs: [] },
        loc
      })
    ).toThrow();
    expect(() =>
      RuntimeCommandSchema.parse({
        commandId: "print",
        canonicalName: "print",
        category: "text",
        source: "v-ronpa",
        status: "implemented",
        params: { text: { type: "expression", source: "speakerLine" } },
        richText: { text: "Expression", runs: [] },
        loc
      })
    ).toThrow();

    expect(
      StoryRuntimeSnapshotSchema.parse({
        currentScriptPath: "rich.nani",
        instructionPointer: 1,
        backlog: [{ speaker: "Felix", text: "Old save stays plain." }],
        pendingChoices: [{ text: "Inspect", richText: { text: "Inspect", runs: [{ start: 0, end: 7, style: { italic: true } }] } }],
        text: {
          current: { channel: "dialog", speaker: "Felix", text: "Line", richText: { text: "Line", runs: [{ start: 0, end: 4, style: { underline: true } }] } }
        }
      }).pendingChoices[0]?.richText?.text
    ).toBe("Inspect");
    expect(() =>
      StoryRuntimeSnapshotSchema.parse({
        currentScriptPath: "rich.nani",
        instructionPointer: 1,
        backlog: [{ text: "Line", richText: { text: "Mismatch", runs: [] } }],
        pendingChoices: [],
        text: { current: { channel: "dialog", text: "Line" } }
      })
    ).toThrow();
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
    const rain = getNaniCommandDefinition("rain");
    expect(rain?.params.map((param) => param.name)).toEqual(["power", "wind", "hue", "tint", "time", "easing", "wait"]);

    const snapshot = PixiStageSnapshotSchema.parse({
      version: 6,
      revision: 3,
      backgroundsById: {
        [PIXI_MAIN_BACKGROUND_ID]: {
          id: PIXI_MAIN_BACKGROUND_ID,
          kind: "background",
          appearance: "bg/harness"
        }
      },
      charactersById: {
        Ema: {
          id: "Ema",
          kind: "character",
          appearanceExpression: "Pensive1,ArmR3",
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
      actorOrder: [PIXI_MAIN_BACKGROUND_ID, "Ema"],
      weather: {
        rain: {
          kind: "rain",
          commandParams: { power: 0.5, wind: -0.25, hue: 205, tint: 0.7 },
          transition: { durationMs: 400 }
        }
      },
      screenFilters: {
        bokeh: {
          focus: "Ema",
          dist: 0.3,
          power: 0.75,
          transition: { durationMs: 200 }
        }
      }
    });

    expect(snapshot).toMatchObject({
      version: 6,
      revision: 3,
      backgroundsById: {
        [PIXI_MAIN_BACKGROUND_ID]: {
          id: PIXI_MAIN_BACKGROUND_ID,
          kind: "background",
          appearance: "bg/harness",
          visible: true,
          alpha: 1,
          z: 0
        }
      },
      innerBackgroundsById: {},
      charactersById: {
        Ema: {
          id: "Ema",
          kind: "character",
          appearanceExpression: "Pensive1,ArmR3",
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
      actorOrder: [PIXI_MAIN_BACKGROUND_ID, "Ema"],
      weather: {
        rain: {
          kind: "rain",
          commandParams: { power: 0.5, wind: -0.25, hue: 205, tint: 0.7 },
          transition: { durationMs: 400, lazy: false, wait: false }
        }
      },
      screenFilters: {
        bokeh: {
          focus: "Ema",
          dist: 0.3,
          power: 0.75,
          transition: { durationMs: 200, lazy: false, wait: false }
        }
      }
    });
    expect(snapshot).not.toHaveProperty("commands");
    expect(snapshot).not.toHaveProperty("displayObjects");
    expect(snapshot).not.toHaveProperty("background");
    expect(snapshot).not.toHaveProperty("slots");
    expect(() =>
      PixiStageSnapshotSchema.parse({
        version: 4,
        revision: 0,
        backgroundsById: {},
        charactersById: {},
        actorOrder: [],
        weather: {},
        screenFilters: {}
      })
    ).toThrow();
    expect(
      PixiStageSnapshotSchema.parse({
        version: 6,
        innerBackgroundsById: {
          [PIXI_INNER_BACKGROUND_ID]: {
            id: PIXI_INNER_BACKGROUND_ID,
            kind: "background",
            appearance: "bg/framed"
          }
        }
      }).innerBackgroundsById[PIXI_INNER_BACKGROUND_ID]
    ).toMatchObject({
      id: PIXI_INNER_BACKGROUND_ID,
      kind: "background",
      appearance: "bg/framed",
      visible: true,
      alpha: 1,
      z: 0
    });
    expect(() =>
      PixiStageSnapshotSchema.parse({
        version: 6,
        innerBackgroundsById: {
          [PIXI_INNER_BACKGROUND_ID]: {
            id: PIXI_INNER_BACKGROUND_ID,
            kind: "character",
            appearanceExpression: "Pensive1"
          }
        }
      })
    ).toThrow();
    expect(() =>
      PixiStageSnapshotSchema.parse({
        version: 6,
        slots: { left: { slot: "right", characterId: "character:mira" } }
      })
    ).toThrow();
    expect(() =>
      PixiStageSnapshotSchema.parse({
        version: 6,
        charactersById: {
          Ema: {
            id: "Ema",
            kind: "character",
            appearance: "portrait:ema:neutral"
          }
        }
      })
    ).toThrow();
  });

  it("validates the optional script-scoped character tone without changing snapshot v6", () => {
    const command = getNaniCommandDefinition("charTone");
    expect(command).toMatchObject({
      id: "chartone",
      canonicalName: "charTone",
      primaryParam: "preset",
      source: "v-ronpa",
      status: "implemented"
    });
    expect(command?.params.map((param) => param.name)).toEqual(["preset", "amount", "time", "wait"]);
    expect(command?.params.some((param) => param.name === "easing")).toBe(false);

    const snapshot = PixiStageSnapshotSchema.parse({
      version: 6,
      characterTone: {
        preset: "rain",
        amount: 3.25,
        scopeScriptPath: "game-a/opening.nani",
        transition: { durationMs: 400, wait: true }
      }
    });
    expect(snapshot).toMatchObject({
      version: 6,
      characterTone: {
        preset: "rain",
        amount: 3.25,
        scopeScriptPath: "game-a/opening.nani",
        transition: { durationMs: 400, wait: true }
      }
    });
    expect(StoryPresentationWaitTaskSchema.parse({
      kind: "character-tone-transition",
      target: "character-tone",
      revision: 1
    })).toEqual({
      kind: "character-tone-transition",
      target: "character-tone",
      revision: 1
    });
    expect(() =>
      PixiStageSnapshotSchema.parse({
        version: 6,
        characterTone: {
          preset: "unknown",
          amount: 1,
          scopeScriptPath: "game-a/opening.nani",
          transition: { durationMs: 0, wait: false }
        }
      })
    ).toThrow();
    expect(() =>
      PixiStageSnapshotSchema.parse({
        version: 6,
        characterTone: {
          preset: "rain",
          amount: -1,
          scopeScriptPath: "game-a/opening.nani",
          transition: { durationMs: 0, wait: false }
        }
      })
    ).toThrow();
    expect(() =>
      NaniCommandDefinitionSchema.parse({
        ...command,
        primaryParam: "missing"
      })
    ).toThrow(/Primary parameter/u);
  });

  it("declares shader snow controls and validates their Pixi weather snapshot fields", () => {
    const snow = getNaniCommandDefinition("snow");
    expect(snow?.params.map((param) => param.name)).toEqual(
      expect.arrayContaining(["xSpeed", "ySpeed", "density", "flakeScale", "sway", "fog", "noise", "seed"])
    );

    const snapshot = PixiStageSnapshotSchema.parse({
      version: 6,
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
        version: 6,
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
      version: 6,
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
      AssetDefinitionSchema.parse({
        id: "char/ema-atlas",
        uri: "assets/char/ema/atlas.webp",
        mimeType: "image/webp"
      })
    ).toMatchObject({ id: "char/ema-atlas", mimeType: "image/webp" });
  });

  it("validates layered character metadata color ranges", () => {
    const metadata = {
      sourcePath: "Ema/Body",
      drawOrder: 10,
      sprite: { pivot: { x: 0.5, y: 0.5 }, pixelsPerUnit: 100 },
      localTransform: {
        position: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0 }
      },
      renderer: { color: { r: 1, g: 0.5, b: 0, a: 0.75 }, flipX: false, flipY: false }
    };

    expect(LayeredCharacterLayerMetadataSchema.parse(metadata).renderer.color.a).toBe(0.75);
    expect(() =>
      LayeredCharacterLayerMetadataSchema.parse({
        ...metadata,
        renderer: { ...metadata.renderer, color: { ...metadata.renderer.color, a: 1.2 } }
      })
    ).toThrow();
    expect(() =>
      LayeredCharacterLayerMetadataSchema.parse({
        ...metadata,
        sprite: { ...metadata.sprite, pixelsPerUnit: 0 }
      })
    ).toThrow();
    expect(() =>
      LayeredCharacterLayerMetadataSchema.parse({
        ...metadata,
        sprite: { ...metadata.sprite, pixelsPerUnit: Number.POSITIVE_INFINITY }
      })
    ).toThrow();
    expect(() =>
      LayeredCharacterLayerMetadataSchema.parse({
        ...metadata,
        renderer: { ...metadata.renderer, size: { x: 1, y: 2 } }
      })
    ).toThrow();
  });

  it("validates layered character pack-relative paths and render anchors", () => {
    expect(
      LayeredCharacterLayerRefSchema.parse({
        src: "assets/layers/Body.png",
        metadata: "assets/layers/Body.json"
      })
    ).toMatchObject({ src: "assets/layers/Body.png" });
    expect(() =>
      LayeredCharacterLayerRefSchema.parse({
        src: "https://assets.test/Body.png",
        metadata: "assets/layers/Body.json"
      })
    ).toThrow();
    expect(() =>
      LayeredCharacterLayerRefSchema.parse({
        src: "../shared/Body.png",
        metadata: "assets/layers/Body.json"
      })
    ).toThrow();
    expect(
      LayeredCharacterDefinitionSchema.parse({
        id: "Ema",
        defaultComposition: ["Default"],
        renderSpace: { stageScale: 1, characterAnchor: [0, 0] }
      }).renderSpace.characterAnchor
    ).toEqual([0, 0]);
    expect(() =>
      LayeredCharacterDefinitionSchema.parse({
        id: "Ema",
        defaultComposition: ["Default"],
        renderSpace: { stageScale: 1, defaultBounds: { min: [2, 0], max: [1, 4] } }
      })
    ).toThrow();
    expect(() =>
      LayeredCharacterDefinitionSchema.parse({
        id: "Ema",
        defaultComposition: ["Default"],
        renderSpace: { stageScale: 1, characterAnchor: [0, Number.POSITIVE_INFINITY] }
      })
    ).toThrow();
    expect(() =>
      LayeredCharacterDefinitionSchema.parse({
        id: "Ema",
        defaultComposition: ["Default"],
        renderSpace: { stageScale: Number.POSITIVE_INFINITY, characterAnchor: [0, 0] }
      })
    ).toThrow();
    expect(() =>
      LayeredCharacterDefinitionSchema.parse({
        id: "Ema",
        defaultComposition: ["Default"],
        renderSpace: { stageScale: 1 }
      })
    ).toThrow();
  });

  it("validates game interaction shell contracts", () => {
    expect(GameModeSchema.parse("title")).toBe("title");
    expect(GameOverlayKindSchema.parse("title-load")).toBe("title-load");
    expect(GamePauseSectionSchema.parse("save")).toBe("save");
    expect(() => GameOverlayKindSchema.parse("vn-save")).toThrow();
    expect(() => GameOverlayKindSchema.parse("pause-menu")).toThrow();
    expect(GameUiActionSchema.parse("open-backlog")).toBe("open-backlog");
    expect(GameUiActionSchema.parse("quick-save")).toBe("quick-save");
    expect(GameUiActionSchema.parse("quick-load")).toBe("quick-load");
    expect(() => GameUiActionSchema.parse("back")).toThrow();

    expect(
      GameInteractionContextSchema.parse({
        mode: "navi",
        pauseSection: "backlog",
        naviSubstate: "vn2d-overlay",
        inputLock: "dialog",
        hasActiveStory: true,
        storyHasChoices: false,
        isAtStableStop: true
      })
    ).toMatchObject({
      mode: "navi",
      pauseSection: "backlog",
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
      canOpenPause: false
    });
    expect(() => GameInteractionContextSchema.parse({ mode: "vn", overlayStack: ["vn-backlog"] })).toThrow();
    expect(InteractionCapabilitySnapshotSchema.parse({ canBack: true })).not.toHaveProperty("canBack");
    expect(InteractionCapabilitySnapshotSchema.parse({ canQuickSave: true })).not.toHaveProperty("canQuickSave");

    expect(SettingsSnapshotSchema.parse({ version: 3 })).toEqual(createDefaultSettingsSnapshot());
    expect(createDefaultSettingsSnapshot()).toMatchObject({
      version: 3,
      system: { language: "zh-CN", skipAll: false, preferFullscreen: false },
      display: { textSpeed: 0.5, textSize: "medium", fontFaceId: "default" },
      sound: {
        masterVolume: 1,
        bgmVolume: 0.25,
        sfxVolume: 1,
        bleepVolume: 1,
        voiceVolume: 1,
        uiVolume: 0.5,
        muted: false
      },
      automation: { autoSpeed: 0.5, skipSpeed: 0.5 }
    });
    expect(() => SettingsSnapshotSchema.parse({ version: 1 })).toThrow();
    expect(() => SettingsSnapshotSchema.parse({ version: 3, display: { textboxOpacity: 0.75 } })).toThrow();
    expect(() => SettingsSnapshotSchema.parse({ version: 3, placeholder: true })).toThrow();
    expect(() => SettingsSnapshotSchema.parse({ version: 3, sound: { masterVolume: 1.2 } })).toThrow();
    expect(
      SettingsSnapshotSchema.parse({
        version: 3,
        sound: { masterVolume: 0.5, bgmVolume: 0.2, sfxVolume: 0.6, voiceVolume: 0.8, uiVolume: 0.7, muted: false }
      }).sound.bleepVolume
    ).toBe(1);
    expect(AssetDefinitionSchema.parse({ id: "bleep/sample", uri: "assets/bleep/sample.ogg", mimeType: "audio/ogg" })).toMatchObject({
      id: "bleep/sample",
      mimeType: "audio/ogg"
    });

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
    expect(() =>
      SaveSlotSummarySchema.parse({
        id: "slot:vertical:bad",
        label: "Bad Slot",
        savedAt: "2026-06-20T00:00:00.000Z",
        mode: "title"
      })
    ).toThrow();

  });

  it("rejects legacy asset references that carry direct URIs", () => {
    expect(() =>
      RuntimeScriptSchema.parse({
        scriptPath: "story.nani",
        commands: [],
        labels: {},
        assets: [{ id: "bg/harness", kind: "background", uri: "/bg.png" }],
        dependencies: []
      })
    ).toThrow();

    expect(() =>
      ContentManifestSchema.parse({
        version: 4,
        runtimeAssets: [],
        maps: [
          {
            id: "map:harness",
            name: "Harness",
            spawn: [0, 0, 0],
            requirements: [{ id: "model/harness", kind: "glb", uri: "/harness/models/harness.gltf" }]
          }
        ],
        items: [],
        trials: []
      })
    ).toThrow();
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
        current: {
          channel: "cue",
          speaker: "Mira",
          text: "Current line.",
          richText: { text: "Current line.", runs: [{ start: 0, end: 7, style: { bold: true } }] }
        }
      })
    ).toMatchObject({
      printerId: "default",
      visible: true,
      current: {
        channel: "cue",
        speaker: "Mira",
        text: "Current line.",
        richText: { text: "Current line.", runs: [{ start: 0, end: 7, style: { bold: true } }] }
      }
    });

    expect(
      StoryRuntimeSnapshotSchema.parse({
        currentScriptPath: "new.nani",
        instructionPointer: 2,
        runtimeWait: {
          kind: "movie",
          commandId: "movie",
          commandIndex: 1,
          moviePath: "video/validation-intro"
        },
        text: {
          current: { channel: "dialog", text: "Paused on movie." }
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
    expect(naniCommandCatalog).toHaveLength(97);
    expect(naniCommandCatalog.map((command) => command.id)).not.toContain("focus");
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

  it("declares the remaining Pixi effect lab commands and parses their terminal snapshot fields", () => {
    const ids = [
      "impact", "afterimage", "shutter", "flicker", "vignette",
      "staticFilter", "waterVeil", "signalMask", "pulse"
    ];
    for (const id of ids) {
      expect(getNaniCommandDefinition(id)).toMatchObject({ status: "implemented", execution: "pixi-presentation" });
    }
    expect(PixiStageSnapshotSchema.parse({
      version: 6, revision: 3, backgroundsById: {}, innerBackgroundsById: {}, actorOrder: [],
      charactersById: { alice: {
        id: "alice", kind: "character", appearanceExpression: "eye1", visible: true, alpha: 1, z: 0,
        filters: { signalMask: { region: "head", power: 0.7, bands: 0.8, noise: 0.45, chroma: 0.25, speed: 0.6, threshold: 0.5, seed: 1, transition: { durationMs: 350 } } },
        transition: { durationMs: 0 }
      } },
      weather: {},
      screenFilters: {
        vignette: { power: 0.5, radius: 0.62, softness: 0.3, color: "#160a10", breathe: 0.06, grain: 0.03, transition: { durationMs: 0 } },
        pulse: { power: 0.6, rate: 92, origin: [0.5, 0.52], echoes: 3, expansion: 0.035, edge: 0.65, distortion: 0.35, chroma: 0.18, decay: 0.72, color: "#b8d6d8", transition: { durationMs: 0 } }
      }
    })).toMatchObject({ version: 6, revision: 3 });
  });

  it("hard-removes stainBurst and wallSeep from commands, tasks, and terminal weather", () => {
    expect(getNaniCommandDefinition("stainBurst")).toBeUndefined();
    expect(getNaniCommandDefinition("wallSeep")).toBeUndefined();
    expect(PixiPresentationTaskKindSchema.safeParse("stain-burst").success).toBe(false);
    expect(PixiStageSnapshotSchema.safeParse({
      version: 6,
      revision: 0,
      backgroundsById: {},
      innerBackgroundsById: {},
      charactersById: {},
      actorOrder: [],
      weather: {
        "wall-seep": {
          kind: "wall-seep",
          power: 0.5,
          color: "#601a28",
          density: 0.35,
          branch: 0.6,
          speed: 0.08,
          wetness: 0.7,
          seed: 1,
          transition: { durationMs: 0 }
        }
      },
      screenFilters: {}
    }).success).toBe(false);
  });

  it("rejects non-canonical effect colors and non-integer deterministic seeds", () => {
    const base = {
      version: 6, revision: 0, backgroundsById: {}, innerBackgroundsById: {},
      charactersById: {}, actorOrder: [], weather: {}
    } as const;
    expect(PixiStageSnapshotSchema.safeParse({
      ...base,
      screenFilters: {
        vignette: {
          power: 0.5, radius: 0.6, softness: 0.3, color: "darkred", breathe: 0.04, grain: 0.03,
          transition: { durationMs: 0 }
        }
      }
    }).success).toBe(false);
    expect(PixiStageSnapshotSchema.safeParse({
      ...base,
      screenFilters: {
        staticFilter: {
          power: 0.5, density: 0.5, scanline: 0.5, jitter: 0.5, warp: 0.5,
          grainSize: 1, speed: 1, vignette: 0.3, palette: "cold", seed: 1.5,
          transition: { durationMs: 0 }
        }
      }
    }).success).toBe(false);
  });

  it("declares pinp as an opaque, non-blocking UI asset command", () => {
    expect(getNaniCommandDefinition("pinp")).toMatchObject({
      canonicalName: "pinp",
      category: "ui",
      source: "v-ronpa",
      status: "implemented",
      execution: "ui-output",
      primaryParam: "assetId"
    });
    expect(getNaniCommandDefinition("pinp")?.params.map((param) => param.name)).toEqual([
      "assetId", "pos", "height", "ratio", "alt", "effect", "time", "visible"
    ]);
  });

  it("exposes non-loading media selectors as authoring-only asset references", () => {
    expect(NaniCommandParamAuthoringSchema.parse({
      assetReference: {
        capability: "audio",
        resolution: "asset-id",
        runtimeParam: "bgmPath",
        role: "selector"
      }
    })).toEqual({
      assetReference: {
        capability: "audio",
        resolution: "asset-id",
        runtimeParam: "bgmPath",
        role: "selector"
      }
    });
    expect(() => NaniCommandParamAuthoringSchema.parse({
      assetReference: {
        capability: "audio",
        resolution: "asset-id",
        runtimeParam: "bgmPath",
        role: "selector",
        requirement: true
      }
    })).toThrow();

    const stopBgmPath = getNaniCommandDefinition("stopBgm")?.params.find((param) => param.name === "bgmPath");
    const stopSfxPath = getNaniCommandDefinition("stopSfx")?.params.find((param) => param.name === "sfxPath");
    expect(stopBgmPath?.resource).toBeUndefined();
    expect(stopBgmPath).toMatchObject({
      authoring: {
        assetReference: {
          capability: "audio",
          resolution: "asset-id",
          runtimeParam: "bgmPath",
          role: "selector"
        }
      }
    });
    expect(stopSfxPath?.resource).toBeUndefined();
    expect(stopSfxPath).toMatchObject({
      authoring: {
        assetReference: {
          capability: "audio",
          resolution: "asset-id",
          runtimeParam: "sfxPath",
          role: "selector"
        }
      }
    });

    expect(naniCommandCatalog.flatMap((command) => command.params.flatMap((param) =>
      param.authoring ? [`${command.id}.${param.name}`] : []
    ))).toEqual(["stopbgm.bgmPath", "stopsfx.sfxPath"]);

    expect(naniCommandCatalog.flatMap((command) => command.params.flatMap((param) =>
      param.resource ? [`${command.id}.${param.name}`] : []
    ))).toEqual([
      "back.appearanceAndTransition",
      "bgm.bgmPath",
      "char.idAndAppearance",
      "movie.moviePath",
      "sfx.sfxPath",
      "sfxfast.sfxPath",
      "slide.idAndAppearance",
      "inback.appearanceAndTransition",
      "pinp.assetId"
    ]);
  });

  it("preserves official Naninovel parameter type names in metadata", () => {
    expect(getNaniCommandDefinition("back")?.params).toContainEqual(expect.objectContaining({
      name: "time",
      type: "decimal"
    }));
    expect(getNaniCommandDefinition("arrange")?.params).toContainEqual(expect.objectContaining({
      name: "characterPositions",
      type: "named decimal list"
    }));
    expect(getNaniCommandDefinition("format")?.params).toContainEqual(expect.objectContaining({
      name: "templates",
      type: "named string list"
    }));
    expect(NaniCommandStatusSchema.parse("stubbed")).toBe("stubbed");
  });

  it("adds Chinese command and parameter docs for every implemented command", () => {
    const implemented = naniCommandCatalog.filter((command) => command.status === "implemented");

    expect(implemented.length).toBeGreaterThan(0);
    for (const command of implemented) {
      expect(command.docs?.zh, command.id).toBeTruthy();
      for (const paramSpec of command.params) {
        expect(paramSpec.docs?.zh, `${command.id}.${paramSpec.name}`).toBeTruthy();
      }
    }
  });

  it("documents stateful Pixi effect transition semantics in the shared command catalog", () => {
    for (const commandId of ["rain", "snow", "sun", "glitchFilter", "bokeh", "blur"]) {
      const docs = getNaniCommandDefinition(commandId)?.docs;

      expect(docs?.zh, commandId).toContain("time");
      expect(docs?.zh, commandId).toMatch(/插值|淡出/u);
      expect(docs?.examples?.some((example) => example.includes("time:")), commandId).toBe(true);
    }
    expect(getNaniCommandDefinition("glitchFilter")?.docs?.zh).toContain("seed");
    expect(getNaniCommandDefinition("snow")?.docs?.zh).toContain("seed");
  });

  it("marks declared but currently unconsumed implemented params in command docs", () => {
    expect(getNaniCommandDefinition("bgm")?.params.find((paramSpec) => paramSpec.name === "intro")?.docs).toMatchObject({
      runtimeSupport: "declared-not-consumed",
      runtimeNoteZh: expect.stringContaining("暂未消费")
    });
    expect(getNaniCommandDefinition("hideUI")?.params.find((paramSpec) => paramSpec.name === "allowToggle")?.docs).toMatchObject({
      runtimeSupport: "declared-not-consumed",
      runtimeNoteZh: expect.stringContaining("暂未消费")
    });
    expect(getNaniCommandDefinition("hideUI")?.params.find((paramSpec) => paramSpec.name === "wait")?.docs).toMatchObject({
      runtimeSupport: "consumed"
    });
    expect(getNaniCommandDefinition("showUI")?.params.find((paramSpec) => paramSpec.name === "wait")?.docs).toMatchObject({
      runtimeSupport: "consumed"
    });
    expect(getNaniCommandDefinition("bgm")?.params.find((paramSpec) => paramSpec.name === "volume")?.docs).toMatchObject({
      runtimeSupport: "consumed",
      recommendedRange: { min: 0, max: 1 }
    });
    expect(getNaniCommandDefinition("bgm")?.params.find((paramSpec) => paramSpec.name === "loop")?.docs).toMatchObject({
      runtimeSupport: "declared-not-consumed",
      runtimeNoteZh: expect.stringContaining("暂未消费")
    });
  });

  it("marks command execution boundaries for Pixi waits and declared-only Naninovel tracks", () => {
    expect(NaniCommandExecutionSchema.parse("media-output")).toBe("media-output");
    expect(NaniCommandExecutionSchema.parse("ui-output")).toBe("ui-output");
    expect(getNaniCommandDefinition("char")).toMatchObject({
      status: "implemented",
      execution: "pixi-presentation"
    });
    expect(getNaniCommandDefinition("char")?.params.find((paramSpec) => paramSpec.name === "visible")?.docs).toMatchObject({
      defaultValue: true,
      runtimeSupport: "consumed",
      runtimeNoteZh: expect.stringContaining("省略时显示具名角色")
    });
    expect(getNaniCommandDefinition("flash")).toMatchObject({
      source: "v-ronpa",
      execution: "pixi-presentation"
    });
    expect(getNaniCommandDefinition("inback")).toMatchObject({
      canonicalName: "inback",
      category: "scene",
      source: "v-ronpa",
      status: "implemented",
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
    expect(getNaniCommandDefinition("cue")).toMatchObject({
      canonicalName: "cue",
      category: "text",
      source: "v-ronpa",
      status: "implemented",
      execution: "story-control",
      primaryParam: "text"
    });
    expect(getNaniCommandDefinition("cue")?.params.map((param) => param.name)).toEqual([
      "text",
      "author",
      "speed",
      "textId",
      "autoNext"
    ]);
    expect(getNaniCommandDefinition("hideCue")).toMatchObject({
      canonicalName: "hideCue",
      category: "ui",
      source: "v-ronpa",
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
    expect(getNaniCommandDefinition("voice")).toMatchObject({
      status: "stubbed",
      execution: "declared-only"
    });
  });

  it("separates all UI surfaces from the hideUI/showUI runtime group", () => {
    expect(StoryTextChannelSchema.options).toEqual(["dialog", "cue"]);
    expect(VnUiSurfaceIdSchema.options).toEqual(["dialog", "commandBar", "toastLayer", "cue", "pinp"]);
    expect(VnUiCheckpointSchema.parse({ dialog: true, commandBar: true, toastLayer: true, cue: false, pinp: null })).toEqual({
      dialog: true,
      commandBar: true,
      toastLayer: true,
      cue: false,
      pinp: null
    });
    expect(() => VnUiCheckpointSchema.parse({ dialog: true, commandBar: true, toastLayer: true })).toThrow();
    expect(VnUiCheckpointSchema.parse({
      dialog: true,
      commandBar: true,
      toastLayer: true,
      cue: false,
      pinp: {
        assetId: "props/milk-bag",
        alt: "牛奶袋",
        positionPercent: [50, 50],
        heightPercent: 20,
        aspectRatio: [16, 9]
      }
    }).pinp).toMatchObject({ assetId: "props/milk-bag", heightPercent: 20 });
    expect(() => VnUiCheckpointSchema.parse({
      dialog: true,
      commandBar: true,
      toastLayer: true,
      cue: false,
      pinp: {
        assetId: "props/milk-bag",
        alt: "",
        positionPercent: [50, 101],
        heightPercent: 20,
        aspectRatio: [16, 9]
      }
    })).toThrow();
  });

  it("marks migrated V-Ronpa compatibility params without pretending they are official Naninovel params", () => {
    expect(getNaniCommandDefinition("back")?.params).toContainEqual(expect.objectContaining({
      name: "effect",
      type: "string",
      source: "v-ronpa"
    }));
    expect(getNaniCommandDefinition("shake")?.params).toContainEqual(expect.objectContaining({
      name: "intensity",
      type: "decimal",
      source: "v-ronpa"
    }));
    expect(getNaniCommandDefinition("shake")?.params).toContainEqual(expect.objectContaining({
      name: "duration",
      type: "decimal",
      source: "v-ronpa"
    }));
    expect(getNaniCommandDefinition("inback")?.params.map((param) => param.name)).toEqual([
      "appearanceAndTransition",
      "appearance",
      "via",
      "effect",
      "visible",
      "easing",
      "time",
      "wait"
    ]);
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
        dependencies: [{ endpoint: "common.nani" }]
      })
    ).toMatchObject({ scriptPath: "story.nani", commands: [{ commandId: "flash" }] });
  });

  it("validates versioned save data", () => {
    expect(SaveModeSchema.parse("vn")).toBe("vn");
    expect(() => SaveModeSchema.parse("title")).toThrow();
    expect(() =>
      VnMediaCheckpointSchema.parse({
        bgmByGroup: { music: { assetId: "bgm/main", volume: Number.POSITIVE_INFINITY } },
        loopingSfxByKey: {}
      })
    ).toThrow();
    expect(() =>
      VnMediaCheckpointSchema.parse({
        bgmByGroup: {},
        loopingSfxByKey: { "": { assetId: "sfx/rain", volume: 0.3 } }
      })
    ).toThrow();

    const story = {
      currentScriptPath: "opening.nani",
      instructionPointer: 2,
      variables: { route: "objected" },
      backlog: [{ speaker: "Felix", text: "Good." }],
      pendingChoices: [],
      ended: false
    };
    const pixiStage = {
      version: 6 as const,
      revision: 2,
      backgroundsById: {
        [PIXI_MAIN_BACKGROUND_ID]: {
          id: PIXI_MAIN_BACKGROUND_ID,
          kind: "background" as const,
          appearance: "bg/harness"
        }
      },
      charactersById: {
        Ema: {
          id: "Ema",
          kind: "character" as const,
          appearanceExpression: "Pensive1,ArmR3",
          pos: [0.5, 0] as [number, number]
        }
      },
      actorOrder: [PIXI_MAIN_BACKGROUND_ID, "Ema"],
      weather: {},
      screenFilters: {},
      characterTone: {
        preset: "rain" as const,
        amount: 1,
        scopeScriptPath: "opening.nani",
        transition: { durationMs: 400, wait: false }
      }
    };

    const save = SaveDataSchema.parse({
      version: 11,
      gameId: "game:test",
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "navi",
      vn: {
        entryId: "vn:opening",
        script: { scriptPath: "opening.nani", scriptRevision: "sha256:test" },
        story,
        pixiStage,
        media: {
          bgmByGroup: {
            music: { assetId: "bgm/main", volume: 0.4 },
            ambient: { assetId: "bgm/ambient", volume: 0.2 }
          },
          loopingSfxByKey: {
            rain: { assetId: "sfx/rain", volume: 0.3, group: "rain" },
            "sfx/hum": { assetId: "sfx/hum", volume: 0.8 }
          }
        },
        ui: { dialog: true, commandBar: true, toastLayer: true, cue: false, pinp: null }
      },
      navi: { substate: "vn2d-overlay", activeMapId: "map:academy-hall", inputLock: "dialog" },
      trial: null,
      inventory: { items: { "gift:coffee": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"] },
      characters: {}
    });

    expect(save.version).toBe(11);
    expect(save.vn?.media).toEqual({
      bgmByGroup: {
        music: { assetId: "bgm/main", volume: 0.4 },
        ambient: { assetId: "bgm/ambient", volume: 0.2 }
      },
      loopingSfxByKey: {
        rain: { assetId: "sfx/rain", volume: 0.3, group: "rain" },
        "sfx/hum": { assetId: "sfx/hum", volume: 0.8 }
      }
    });
    expect(save.vn?.pixiStage.innerBackgroundsById).toEqual({});
    expect(save.vn?.pixiStage.backgroundsById[PIXI_MAIN_BACKGROUND_ID]?.appearance).toBe("bg/harness");
    expect(save.vn?.pixiStage.charactersById.Ema?.appearanceExpression).toBe("Pensive1,ArmR3");
    expect(save.vn?.pixiStage.characterTone).toMatchObject({
      preset: "rain",
      amount: 1,
      scopeScriptPath: "opening.nani"
    });
    expect(save.navi?.substate).toBe("vn2d-overlay");
    expect(save).not.toHaveProperty("summary");
    expect(save).not.toHaveProperty("story");
    expect(save).not.toHaveProperty("pixiStage");
    expect(createSaveSlotSummaryFromSaveData("slot:contracts:1", "Contracts 1", save)).toEqual({
      id: "slot:contracts:1",
      label: "Contracts 1",
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "navi",
      speaker: "Felix",
      text: "Good."
    });
    const cueSave = SaveDataSchema.parse({
      ...save,
      vn: {
        ...save.vn!,
        story: {
          ...save.vn!.story,
          text: {
            printerId: "default",
            visible: true,
            current: { channel: "cue", speaker: "Narrator", text: "Do not turn around." }
          }
        },
        ui: { ...save.vn!.ui, cue: true }
      }
    });
    expect(createSaveSlotSummaryFromSaveData("slot:cue", "Cue", cueSave)).toMatchObject({
      speaker: "Narrator",
      text: "Do not turn around."
    });
    expect(cueSave.vn?.story.text?.current?.channel).toBe("cue");
    expect(cueSave.vn?.ui.cue).toBe(true);
    expect(() => SaveDataSchema.parse({ ...cueSave, version: 9 })).toThrow();
    expect(() =>
      SaveDataSchema.parse({
        ...save,
        vn: {
          ...save.vn,
          script: { scriptPath: "chapter-02.nani", scriptRevision: "sha256:test" }
        }
      })
    ).toThrow(/scopeScriptPath/u);

    expect(
      SaveDataSchema.parse({
        version: 11,
        gameId: "game:test",
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "vn",
        vn: {
          entryId: "vn:opening",
          script: { scriptPath: "opening.nani", scriptRevision: "sha256:test" },
          story,
          pixiStage,
          media: { bgmByGroup: {}, loopingSfxByKey: {} },
          ui: { dialog: true, commandBar: true, toastLayer: true, cue: false, pinp: null }
        },
        navi: null,
        trial: null,
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      }).mode
    ).toBe("vn");

    expect(() =>
      SaveDataSchema.parse({
        version: 11,
        gameId: "game:test",
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "vn",
        vn: {
          entryId: "vn:opening",
          script: { scriptPath: "opening.nani", scriptRevision: "sha256:test" },
          story,
          pixiStage,
          ui: { dialog: true, commandBar: true, toastLayer: true, cue: false, pinp: null }
        },
        navi: null,
        trial: null,
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      })
    ).toThrow();

    expect(
      SaveDataSchema.parse({
        version: 11,
        gameId: "game:test",
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "navi",
        vn: null,
        navi: { substate: "walk", activeMapId: "map:academy-hall", inputLock: "none" },
        trial: null,
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      }).navi
    ).toMatchObject({ substate: "walk" });
    expect(
      createSaveSlotSummaryFromSaveData(
        "slot:contracts:navi",
        "Contracts Navi",
        SaveDataSchema.parse({
          version: 11,
          gameId: "game:test",
          savedAt: "2026-06-14T00:00:00.000Z",
          mode: "navi",
          vn: null,
          navi: { substate: "walk", activeMapId: "map:academy-hall", inputLock: "none" },
          trial: null,
          inventory: { items: {} },
          evidence: { ownedEvidenceIds: [] },
          characters: {}
        })
      )
    ).toEqual({
      id: "slot:contracts:navi",
      label: "Contracts Navi",
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "navi"
    });

    expect(
      SaveDataSchema.parse({
        version: 11,
        gameId: "game:test",
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "trial",
        vn: {
          entryId: "vn:opening",
          script: { scriptPath: "opening.nani", scriptRevision: "sha256:test" },
          story,
          pixiStage,
          media: { bgmByGroup: {}, loopingSfxByKey: {} },
          ui: { dialog: true, commandBar: true, toastLayer: true, cue: false, pinp: null }
        },
        navi: { substate: "walk", activeMapId: "map:academy-hall", inputLock: "none" },
        trial: { trialId: "trial:case-01", currentSegmentId: "debate:door", presentation: "debate3d" },
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      }).trial
    ).toMatchObject({ keywordStates: {} });
  });

  it("rejects old save and Pixi stage versions", () => {
    expect(() =>
      SaveDataSchema.parse({
        version: 6,
        gameId: "game:test",
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "navi",
        vn: null,
        navi: { substate: "walk", activeMapId: "map:academy-hall", inputLock: "none" },
        trial: null,
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      })
    ).toThrow();
    expect(() =>
      SaveDataSchema.parse({
        version: 4,
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "navi",
        vn: null,
        navi: { substate: "walk" },
        trial: null,
        story: {
          currentScriptPath: "opening.nani",
          instructionPointer: 2,
          variables: {},
          backlog: [],
          pendingChoices: [],
          ended: false
        },
        pixiStage: { version: 6, revision: 0, backgroundsById: {}, innerBackgroundsById: {}, charactersById: {}, actorOrder: [], weather: {}, screenFilters: {} },
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      })
    ).toThrow();
    expect(() =>
      SaveDataSchema.parse({
        version: 6,
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "vn",
        vn: {
          story: {
            currentScriptPath: "opening.nani",
            instructionPointer: 2,
            variables: {},
            backlog: [],
            pendingChoices: [],
            ended: false
          },
          pixiStage: { version: 4, revision: 0, backgroundsById: {}, charactersById: {}, actorOrder: [], weather: {}, screenFilters: {} }
        },
        navi: null,
        trial: null,
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      })
    ).toThrow();
  });

  it("rejects legacy saves with missing sections, mismatched mode sections, or legacy top-level state", () => {
    expect(() =>
      SaveDataSchema.parse({
        version: 6,
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "vn",
        vn: null,
        navi: null,
        trial: null,
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      })
    ).toThrow();
    expect(() =>
      SaveDataSchema.parse({
        version: 6,
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "navi",
        vn: null,
        navi: null,
        trial: null,
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      })
    ).toThrow();
    expect(() =>
      SaveDataSchema.parse({
        version: 6,
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "title",
        vn: null,
        navi: null,
        trial: null,
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      })
    ).toThrow();
    expect(() =>
      SaveDataSchema.parse({
        version: 6,
        savedAt: "2026-06-14T00:00:00.000Z",
        mode: "navi",
        vn: null,
        navi: { substate: "walk" },
        trial: null,
        story: {
          currentScriptPath: "opening.nani",
          instructionPointer: 2,
          variables: {},
          backlog: [],
          pendingChoices: [],
          ended: false
        },
        pixiStage: { version: 6, revision: 0, backgroundsById: {}, innerBackgroundsById: {}, charactersById: {}, actorOrder: [], weather: {}, screenFilters: {} },
        inventory: { items: {} },
        evidence: { ownedEvidenceIds: [] },
        characters: {}
      })
    ).toThrow();
  });

  it("does not persist runtime command streams in save data", () => {
    const save = SaveDataSchema.parse({
      version: 11,
      gameId: "game:test",
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "vn",
      vn: {
        entryId: "vn:opening",
        script: { scriptPath: "opening.nani", scriptRevision: "sha256:test" },
        story: {
          currentScriptPath: "opening.nani",
          instructionPointer: 2,
          variables: {},
          backlog: [],
          pendingChoices: [],
          ended: false,
          emittedRuntimeCommands: []
        },
        pixiStage: { version: 6, revision: 0, backgroundsById: {}, innerBackgroundsById: {}, charactersById: {}, actorOrder: [], weather: {}, screenFilters: {} },
        media: { bgmByGroup: {}, loopingSfxByKey: {} },
        ui: { dialog: true, commandBar: true, toastLayer: true, cue: false, pinp: null }
      },
      navi: null,
      trial: null,
      inventory: { items: {} },
      evidence: { ownedEvidenceIds: [] },
      characters: {}
    });

    expect(save.vn?.story).not.toHaveProperty("emittedRuntimeCommands");
  });

  it("creates saveable story snapshots without mutating runtime backlog", () => {
    const backlog = Array.from({ length: SAVE_BACKLOG_LIMIT + 5 }, (_, index) => ({
      speaker: "Felix",
      text: `Line ${index}`
    }));
    const story = StoryRuntimeSnapshotSchema.parse({
      currentScriptPath: "opening.nani",
      instructionPointer: 2,
      variables: {},
      backlog,
      pendingChoices: [],
      text: { visible: true, current: { channel: "cue", speaker: "Felix", text: "Current line" } },
      ended: false
    });

    const saveable = createSaveableStorySnapshot(story);

    expect(saveable.backlog).toHaveLength(SAVE_BACKLOG_LIMIT);
    expect(saveable.backlog[0]?.text).toBe("Line 5");
    expect(saveable.text?.current?.text).toBe("Current line");
    expect(story.backlog).toHaveLength(SAVE_BACKLOG_LIMIT + 5);
  });
});
