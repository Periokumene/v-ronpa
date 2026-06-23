import type { EvidenceDef, ItemDef, TrialDefinition, WorldMapDef } from "@v-ronpa/contracts";

export const verticalSliceItem: ItemDef = {
  id: "tool:notebook",
  name: "Investigation Notebook",
  category: "tool",
  description: "A developer-harness notebook used to prove Navi item pickup.",
  tags: ["harness", "vertical-slice"]
};

export const verticalSliceEvidence: EvidenceDef = {
  id: "evidence:keycard",
  name: "Redacted Keycard",
  shortLabel: "Keycard",
  description: "A placeholder evidence object shown in Inspector Lite during the vertical slice.",
  details: [],
  visual: {
    thumbnailAssetId: "texture:evidence:keycard-thumbnail",
    iconAssetId: "texture:evidence:keycard-thumbnail",
    accentColor: "#ffd166"
  },
  tags: ["harness", "vertical-slice"]
};

export const verticalSliceTrial: TrialDefinition = {
  id: "trial:door-lock",
  title: "Door Lock Trial",
  initialSegmentId: "discussion:trial-opening",
  segments: [
    {
      kind: "discussion",
      id: "discussion:trial-opening",
      presentation: "vn3d",
      script: "harness/vertical-slice-trial.nani#Opening",
      nextSegmentId: "debate:door-lock"
    },
    {
      kind: "debate",
      id: "debate:door-lock",
      script: "harness/vertical-slice-trial.nani#DoorLock",
      truthBullets: [{ evidenceId: verticalSliceEvidence.id, label: verticalSliceEvidence.shortLabel }],
      keywords: [
        {
          id: "kw:door-lock",
          text: "门锁声只是普通故障",
          correctEvidenceId: verticalSliceEvidence.id,
          speakerId: "character:ren"
        }
      ],
      onCorrect: "discussion:trial-close",
      onMiss: "debate:door-lock",
      onTimeout: "discussion:trial-close"
    },
    {
      kind: "discussion",
      id: "discussion:trial-close",
      presentation: "vn2d",
      script: "harness/vertical-slice-trial.nani#Close"
    }
  ]
};

export const verticalSliceMaps: WorldMapDef[] = [
  {
    id: "map:academy-hall",
    name: "Academy Hall",
    spawn: [0, 1.7, 4],
    walkBounds: {
      min: [-3.6, 0, -4.2],
      max: [3.6, 2.6, 4.2]
    },
    cameraRig: {
      id: "camera:navi:first-person",
      mode: "first-person",
      position: [0, 1.7, 4],
      fov: 65
    },
    collisionProxyIds: ["collision:academy-hall:aabb"],
    assetRefs: [
      { id: "model:academy-hall", kind: "glb", uri: "/harness/models/academy-hall.gltf", tags: ["harness"] }
    ],
    interactables: [
      {
        id: "interactable:notebook",
        label: "Notebook",
        position: [1.2, 0.9, -0.8],
        radius: 1.1,
        action: { type: "grant-item", itemId: verticalSliceItem.id, quantity: 1 }
      },
      {
        id: "interactable:keycard",
        label: "Keycard",
        position: [2, 0.9, -1.7],
        radius: 1.1,
        action: { type: "grant-evidence", evidenceId: verticalSliceEvidence.id }
      },
      {
        id: "interactable:witness",
        label: "Witness",
        position: [-1.7, 0.9, -1.5],
        radius: 1.2,
        action: { type: "start-script", script: "harness/vertical-slice.nani", label: "Start" }
      },
      {
        id: "interactable:trial-stand",
        label: "Trial Stand",
        position: [-2.7, 0.9, 1.2],
        radius: 1.2,
        action: { type: "start-trial", trialId: verticalSliceTrial.id, segmentId: "debate:door-lock" }
      },
      {
        id: "interactable:classroom-door",
        label: "Classroom Door",
        position: [0, 1, -3.7],
        radius: 1.2,
        action: {
          type: "change-map",
          mapId: "map:classroom",
          pose: { position: [0, 1.7, 3.2], yaw: 3.14, pitch: 0 }
        }
      }
    ]
  },
  {
    id: "map:classroom",
    name: "Classroom",
    spawn: [0, 1.7, 3.2],
    walkBounds: {
      min: [-3.2, 0, -3.4],
      max: [3.2, 2.6, 3.6]
    },
    cameraRig: {
      id: "camera:navi:classroom",
      mode: "first-person",
      position: [0, 1.7, 3.2],
      fov: 65
    },
    collisionProxyIds: ["collision:classroom:aabb"],
    assetRefs: [
      { id: "model:classroom", kind: "glb", uri: "/harness/models/classroom.gltf", tags: ["harness"] }
    ],
    interactables: [
      {
        id: "interactable:hall-door",
        label: "Hall Door",
        position: [0, 1, 3.1],
        radius: 1.2,
        action: {
          type: "change-map",
          mapId: "map:academy-hall",
          pose: { position: [0, 1.7, -3.1], yaw: 0, pitch: 0 }
        }
      }
    ]
  }
];

export const verticalSliceScript = `#Start
@set route:"intro"
@back bg:harness effect:fade time:0.15
@char idAndAppearance:character:felix.portrait:felix:neutral pos:50,0
Narrator: CHECKPOINT 00 - baseline。视觉小说联调剧本：这是测试入口，不是剧情样例。请先确认背景和 Felix 中央立绘可见。[>]
Narrator: 请选择测试路径。分支 1 快速结束，只验证 StoryEngine 的 choice、goto、set、end；分支 2 是完整 Pixi 命令视觉验收。
@choice "分支1：快速结束剧情逻辑测试" goto:#LogicFastExit
@choice "分支2：完整 Pixi 命令视觉验收" goto:#PixiCommandShowcase

#LogicFastExit
@set route:"return"
Narrator: CHECKPOINT LOGIC 01 - fast exit。route 应切换为 return，选择跳转成功；下一步直接结束覆盖层，不进入 Pixi showcase。
@end

#PixiCommandShowcase
@set route:"classroom"
@gameplay grant-evidence id:evidence:keycard
Narrator: CHECKPOINT 00B - runtime state。分支 2 开始：右侧 Runtime 面板的 route 应为 classroom，evidence 应包含 evidence:keycard。
@back bg:harness effect:fade time:0.2
@rain power:1 time:0.1 xSpeed:-1.4 ySpeed:7
Narrator: CHECKPOINT 01A - rain only。背景为 bg:harness，画面前景应出现清晰、持续下落的斜向雨线；此处不叠加 blur、bokeh 或 sun。
@rain power:0 time:0.1
@snow power:1 time:0.1 scale:1.2,1.2,1
Narrator: CHECKPOINT 01B - snow only。雨线应消失，画面前景应出现清晰、缓慢飘落的雪花；此处仍不叠加 blur、bokeh 或 sun。
@snow power:0 time:0.1
@sun power:0.3 time:0.2 pos:12,88 scale:1.1,1.1,1
@blur actorId:MainBackground power:0.12 time:0.2
Narrator: CHECKPOINT 01C - sun + blur。右上应出现柔和光束，背景轻微虚化；雨雪此时应已关闭。
@char idAndAppearance:character:felix.portrait:felix:neutral pos:50,0
@char idAndAppearance:character:mira.portrait:mira:neutral pos:78,0
@char idAndAppearance:character:ren.portrait:ren:neutral pos:22,0
Narrator: CHECKPOINT 02 - char。Felix、Mira、Ren 三个 actor 均应可见；Ren 没有真实资源时显示 fallback，占位也算通过。
@arrange ren.18,felix.50,mira.82 look! time:0.25
Narrator: CHECKPOINT 03 - arrange。三名角色应重新排到左、中、右；右侧 Pixi Slots 应显示 left/center/right。
@flash color:#8fd3ff duration:160
Narrator: CHECKPOINT 04 - flash。刚才应看到一次蓝白色短闪光；下一次 advance 会触发 Felix 的 wait! slide，滑动中再次 advance 应立即完成动画并进入 CHECKPOINT 05。
@slide character:felix.portrait:felix:neutral from:38,0 to:50,0 time:0.8 easing:easeOut wait!
Narrator: CHECKPOINT 05 - slide + wait。Felix 应从偏左滑回中央；本句应在滑动等待结束后出现。
@shake actorId:character:ren power:0.36 time:0.08 count:4 deltaPower:0.06 hor! ver!
Narrator: CHECKPOINT 06 - shake。Ren 或其 fallback 应进行水平和垂直抖动。
@bokeh focus:character:felix dist:10 power:0.55 time:0.2
Narrator: CHECKPOINT 07 - bokeh only。画面应进入明显景深/柔焦状态，并出现柔和圆形光斑；下一步会先关闭 bokeh 再测试 glitch。
@bokeh power:0 time:0.15
@glitch power:0.9 time:2
Narrator: CHECKPOINT 07B - glitch only。bokeh 已关闭；本句出现时应能直接看到明显的扫描线、色差、横向噪声条或画面扰动；此处不测试 wait。
@glitch power:0.9 time:0.8 wait!
Narrator: CHECKPOINT 08 - glitch only + wait。保留 wait 检查点用于后续专项修复；本轮独立 glitch 视觉验收以 CHECKPOINT 07B 为准。
@back bg:classroom effect:fade time:0.2
@snow power:0.85 time:0.2 pos:62,82 scale:1,1,1
@rain power:0.85 time:0.2 xSpeed:0.5 ySpeed:5
@char idAndAppearance:character:mira.portrait:mira:neutral pos:24,0
@arrange ren.18,felix.50,mira.82 look! time:0.2
Narrator: CHECKPOINT 09 - rain + snow coexist。背景切到 bg:classroom，雨雪应同时清晰存在；三名角色不应被天气层遮没。
@flash color:#ffffff duration:120
@slide character:mira.portrait:mira:neutral from:15,0 to:24,0 time:0.25 easing:easeOut
@shake actorId:stage power:0.2 time:0.07 count:3 hor! ver!
Narrator: CHECKPOINT 10 - white flash、Mira slide、stage shake。应看到白闪，Mira 从更左侧滑入，随后整个 Pixi stage 轻微抖动；下一步 cleanup 会连续 wait! 关闭 screen/weather 效果。
@bokeh power:0 time:0.2
@blur actorId:MainBackground power:0 time:0.2 wait!
@rain power:0 time:0.2 wait!
@snow power:0 time:0.2 wait!
@sun power:0 time:0.2 wait!
Narrator: CHECKPOINT 11 - cleanup + consecutive wait。bokeh、blur、rain、snow、sun 均应被移除，画面恢复清晰稳定；本句出现代表连续 cleanup wait 已全部完成，背景保持 bg:classroom。
@hideChars time:0.2 wait!
Narrator: CHECKPOINT 12 - hideChars + wait。角色应已隐藏；本句出现后覆盖层即将结束。
@end`;
