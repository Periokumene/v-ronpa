import type { EvidenceDef, ItemDef, RuntimeAsset, TrialDefinition, WorldMapDef } from "@v-ronpa/contracts";

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

export const verticalSliceRuntimeAssets: RuntimeAsset[] = [
  {
    id: "bgm:validation-main",
    kind: "bgm",
    optimizedUri: "/harness/media/bgm/bgm-validation-main.ogg",
    format: "ogg",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: ["harness", "non-pixi-command-baseline"]
  },
  {
    id: "bgm:validation-alt",
    kind: "bgm",
    optimizedUri: "/harness/media/bgm/bgm-validation-alt.ogg",
    format: "ogg",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: ["harness", "non-pixi-command-baseline"]
  },
  {
    id: "bgm:validation-layer",
    kind: "bgm",
    optimizedUri: "/harness/media/bgm/bgm-validation-layer.ogg",
    format: "ogg",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: ["harness", "non-pixi-command-baseline"]
  },
  {
    id: "bgm:validation-extra",
    kind: "bgm",
    optimizedUri: "/harness/media/bgm/bgm-validation-extra.ogg",
    format: "ogg",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: ["harness", "non-pixi-command-baseline"]
  },
  {
    id: "sfx:rain-inside-car-loop",
    kind: "sfx",
    optimizedUri: "/harness/media/sfx/rain-inside-car-loop.ogg",
    format: "ogg",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: ["harness", "non-pixi-command-baseline"]
  },
  {
    id: "sfx:knock-door",
    kind: "sfx",
    optimizedUri: "/harness/media/sfx/knock-door.ogg",
    format: "ogg",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: ["harness", "non-pixi-command-baseline"]
  },
  {
    id: "sfx:shock-fadeout",
    kind: "sfx",
    optimizedUri: "/harness/media/sfx/shock-fadeout.ogg",
    format: "ogg",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: ["harness", "non-pixi-command-baseline"]
  },
  {
    id: "video:validation-intro",
    kind: "video",
    optimizedUri: "/harness/media/video/movie-validation-intro.mp4",
    format: "mp4",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: ["harness", "non-pixi-command-baseline"]
  }
];

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
Narrator: 请选择测试路径。分支 1 是完整 non-Pixi runtime command showcase；分支 2 保持完整 Pixi 命令视觉验收。
@choice "临时选项：应被 clearChoice 清除" id:temp-clear goto:#TemporaryChoiceShouldNotAppear
@clearChoice temp-clear
@choice "分支1：主交互流程验证入口" goto:#MainInteractionFlow
@choice "分支2：完整 Pixi 命令视觉验收" goto:#PixiCommandShowcase

#MainInteractionFlow
@set route:"return"
@clearBacklog
@showPrinter default
@format checkpoint:"accent"
@hideUI dialog
@hideUI commandBar
@toast "CHECKPOINT MAIN 01A - hideUI。VN dialog 与 command bar 应隐藏；右上 toast 应出现；调试侧栏应保持可见。"
@print "CHECKPOINT MAIN 01A - hideUI + explicit print。VN dialog 与 command bar 应隐藏；调试侧栏不属于 showUI/hideUI 控制面。" author:Narrator
@showUI dialog
@showUI commandBar visible:true
@print "CHECKPOINT MAIN 01B - showUI。VN dialog 与 command bar 应恢复；下一步验证 append + wait + input。" author:Narrator
@append " 附加文本验证：append 应更新当前行，但不新增 backlog。"
@wait i
@input playerName type:string summary:"输入任意代号后继续" value:Felix
Narrator: CHECKPOINT MAIN 02 - input。输入已提交；右侧 Runtime variables 应包含 playerName。
@bgm bgm:validation-main group:music volume:0.45 fade:0.2
@sfx sfx:rain-inside-car-loop group:rain loop:true volume:0.35
@sfx sfx:knock-door volume:0.9
Narrator: CHECKPOINT MAIN 03 - audio layer。应听到 music 组 BGM、rain 组 loop SFX，并播放一次敲门 SFX。
@bgm bgm:validation-alt group:music volume:0.45 fade:0.5
@bgm bgm:validation-layer group:ambient volume:0.25 fade:0.1
@sfxFast sfx:shock-fadeout volume:0.75
Narrator: CHECKPOINT MAIN 04 - grouped BGM。music 组 BGM 应被替换，ambient 组同时存在；sfxFast 播放一次。
@movie video:validation-intro block:true
Narrator: CHECKPOINT MAIN 05 - movie complete。阻塞 movie 已结束或跳过；脚本恢复推进。
@stopSfx group:rain fade:0.2
@stopBgm group:music fade:0.5
@stopBgm group:ambient fade:0.2
@resetText
@print "CHECKPOINT MAIN 06 - explicit print cleanup。loop SFX 和两个 BGM group 已停止；下一步将通过 @goto 跳到完成标签。" author:Narrator
@goto #MainInteractionComplete
Narrator: CHECKPOINT MAIN unreachable。若看到这句，说明 @goto 未按本地 label 生效。

#TemporaryChoiceShouldNotAppear
Narrator: CHECKPOINT MAIN unreachable temp choice。若看到这句，说明 @clearChoice 未清除临时选项。

#MainInteractionComplete
Narrator: CHECKPOINT MAIN 07 - goto complete。显式 @goto 已跳到完成标签；完整 non-Pixi showcase 完成。
@end

#PixiCommandShowcase
@set route:"classroom"
@gameplay grant-evidence id:evidence:keycard
Narrator: CHECKPOINT 00B - runtime state。分支 2 开始：右侧 Runtime 面板的 route 应为 classroom，evidence 应包含 evidence:keycard。
@back bg:harness effect:fade time:0.2
@rain power:1 time:0.1 xSpeed:-1.4 ySpeed:7
Narrator: CHECKPOINT 01A - rain only。背景为 bg:harness，画面前景应出现清晰、持续下落的斜向雨线；此处不叠加 blur、bokeh 或 sun。
@rain power:0 time:0.1
@back bg:black effect:fade time:0.12
@char idAndAppearance:character:felix.portrait:felix:neutral pos:36,0
@char idAndAppearance:character:mira.portrait:mira:neutral pos:68,0
@snow power:0.55 time:0.1 xSpeed:-0.1 ySpeed:0.75 density:0.85 flakeScale:1 sway:0.45 fog:0.18 noise:0.012 seed:11
Narrator: CHECKPOINT 01B-L1 - snow light。黑底与双立绘用于检查参数映射和轻雾染色：低档也应有明确雪粒、可见下落重力与轻微冷色雾。
@snow power:0.78 time:0.1 xSpeed:-0.18 ySpeed:0.95 density:1.25 flakeScale:1.22 sway:0.78 fog:0.3 noise:0.024 seed:12
Narrator: CHECKPOINT 01B-L2 - snow medium。相比 L1，雪点数量、尺寸、下落速度和横向摆动都应明显增强；立绘应出现更清楚的冷雾染色。
@snow power:0.92 time:0.1 xSpeed:-0.25 ySpeed:1.15 density:1.6 flakeScale:1.48 sway:1.02 fog:0.42 noise:0.036 seed:13
Narrator: CHECKPOINT 01B-L3 - snow heavy。黑底上应出现清晰大雪、较强重力下落和更明显轻雾；角色仍不应被雪层遮没。
@snow power:1 time:0.1 xSpeed:-0.35 ySpeed:1.35 density:2 flakeScale:1.78 sway:1.28 fog:0.55 noise:0.055 seed:14
Narrator: CHECKPOINT 01B-L4 - snow storm。黑底压力档：大雪、强重力、强摆动、较高雾与噪声同时开启，用于检查公开 snow 参数是否都能产生可见差异。
@snow power:0 time:0.1
@back bg:harness effect:fade time:0.12
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
@back bg:black effect:fade time:0.12
@char idAndAppearance:character:felix.portrait:felix:neutral pos:36,0
@char idAndAppearance:character:mira.portrait:mira:neutral pos:68,0
@glitch power:0.35 time:1 blockJump:0.45 burstJump:0.1 pixelScatter:0.35 colorNoise:0.12 speed:0.8 seed:41
Narrator: CHECKPOINT 07B-L1 - glitch light。黑底与多名立绘用于检查轻微 Morton 地址跳变；应只有少量块错位，人物边缘仍稳定可辨。
@glitch power:0.6 time:1 blockJump:0.9 burstJump:0.35 pixelScatter:0.75 colorNoise:0.35 speed:1 seed:42
Narrator: CHECKPOINT 07B-L2 - glitch medium。相比 L1 应出现更明显 block jump 与少量随机色替换，画面不能全白或全黑。
@glitch power:0.82 time:1 blockJump:1.25 burstJump:0.75 pixelScatter:1.2 colorNoise:0.68 speed:1.25 seed:43
Narrator: CHECKPOINT 07B-L3 - glitch heavy。应出现明显 Morton 重排、像素散射和角色边缘块错位，但对话框 DOM 不应被扰动。
@glitch power:1 time:1 blockJump:1.6 burstJump:1.15 pixelScatter:1.65 colorNoise:1 speed:1.5 seed:44
Narrator: CHECKPOINT 07B-L4 - glitch stress。压力档应有强地址跳变和随机色替换，用于确认 shader 不产生整屏白、整屏黑或残留 filter。
@glitch power:0.95 time:0.8 blockJump:1.2 burstJump:0.8 pixelScatter:1.25 colorNoise:0.85 speed:1.3 seed:45 wait!
Narrator: CHECKPOINT 08 - glitch shader + wait。保留 wait 检查点：本句出现代表 glitch wait 已完成，stage root filter 应已清理。
@glitchFilter power:0.54 time:0.25 blockJump:0.95 burstJump:0.55 pixelScatter:0.95 colorNoise:0.58 speed:3.2 seed:51 easing:linear wait!
Narrator: CHECKPOINT 08A - glitchFilter persistent。持久 glitchFilter 已开启；黑底与多名立绘应持续出现可见 Morton 跳变和色块刷新，且本状态应进入 Pixi snapshot。
Narrator: CHECKPOINT 08B - glitchFilter persists。未重新触发 @glitch 的第二句仍应保留并持续变化，用于确认它跨句存在而不是一次性 pulse 或静止滤镜。
@glitch power:0.9 time:1 blockJump:1.4 burstJump:0.95 pixelScatter:1.35 colorNoise:0.9 speed:1.35 seed:52
Narrator: CHECKPOINT 08C - glitchFilter + pulse。持久 glitchFilter 底噪上叠加一次性 @glitch 冲击；DOM 对话框仍不应被扰动。
@glitchFilter power:0 time:0.3 easing:linear wait!
Narrator: CHECKPOINT 08D - glitchFilter off cleanup。持久 glitchFilter 已关闭；画面应回到稳定黑底，无 Morton 残留，后续雨雪不应被污染。
@back bg:classroom effect:fade time:0.2
@snow power:0.85 time:0.2 xSpeed:-0.18 ySpeed:0.85 density:1.35 flakeScale:1.18 sway:0.82 fog:0.32 noise:0.03 seed:29
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
