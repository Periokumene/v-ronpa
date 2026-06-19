import type { EvidenceDef, ItemDef, WorldMapDef } from "@v-ronpa/contracts";

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
@back bg:harness effect:fade
@charEnter character:felix portrait:portrait:felix:neutral slot:center
Felix: 这是视觉小说联调剧本的第一句。走廊、证人、门禁卡都会在这一段里被验证。[>]
Mira: 我会记录每一次状态变化，尤其是证词和证物进入系统的时机。
Felix: 先别急着追问。这个场景需要证明中文文本、分支和立绘演出可以稳定推进。
@charEnter character:mira portrait:portrait:mira:neutral slot:right
Mira: 右侧立绘已就位。接下来要确认多角色对话不会互相覆盖。
Felix: 画面层交给 Pixi，对话框交给 DOM，剧情步进交给 StoryEngine。
Mira: 而 Navi 只负责告诉我们：现在还在探索模式的视觉小说覆盖层里。
@charEnter character:ren portrait:portrait:ren:neutral slot:left
Ren: 你们终于来了。我就是刚才站在教室门口的证人。
Felix: 你说自己一直没有离开走廊？
Ren: 对，但我听见门锁响了一次。声音很轻，像有人刷过卡。
Mira: 这和地上的红色门禁卡有关吗？
Ren: 我没有碰过它。我只记得灯闪了一下，然后广播突然断掉。
@flash color:#8fd3ff duration:140
Narrator: 走廊灯带短暂闪烁，蓝白色的光扫过三个人的影子。
Felix: 如果灯闪发生在门锁响之后，时间顺序就很关键。
Mira: 我们需要一个完整的测试路径：留在走廊复盘，或者跟着证人进教室。
Ren: 如果进教室，我可以指出声音传来的方向。
Felix: 如果留在走廊，我们能检查门框和地面的痕迹。
Mira: 两条路线都必须能回收变量、证据和结束态。
Ren: 那就让你来决定。别忘了，这只是测试，但证词不能含糊。
Narrator: 对话进入分支选择。当前脚本已经完成多角色登场、背景、闪光和长文本验证。
@choice "留在走廊复盘证词" goto:#ReviewHall
@choice "跟随证人进入教室" goto:#Classroom

#ReviewHall
@set route:"return"
Felix: 我们先留在走廊复盘证词。第一件事是确认门锁声音的来源。
Mira: 我会把证人的说法拆成三个点：灯闪、门响、广播中断。
Ren: 灯闪不是普通故障。它只闪了一次，而且方向像是从教室里漏出来的。
Narrator: Felix 蹲下检查门框，指尖沿着金属边缘缓慢移动。
@shake character:felix intensity:0.28 duration:240
Felix: 门框没有被撬过，但读卡器边缘有一道新划痕。
Mira: 也就是说，有人用过卡，却不一定熟悉这套门禁。
Ren: 我听见的声音应该就是读卡器重启。它平时不会这么响。
Felix: 证词在这里暂时成立，但我们还缺一个能确认时间点的物件。
Mira: 走廊复盘路线不发放新证据，只保留路线变量，方便测试无证据分支。
Narrator: 记录面板里，route 应该显示为 return，证据列表保持原样。
Ren: 如果你们之后要进教室，我还可以继续配合。
Felix: 这条路线足够了。我们先结束覆盖层，回到 Navi 探索。
Mira: 对话结束后，输入锁应该释放，玩家可以重新移动。
Narrator: 走廊路线完成。视觉小说覆盖层准备关闭。
@end

#Classroom
@set route:"classroom"
@gameplay grant-evidence id:evidence:keycard
@back bg:classroom effect:fade
@charEnter character:mira portrait:portrait:mira:neutral slot:left
Mira: 我们进入教室路线。系统现在应该发放门禁卡证据。
Felix: 证据更新发生在这句台词之前，方便 smoke 测试立刻检查状态。
Ren: 声音就是从讲台左侧传来的。那里有一个备用读卡器。
Narrator: 教室比走廊更暗，桌椅整齐得像从来没有人坐过。
@flash color:#ffffff duration:120
Mira: 白光闪烁。这个演出命令用来验证 Pixi 的 flash 效果。
Felix: 门禁卡的编号被刮掉了一半，但红色涂层很新。
Ren: 我见过这张卡。它不属于学生，也不属于普通教师。
Mira: 那它可能是临时权限卡，能解释为什么广播会被切断。
Felix: 如果有人刷卡进入教室，再切断广播，就能制造证词空窗。
Narrator: 讲台抽屉里传来轻微震动，像有什么东西撞到木板。
@shake character:ren intensity:0.42 duration:260
Ren: 等等，我刚才没有碰那个抽屉。
Felix: 别动。我们先把现有结论写清楚。
Mira: 结论一：证人听见门锁。结论二：门禁卡能解释门锁。结论三：广播中断可能是人为。
Ren: 结论四：我可能不是唯一听见声音的人。
Felix: 这很好。测试剧本现在覆盖了证据发放、分支变量、多角色台词和演出命令。
Mira: 对话结束后应该回到走廊或当前地图的 Navi 状态，输入锁解除。
Narrator: 教室路线完成。门禁卡证据已进入 Inspector Lite，可供后续审判样例使用。
@end`;
