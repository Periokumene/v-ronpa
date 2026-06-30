import { ContentManifestSchema, type ContentManifestInput } from "@v-ronpa/contracts";

export const gameAVnScriptPath = "game-a/opening.nani";

export const gameAVnEntry = {
  id: "vn:game-a-opening",
  title: "Game A Opening",
  scriptPath: gameAVnScriptPath,
  startLabel: "Start",
  profile: "vn2d" as const,
  assetRefs: [
    { id: "bg:game-a-room", kind: "background" as const, tags: ["game-a", "vn"] },
    { id: "bgm:game-a-main", kind: "bgm" as const, tags: ["game-a", "vn"] },
    { id: "sfx:game-a-chime", kind: "sfx" as const, tags: ["game-a", "vn"] },
    { id: "bleep:game-a-dialogue", kind: "bleep" as const, tags: ["game-a", "vn"] },
    { id: "voice:zh:game_a_voice_0001", kind: "voice" as const, tags: ["game-a", "vn"] },
    { id: "video:game-a-intro", kind: "video" as const, tags: ["game-a", "vn"] }
  ]
};

export const gameAScript = `#Start
@showUI dialog
@showUI commandBar visible:true
@back bg:game-a-room effect:fade time:0.12
@bgm bgm:game-a-main group:music volume:0.35 fade:0.1
@sfx sfx:game-a-chime volume:0.5
Narrator: Game A VN framework smoke。这个入口接入共享 VN runtime，不连接 Trial 或 3D。
Mira: 第一层验证是 DOM 对话框、Pixi 背景、BGM、SFX 和命令栏同时工作。[>]
@choice "继续调查" goto:#Investigate
@choice "检查设置与存档" goto:#SaveLoad

#Investigate
@set route:"investigate"
Narrator: 你记录了房间里的异常光线。AUTO 与 SKIP 会在这里继续使用共享 runtime 调度。
Mira: 这句没有 voice 资源，应回退到 game-a 自己的 dialogue bleep。
Mira: 这句带有 textId，应播放 game-a 独立 voice 资源。|#game_a_voice_0001|
@flash color:#ffffff time:0.18 wait!
Narrator: CHECKPOINT GAME-A WAIT - Pixi wait! 已完成，剧情恢复推进。
@movie video:game-a-intro block:true
Narrator: CHECKPOINT GAME-A MOVIE - 阻塞 movie 已结束或跳过，runtimeWait 已清理。
@stopBgm group:music fade:0.1
@choice "回到标题" goto:#End

#SaveLoad
@set route:"save-load"
Narrator: 这条分支用于验证 SAVE、LOAD、Backlog 和 Settings overlays 来自 VN shell glue，而不是 harness。
Mira: 存档只保存 StoryRuntimeSnapshot 与 PixiStageSnapshot，不保存 reveal、voice gate、movie 或音频门控。
@choice "结束本轮" goto:#End

#End
Narrator: Game A VN smoke 完成。
@end`;

const gameAContentManifestInput = {
  version: 2,
  assets: [],
  audio: {
    dialogueBleep: {
      enabled: true,
      defaultSound: { sourceRef: "bleep:game-a-dialogue", gain: 1 },
      speakerOverrides: {}
    }
  },
  fonts: [],
  uiAssets: [],
  interactionStyles: [],
  runtimeAssets: [
    {
      id: "bg:game-a-room",
      kind: "background",
      optimizedUri: "/game-a/backgrounds/vn-room.png",
      format: "png",
      compression: [],
      lods: [],
      collisionProxyIds: [],
      tags: ["game-a", "vn"]
    },
    {
      id: "bgm:game-a-main",
      kind: "bgm",
      optimizedUri: "/game-a/media/bgm/main.ogg",
      format: "ogg",
      compression: [],
      lods: [],
      collisionProxyIds: [],
      tags: ["game-a", "vn"]
    },
    {
      id: "sfx:game-a-chime",
      kind: "sfx",
      optimizedUri: "/game-a/media/sfx/chime.ogg",
      format: "ogg",
      compression: [],
      lods: [],
      collisionProxyIds: [],
      tags: ["game-a", "vn"]
    },
    {
      id: "bleep:game-a-dialogue",
      kind: "bleep",
      optimizedUri: "/game-a/media/bleep/dialogue.ogg",
      format: "ogg",
      compression: [],
      lods: [],
      collisionProxyIds: [],
      tags: ["game-a", "vn"]
    },
    {
      id: "voice:zh:game_a_voice_0001",
      kind: "voice",
      optimizedUri: "/game-a/media/voice/zh/game_a_voice_0001.ogg",
      format: "ogg",
      compression: [],
      lods: [],
      collisionProxyIds: [],
      tags: ["game-a", "vn"]
    },
    {
      id: "video:game-a-intro",
      kind: "video",
      optimizedUri: "/game-a/media/video/intro.mp4",
      format: "mp4",
      compression: [],
      lods: [],
      collisionProxyIds: [],
      tags: ["game-a", "vn"]
    }
  ],
  collisionProxies: [],
  vnEntries: [gameAVnEntry],
  maps: [],
  items: [],
  evidence: [],
  trials: []
} satisfies ContentManifestInput;

export const gameAContentManifest = ContentManifestSchema.parse(gameAContentManifestInput);
