import { ContentManifestSchema, type ContentManifestInput } from "@v-ronpa/contracts";

export const gameAVnScriptPath = "game-a/opening.nani";

export const gameAVnEntry = {
  id: "vn:game-a-opening",
  title: "Game A Opening",
  scriptPath: gameAVnScriptPath,
  startLabel: "Start",
  profile: "vn2d" as const,
  assetRefs: [{ id: "bg:game-a-room", kind: "background" as const, tags: ["game-a", "vn"] }]
};

export const gameAScript = `#Start
@showUI dialog
@showUI commandBar visible:true
@back bg:game-a-room effect:fade time:0.12
Narrator: Game A VN framework smoke。这个入口只组装 VN-first 的 app 基建，不连接 Trial 或 3D。
Mira: 第一层验证是 DOM 对话框、Pixi 背景和命令栏同时工作。[>]
@choice "继续调查" goto:#Investigate
@choice "检查设置与存档" goto:#SaveLoad

#Investigate
@set route:"investigate"
Narrator: 你记录了房间里的异常光线。AUTO 与 SKIP 会在这里继续使用同一套 story-play 调度。
Mira: 如果这里可以继续推进，game-a 已经拥有后续视觉小说开发的最小框架。
@choice "回到标题" goto:#End

#SaveLoad
@set route:"save-load"
Narrator: 这条分支用于验证 SAVE、LOAD、Backlog 和 Settings overlays 来自 VN shell glue，而不是 harness。
Mira: 存档只保存 StoryRuntimeSnapshot 与 PixiStageSnapshot，不保存 reveal 或音频门控。
@choice "结束本轮" goto:#End

#End
Narrator: Game A VN smoke 完成。
@end`;

const gameAContentManifestInput = {
  version: 2,
  assets: [],
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
