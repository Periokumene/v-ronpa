import { describe, expect, it } from "vitest";
import {
  CameraRigDefSchema,
  ContentManifestSchema,
  InputBindingMapSchema,
  NaviRuntimeStateSchema,
  PresentationCommandSchema,
  RuntimeAssetSchema,
  SaveDataSchema,
  StoryEffectSchema,
  TrialDefinitionSchema,
  TrialRuntimeStateSchema
} from "./index";

describe("contracts", () => {
  it("validates the baseline content manifest", () => {
    const manifest = ContentManifestSchema.parse({
      version: 1,
      assets: [
        { id: "portrait:hero:neutral", kind: "portrait", uri: "/assets/hero.png", tags: ["placeholder"] }
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
              action: { type: "grant-item", itemId: "evidence:keycard", quantity: 1 }
            }
          ]
        }
      ],
      items: [
        {
          id: "evidence:keycard",
          name: "Keycard",
          category: "evidence",
          description: "A redacted access card.",
          tags: ["case-01"]
        }
      ],
      trials: []
    });

    expect(manifest.maps[0]?.interactables[0]?.action.type).toBe("grant-item");
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
        inputLock: "dialog"
      })
    ).toMatchObject({ substate: "vn2d-overlay", inputLock: "dialog" });

    expect(
      TrialRuntimeStateSchema.parse({
        trialId: "trial:case-01",
        currentSegmentId: "debate:door",
        presentation: "debate3d",
        inputLock: "trial-targeting"
      })
    ).toMatchObject({ presentation: "debate3d", keywordStates: {} });
  });

  it("validates input, camera, and runtime asset contracts independently", () => {
    expect(
      InputBindingMapSchema.parse({
        version: 1,
        bindings: [{ action: "interact", device: "keyboard", code: "KeyE", context: "navi" }]
      })
    ).toMatchObject({ bindings: [{ action: "interact" }] });

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
      inventory: { items: { "evidence:keycard": 1 } },
      evidence: { availableEvidenceIds: ["evidence:keycard"] },
      characters: {}
    });

    expect(save.version).toBe(1);
  });
});
