export const harnessShowcaseScript = `#Start
@set route:"intro"
@back bg:harness effect:fade time:0.15
@inback bg:inner-academy-hall effect:fade time:0.15
@char Ema pos:50
Narrator: CHECKPOINT 00 - baseline。视觉小说联调剧本：这是测试入口，不是剧情样例。请先确认主背景、inner background frame 和 Ema 默认 layered character 可见。[>]
Narrator: 请选择测试路径。分支 1 是完整 non-Pixi runtime command showcase；分支 2 保持完整 Pixi 命令视觉验收。
@choice "临时选项：应被 clearChoice 清除" id:temp-clear goto:#TemporaryChoiceShouldNotAppear
@clearChoice temp-clear
@choice "分支1：主交互流程验证入口" goto:#MainInteractionFlow
@choice "分支2：完整 Pixi 命令视觉验收" goto:#PixiCommandShowcase
@choice "分支3：真实 textId-音频验证" goto:#VoiceTextIdAudioValidation
@choice "分支4：首轮富文本标签验收" goto:#RichTextShowcase
@choice "分支5：全局角色 Tone 验收" goto:#CharacterToneShowcase
@choice "分支6：Cue 演出文本验收" goto:#CueShowcase
@choice "分支7：单句分阶段停靠验收" goto:#StagedTextShowcase

#StagedTextShowcase
@set route:"staged-text"
@clearBacklog
@showPrinter default
@showUI dialog
@showUI commandBar visible:true
Narrator: 下落[-]，下落[-]，下落，仿佛没有尽头
@choice "继续 AUTO @print" goto:#StagedTextAuto

#StagedTextAuto
@print "下落[wait i]，下落[wait i]，下落，仿佛没有尽头" author:Ema textId:voice_validation_0001
@choice "继续 SKIP @cue" goto:#StagedTextSkip

#StagedTextSkip
@cue "向下[-]，向下[-]，再向下。这样的坠落难道永远不会结束吗？" author:Narrator
@choice "结束分阶段验收" goto:#StagedTextDone

#StagedTextDone
@hideCue
Narrator: CHECKPOINT STAGED DONE - 三种分阶段文本均已完成。
@end

#CueShowcase
@set route:"cue"
@showUI dialog
@showUI commandBar visible:true
Narrator: CHECKPOINT CUE 00 - 普通 Dialog 可见；下一步应瞬时切换到中央无框 Cue。
@cue "<b>CHECKPOINT CUE 01 - 中央富文本 Cue。</b>作者不应视觉显示，但无障碍名称、backlog 与音频身份应保留。" author:Narrator speed:0.8 textId:harness_cue_001
@hideUI dialog time:0.2 wait!
@cue "CHECKPOINT CUE 02 - hideUI dialog 不得隐藏 Cue；commandBar 仍由自己的 Surface 独立显示。" author:Narrator textId:harness_cue_002
@choice "CHECKPOINT CUE CHOICE - Cue 应保留为选项底文" goto:#CueChoiceContinue

#CueChoiceContinue
@hideCue time:0.4 wait!
@showUI dialog time:0.2 wait!
Narrator: CHECKPOINT CUE 03 - Cue 已完成淡出，随后普通 Dialog 才出现。
@end

#VoiceTextIdAudioValidation
@back bg:harness effect:fade time:0.15
@char Ema.Pensive1,ArmR3 pos:50
Narrator: CHECKPOINT VOICE REAL 00 - 真实 textId-音频验证。下面是一条连续支线：每条角色台词都应按 textId 自动播放对应 voice，并停止上一条 voice。
Narrator: 夜里的牢房被帘子隔成一间临时密室。艾玛、雪莉和玛格围着一台拆开的旧广播装置，谁都没有先碰那个红色开关。
Ema: 如果把证据广播出去，外面的人就会知道这里发生了什么。|#0102Adv03_Ema001|
Sherry: 也会知道信号从这里发出。广播塔会反向定位，我们可能连走出房间的时间都没有。|#0102Adv03_Sherry001|
Margo: 呵呵，危险才让选择变得有价值。安全的真相通常没人愿意听。|#0102Adv03_Margo001|
Ema: 我想让大家活下去。可如果一直沉默，我们只是换一种方式死在这里。|#0102Adv03_Ema002|
Sherry: 那就先保存证据，再找能撤离的时间窗口。只要我们活着，真相还能说第二遍。|#0102Adv03_Sherry002|
Margo: 或者现在就说。让整座监狱在同一秒听见我们的声音。很浪漫，也很愚蠢。|#0102Adv03_Margo002|
Ema: 雪莉，如果我按下开关，你能拖住追踪程序吗？|#0102Adv03_Ema003|
Sherry: 能拖住一小会儿。但我不保证能救下每个人，尤其不保证能救下你。|#0102Adv03_Sherry003|
Margo: 真诚的警告。艾玛，选择吧。你要的是立刻被听见，还是稍后被相信？|#0102Adv03_Margo003|
Ema: 我们先活下去。然后让证据自己说话。|#0102Adv03_Ema004|
Sherry: 我会把它拆成三份。任意一份流出去，都足够证明这里被伪装过。|#0102Adv03_Sherry004|
Margo: 明智，但不够漂亮。好吧，我喜欢能活到下一幕的主角。|#0102Adv03_Margo004|
Narrator: 第二天下午，三人把拆下来的存储芯带到图书室。这里的墙厚，信号弱，适合把证据切分成更难追踪的碎片。
Ema: 昨晚没有广播，不代表我们退缩。今天我们要让证据离开这里。|#0102Adv04_Ema001|
Sherry: 我做了三个副本。一个藏在旧书封里，一个写进维护日志，还有一个交给玛格。|#0102Adv04_Sherry001|
Margo: 交给我？你们真有胆量。坏人通常最擅长保管秘密。|#0102Adv04_Margo001|
Margo: 我当然会保管。只要秘密够漂亮，我就舍不得弄丢。|#0102Adv04_Margo002|
Ema: 我不是完全信任你。只是现在我们三个人必须互相信任一点点。|#0102Adv04_Ema002|
Sherry: 一点点就够。计划本来就是给会害怕的人用的。|#0102Adv04_Sherry002|
Margo: 如果广播塔不能立刻用，那我们就让它变成诱饵。等追踪系统盯着塔，我们从维修廊离开。|#0102Adv04_Margo003|
Ema: 也就是说，真相先走，我们随后跟上。|#0102Adv04_Ema003|
Sherry: 对。活人负责下一次广播，证据负责今晚的沉默。|#0102Adv04_Sherry003|
Ema: 下一次，我们会把它讲给所有人听。|#0102Adv04_Ema004|
Margo: 那就请你活到下一次。主角缺席的话，故事会很难收场。|#0102Adv04_Margo004|
Sherry: 先离开这里。故事以后再写。|#0102Adv04_Sherry004|
@end

#RichTextShowcase
@set route:"rich-text"
@clearBacklog
@showPrinter default
@showUI dialog
@showUI commandBar visible:true
Narrator: CHECKPOINT RICH 00 - dialogue 支持 <b>粗体</b>、<i>斜体</i>、<u>下划线</u>、<s>删除线</s>、<mark>标记</mark> 与实体 &lt;tag&gt;。
Narrator: CHECKPOINT RICH 01 - 别名支持 <strong>strong</strong> / <em>em</em> / <strike>strike</strike> / <del>del</del>，实体支持 A&nbsp;B、&amp; 与 &quot;quote&quot;。
Narrator: CHECKPOINT RICH 02 - 字号 <small>small</small> / <big>big</big> / <font size='1'>size 1</font> / <font size='7'>size 7</font> / <font size='-1'>-1</font> / <font size='+1'>+1</font>。
Narrator: CHECKPOINT RICH 03 - 上下标 H<sub>2</sub>O / x<sup>2</sup>，以及<br>显式换行应在同一个对话框中渲染。
@print "<font color='red'>CHECKPOINT RICH 04 named color</font> + <font color='#ff5577'><b>hex color + bold</b></font> - @print 中颜色与粗体应生效。" author:Narrator
@append " <font size='+1'>@append 追加段落字号变大</font>，但不继承上一段颜色。"
@toast "<mark>CHECKPOINT RICH TOAST</mark> <small>toast 使用同一 renderer，且不进入存档。</small>" appearance:info time:2
Narrator: CHECKPOINT RICH 05 - font face 英文同字符对比：默认 AaGgQq Font ID 123 / serif <font face='font:serif'>AaGgQq Font ID 123</font>；后者应使用注册 font id，中文不覆盖时可回退默认字体。
@choice "<b><font color='#ffd166'>富文本 choice</font></b> - 回到入口" goto:#Start

#CharacterToneShowcase
@set route:"character-tone"
@back bg:harness effect:fade time:0.15
@hideChars
@charTone rain amount:0.5
Narrator: CHECKPOINT TONE 00 - 无角色时预设 rain amount 0.5；右侧 Tone 应显示 rain@0.5，当前不应给背景或 DOM 对话框着色。
@char Ema pos:50
Narrator: CHECKPOINT TONE 01 - 后出现的 Ema 应继承 rain@0.5；白色描边保持纯白。
@charTone fog amount:1 time:0.2 wait!
Narrator: CHECKPOINT TONE 02 - fog@1 过渡终态。
@charTone sunset amount:2 time:0.2 wait!
Narrator: CHECKPOINT TONE 03 - sunset@2 等于完整实验强度。
@charTone night amount:1
Narrator: CHECKPOINT TONE 04 - night@1。
@charTone alert amount:1.25 time:0.2 wait!
Narrator: CHECKPOINT TONE 05 - alert@1.25；非自然氛围应明显但线稿和白色描边不变。
@charTone fluorescent amount:3
Narrator: CHECKPOINT TONE 06 - fluorescent@3 overdrive；输出应保持有限且人物层次可辨。
@charTone amount:0.5
Narrator: CHECKPOINT TONE 07 - amount-only 更新保持 fluorescent preset，强度降至 0.5。
@charTone rain amount:1 time:0.2 wait!
Narrator: CHECKPOINT TONE SAVE - 保存此处后切换 preset，再读档应立即恢复 rain@1 目标终态。
@charTone sunset amount:1.5 time:0.4
@char Ema.Pensive1,ArmR3 pos:50
Narrator: CHECKPOINT TONE 08 - preset 动画中 expression crossfade 两侧应共享同一 live tone，不出现色调接缝。
@charTone none time:0.2 wait!
Narrator: CHECKPOINT TONE 09 - none 清除终态；Tone 应显示 none。
@charTone fog amount:1
@charTone amount:0 time:0.2 wait!
Narrator: CHECKPOINT TONE 10 - amount:0 清除终态；Tone 应显示 none。
@choice "返回 Tone 分支入口" goto:#CharacterToneShowcase

#MainInteractionFlow
@set route:"return"
@clearBacklog
@showPrinter default
@hideUI dialog time:0.2 wait!
@hideUI commandBar time:0.2 wait!
@toast "CHECKPOINT MAIN 01A - hideUI timed wait。VN dialog 与 command bar 应隐藏；右上 toast 应出现；调试侧栏应保持可见。"
@print "CHECKPOINT MAIN 01A - hideUI timed wait + explicit print。VN dialog 与 command bar 应隐藏；调试侧栏不属于 showUI/hideUI 控制面。" author:Narrator
@showUI dialog time:0.2 wait!
@showUI commandBar visible:true time:0.2 wait!
@print "CHECKPOINT MAIN 01B - showUI timed wait。VN dialog 与 command bar 应恢复；下一步验证 append + wait + input。" author:Narrator
@append " 附加文本验证：append 应更新当前行，但不新增 backlog。"
@wait i
@input playerName type:string summary:"输入任意代号后继续" value:Felix
Narrator: CHECKPOINT MAIN 02 - input。输入已提交；右侧 Runtime variables 应包含 playerName。
Mira: CHECKPOINT BLEEP DEFAULT - nani speaker Mira 没有 override，应使用默认 dialogue bleep 008。
Felix: CHECKPOINT BLEEP OVERRIDE - nani speaker Felix 应使用角色 override dialogue bleep 009。
Narrator: CHECKPOINT BLEEP NULL - nani speaker Narrator 配置为 null override，应保持无 bleep。
@bgm bgm:validation-main group:music volume:0.45 fade:0.2
@sfx sfx:rain-inside-car-loop group:rain loop! volume:0.35 fade:0.2
@sfx sfx:knock-door volume:0.9 fade:0.1
Narrator: CHECKPOINT MAIN 03 - audio fade-in layer。应听到 music 组 BGM 淡入、rain 组 loop SFX 淡入，并播放一次敲门 SFX。
@bgm group:music volume:0.3 time:0.4
@sfx group:rain volume:0.15 time:0.4
Narrator: CHECKPOINT MAIN 03B - audio volume transition。music 组 BGM 与 rain 组 loop SFX 应平滑降低音量，且不重启资源。
@bgm bgm:validation-main group:music volume:0.38 time:0.25
@sfx sfx:rain-inside-car-loop group:rain loop! volume:0.25 time:0.25
Narrator: CHECKPOINT MAIN 03C - same-resource volume transition。同组同资源 BGM 与 loop SFX 应视为平滑调音量，而不是重新播放。
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
@rain power:0.5 wind:-1 hue:215 tint:0.55 time:0.1
Narrator: CHECKPOINT 01A-L1 - rain half power left。背景为 bg:harness，画面前景应出现较轻、持续下落并向左倾斜的雨线；用于检查 power:0.5 与默认蓝色 tint。
@rain power:0.75 wind:0 hue:170 tint:1.1 time:0.1 easing:linear
Narrator: CHECKPOINT 01A-L2 - rain neutral cyan。雨势应比 L1 更密，横向风接近 0，雨色应带更明显青色染色；用于检查 wind/hue/tint 参数映射。
@rain power:1 wind:1 hue:300 tint:1.65 time:0.1
Narrator: CHECKPOINT 01A-L3 - rain full right magenta。雨势应为最高档，前景雨线持续运动且改为向右风偏，并带更强紫红染色；用于检查 power:1、正 wind 和高 tint。
@rain power:0 time:0.1 wait!
Narrator: CHECKPOINT 01A-OFF - rain cleanup。雨应已关闭，背景保持 bg:harness；本句出现代表 rain power:0 wait! 的 weather-transition 已完成。
@back bg:black effect:fade time:0.12
@char Ema.Pensive1,ArmR3 pos:50
@snow power:0.55 time:0.1 xSpeed:-0.1 ySpeed:0.75 density:0.85 flakeScale:1 sway:0.45 fog:0.18 noise:0.012 seed:11
Narrator: CHECKPOINT 01B-L1 - snow light。黑底与 Ema layered character 用于检查参数映射和轻雾染色：低档也应有明确雪粒、可见下落重力与轻微冷色雾。
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
Narrator: CHECKPOINT 01C - sun + blur。右上应出现柔和光束，主背景轻微虚化；雨雪此时应已关闭。inner background 仍在 snapshot 中，但会被 weather-back 的 sun 层覆盖或洗亮。
@blur actorId:MainBackground power:0 time:0.12
@sun power:0 time:0.12 wait!
@inback bg:inner-snow-outskirts effect:fade time:0.2 wait!
Narrator: CHECKPOINT 01D - inback switch。inner background frame 应从 academy hall 切换为 snow outskirts 真实图片；主背景仍保持 bg:harness。
@char Ema pos:50
Narrator: CHECKPOINT 02A - char default composition。Ema 应回到 Default 展开结果；右侧 Pixi Chars 应显示 Ema/default。
@char Ema.Pensive1 pos:50
Narrator: CHECKPOINT 02B - char composite token。Pensive1 应从 Default 重新展开并替换 Head1 表情组，表现为沉思眼睛与嘴型。
@char Ema.Pensive1,ArmR3 pos:50
Narrator: CHECKPOINT 02C - char composite + arm。Ema 应以 Pensive1 + ArmR3 layered expression 可见；角色包应通过 ContentManifest 的 character-pack 入口解析。
@char Ema.Pensive1,ArmR3,ArmR4 pos:50
Narrator: CHECKPOINT 02D - char override order。ArmR4 写在 ArmR3 之后，应覆盖同组右臂，右侧 Pixi Chars 应保留完整表达式 Pensive1,ArmR3,ArmR4。
@char Ema.Pensive1,ArmR4,Angle01/Head01/Facial01/Mouth01>Mouth01_Smile_Open pos:50
Narrator: CHECKPOINT 02E - char atom override。Pensive1 composite 展开后，原子 Group>Layer 应只替换 Mouth01 为 Smile_Open，眼睛和右臂保持上一表达式指定的沉思与 ArmR4。
@char Ema.Pensive1,ArmR4,Angle01/Head01/Facial01/Sweat01+Sweat01_01 pos:50
Narrator: CHECKPOINT 02F - char atom add。Group+Layer 应在 Pensive1 基础上追加 Sweat01_01，形成局部新增图层差分。
@char Ema.Pensive1,ArmR4,Angle01/Head01/Facial01/Sweat01+Sweat01_01,Angle01/Head01/Facial01/Sweat01- pos:50
Narrator: CHECKPOINT 02G - char prefix remove。相同 expression 内先追加汗滴再用 Group- 关闭，最终应回到无汗滴的 Pensive1 + ArmR4。
@char Ema.Pensive1,ArmR3 pos:50
Narrator: CHECKPOINT 02H - char reset absolute。重新指定 Pensive1 + ArmR3 应证明每次 @char 都是绝对外观，不继承前面的 Mouth 或 Sweat 差分。
@arrange Ema.50 look! time:0.25
Narrator: CHECKPOINT 03 - arrange。Ema 应保持中央位置；右侧 Pixi Chars 应显示 Ema/Pensive1,ArmR3。
@flash color:#8fd3ff duration:160
Narrator: CHECKPOINT 04 - flash。刚才应看到一次蓝白色短闪光；下一次 advance 会触发 Felix 的 wait! slide，滑动中再次 advance 应立即完成动画并进入 CHECKPOINT 05。
@slide Ema.Pensive1,ArmR3 from:38,0 to:50,0 time:0.8 easing:easeOut wait!
Narrator: CHECKPOINT 05 - slide + wait。Ema 应从偏左滑回中央；本句应在滑动等待结束后出现。
@shake actorId:Ema power:0.36 time:0.08 count:4 deltaPower:0.06 hor! ver!
Narrator: CHECKPOINT 06 - shake。Ema 或其 fallback 应进行水平和垂直抖动。
@bokeh focus:Ema dist:10 power:0.55 time:0.2
Narrator: CHECKPOINT 07 - bokeh only。画面应进入明显景深/柔焦状态，并出现柔和圆形光斑；下一步会先关闭 bokeh 再测试 glitch。
@bokeh power:0 time:0.15
@back bg:black effect:fade time:0.12
@char Ema.Pensive1,ArmR3 pos:50
@glitch power:0.35 time:1 blockJump:0.45 burstJump:0.1 pixelScatter:0.35 colorNoise:0.12 speed:0.8 seed:41
Narrator: CHECKPOINT 07B-L1 - glitch light。黑底与 layered character 用于检查轻微 Morton 地址跳变；应只有少量块错位，人物边缘仍稳定可辨。
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
@rain power:0.85 wind:0.35 hue:215 tint:0.55 time:0.2
@char Ema.Pensive1,ArmR3 pos:24,0
@arrange Ema.24 look! time:0.2
Narrator: CHECKPOINT 09 - rain + snow coexist。背景切到 bg:classroom，雨雪应同时清晰存在；Ema 不应被天气层遮没。
@flash color:#ffffff duration:120
@slide Ema.Pensive1,ArmR3 from:15,0 to:24,0 time:0.25 easing:easeOut
@shake actorId:stage power:0.2 time:0.07 count:3 hor! ver!
Narrator: CHECKPOINT 10 - white flash、Ema slide、stage shake。应看到白闪，Ema 从更左侧滑入，随后整个 Pixi stage 轻微抖动；下一步 cleanup 会连续 wait! 关闭 screen/weather 效果。
@bokeh power:0 time:0.2
@blur actorId:MainBackground power:0 time:0.2 wait!
@rain power:0 time:0.2 wait!
@snow power:0 time:0.2 wait!
@sun power:0 time:0.2 wait!
Narrator: CHECKPOINT 11 - cleanup + consecutive wait。bokeh、blur、rain、snow、sun 均应被移除，画面恢复清晰稳定；本句出现代表连续 cleanup wait 已全部完成，背景保持 bg:classroom。
@hideChars time:0.2 wait!
Narrator: CHECKPOINT 12 - hideChars + wait。角色应已隐藏；本句出现后覆盖层即将结束。
@end`;
