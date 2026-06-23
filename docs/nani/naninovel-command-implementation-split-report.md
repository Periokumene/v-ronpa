# Naninovel 命令实现分流报告

日期：2026-06-23

核对来源：

- Naninovel 官方命令 API，v1.21：https://naninovel.com/api/
- 本地命令 catalog：`packages/contracts/src/index.ts`
- 本地管线文档：`docs/architecture/contracts.md`、`docs/architecture/vn-runtime-dispatcher.md`、`docs/architecture/presentation-pipeline.md`
- 本地实现：`packages/nani-parser`、`packages/nani-runtime-compiler`、`packages/story-engine`、`apps/game/src/vnRuntimeTransaction.ts`、`apps/game/src/vnOutputRoutes.ts`、`packages/pixi-presenter`

## 架构结论

- `packages/nani-parser` 有意保持通用。它把脚本行解析为 `CommandIR` 和 `TextIR`，保留源码位置、顺序命令参数、主参数、具名参数、flag、行内文本命令和本地 label。它不理解具体命令语义。
- `packages/contracts/src/index.ts` 持有 `commandCatalog`。这是命令 category、source、status、params、aliases、child-block 能力和 execution boundary 的唯一声明源。
- `packages/nani-runtime-compiler` 根据 catalog 解析命令 ID，把顺序参数绑定到 catalog 参数，将已实现命令归一化为稳定的 `RuntimeCommand.params`，并为 unknown、invalid、unsupported、declared-only 命令输出诊断。
- `packages/story-engine` 只直接执行已实现的 StoryEngine 控制命令：`print`、`choice`、`goto`、`set` 和 V-Ronpa `end`。已实现的非控制命令会作为 `RuntimeCommand` 向下游发出；未实现命令会 no-op 并产生诊断。
- `apps/game/src/vnRuntimeTransaction.ts` 将发出的 runtime commands 分发给 Pixi 和 gameplay。Pixi 命令由 `packages/pixi-presenter` reduce；gameplay 目前从 V-Ronpa `gameplay` 转为 `GameplayEvent`。
- `apps/game/src/vnOutputRoutes.ts` 先按显式 command ID 路由，再按 category fallback 路由。当前 category fallback 会把 `actor`、`scene`、`effect` 发给 Pixi，所以把 stubbed 命令提升为 `implemented` 可能会立刻把尚未设计的命令送进 Pixi reducer 并产生诊断。
- `packages/pixi-presenter` 当前 reduce 了 `back`、`char`、`arrange`、`hidechars`、`slide`、`blur`、`bokeh`、`rain`、`snow`、`sun`、`shake`、`glitch`、`flash` 和 `trialkeyword`。`focus` 已经在 catalog/compiler/routing 层可见，但 Pixi 还没有 reducer。

## 官方 Catalog 核对

- Naninovel 官方命令 API 当前暴露 78 个命令标题。
- 本地 catalog 包含 77 个官方 Naninovel 命令。
- 本地 catalog 缺少官方命令：`or`。
- 本地 catalog 还声明了 V-Ronpa 项目命令：`end`、`gameplay`、`charenter`、`flash`、`focus`、`trialkeyword`。
- 官方全局参数 `if`、`unless` 和 `wait` 文档上适用于大多数命令。本地 compiler 会保留 `if`/`unless` 为 runtime expression，并由 StoryEngine 在执行前求值。显式 `wait!` 当前只对发出的 actor/scene/effect presentation commands 有实际意义。

## 分支边界建议

### 分支 A：纯 Pixi 表现打磨

这个分支适合处理 `packages/pixi-presenter`、Pixi 测试、render hints、task 生命周期、视觉资产和截图/Playwright 证据。适合目标：

- 改善已经发到 Pixi 的命令的视觉质量和动画行为。
- 为 V-Ronpa `focus` 补齐缺失的 Pixi reducer 支持。
- 打磨 Pixi task 的 wait 精度和 Complete On Continue 行为。
- 除非分支明确带 CCR，否则避免修改 `packages/contracts` 或 `packages/nani-runtime-compiler`。

### 分支 B：非 Pixi 命令运行时

这个分支适合处理 StoryEngine、story-play、DOM/UI adapters、media adapter 设计、gameplay event 映射、parser block 支持和 compiler normalization。适合目标：

- 实现纯 StoryEngine 的 flow/state/text/choice 命令。
- 增加不影响 Pixi 的 UI/media/app command adapters。
- 只有在同时补齐条件块语义的 parser/compiler 测试时，才添加缺失的官方 `or` catalog entry。
- 避免修改 Pixi reducer 行为。

### 单独集成或 CCR 工作

凡是会改变 `commandCatalog`、`.nani` IR、`RuntimeCommand` shape、route tables 或跨 renderer 语义的命令，都应走 integration/CCR。这尤其适用于 `camera`、泛 actor 的 `show/hide/remove`、`trans`、parser child blocks，以及任何从 `stubbed` 提升到 `implemented` 的命令。

## 纯 Pixi 命令

这些命令一旦进入下游 dispatch，具体执行效果应由 Pixi presentation 拥有。部分命令仍依赖 compiler/catalog 支持，但其具体表现执行是 Pixi-local。

| 命令 | 语义 | 设计模块 | 当前进展 |
|---|---|---|---|
| `arrange` | 自动分布可见角色，或按命名角色设置 X 轴场景百分比位置。 | `nani-runtime-compiler` normalization；`pixi-presenter` stage reducer 和 actor tweening。 | 官方 catalog 为 `implemented`；compiler 归一化 `characterPositions/look/time/wait`；Pixi reducer 更新可见角色位置、look、slots 和 wait tasks。还需要打磨更丰富的站位和官方 look 行为。 |
| `back` | 修改背景 actor 的 appearance、pose、transform、tint、transition、visibility。 | Compiler canonical params；Pixi background actor snapshot 和 ActorSystem。 | 官方 catalog 为 `implemented`；Pixi 支持主背景和命名背景、可见背景 wildcard、场景百分比坐标、transform、tint、visibility、transitions、wait tasks。transition effects/dissolve/pose 行为仍是简化版。 |
| `blur` | 对 actor 应用或移除 blur effect，默认目标是 main background。 | Pixi actor filter reducer 和 FilterSystem。 | 官方 catalog 为 `implemented`；Pixi 存储 actor blur filter 并支持 transition 动画。通过 target resolution 支持已知目标和 wildcard。效果精度仍简化。 |
| `bokeh` | 模拟 depth-of-field/screen bokeh。 | Pixi screen filter snapshot、ScreenOverlaySystem、task lifecycle。 | 官方 catalog 为 `implemented`；Pixi 使用 Kawase blur 和 bokeh overlay sprites，支持 fade-in/out 和 wait tasks。focus/dist 语义只做了浅层表达。 |
| `char` | 修改角色 actor 的 appearance、pose、look、avatar、transform、tint、visibility、transition。 | Compiler canonical params；Pixi character actor snapshot 和 ActorSystem。 | 官方 catalog 为 `implemented`；Pixi 支持单层 placeholder 或 harness portrait 渲染、位置、transform、tint、可见角色 wildcard、transition wait tasks。avatar、layered/Spine/Live2D parity 和 pose resources 尚未完整对齐 Naninovel。 |
| `flash` | V-Ronpa 屏幕闪白/闪色效果。 | Pixi transient effect hint 和 task。 | V-Ronpa catalog 为 `implemented`；compiler 归一化 color/duration/wait；Pixi 渲染渐隐 overlay 和 wait task。 |
| `focus` | V-Ronpa stage/actor focus cue。 | 应实现为 Pixi transient effect 或 camera-like hint。 | V-Ronpa catalog 为 `implemented` 且已路由到 Pixi，但 `reducePixiRuntimeCommand` 尚未处理它；当前会产生 unsupported Pixi command 诊断。这是 Pixi 分支高优先级缺口。 |
| `glitch` | 屏幕 glitch 视觉效果。 | Pixi transient effect hint，配合 filters/textures。 | 官方 catalog 为 `implemented`；compiler 归一化 power/time/wait；Pixi 渲染 noise/scanlines/chromatic overlays 和 wait task。需要美术调优和确定性截图覆盖。 |
| `hideChars` | 隐藏所有可见角色。 | Pixi character snapshot reducer。 | 官方 catalog 为 `implemented`；Pixi 将所有角色标为 invisible，更新 slots，发出 wait tasks。这比泛用 `hide` 更窄。 |
| `rain` | 天气粒子效果。power 为 0 时移除。 | Pixi weather snapshot 和 WeatherSystem。 | 官方 catalog 为 `implemented`；Pixi 渲染 tiled rain layers，支持 fade 和 wait tasks。相比 Naninovel particle system 是简化版。 |
| `shake` | 对 actor、camera 或 stage 做有限次数 shake，带 count/power/duration。 | Pixi transient effect hint 和 task。 | 官方 catalog 为 `implemented`；compiler 支持官方参数和 V-Ronpa `target/intensity/duration`；Pixi 支持有限 shake。`loop!` 会被诊断为 unsupported。 |
| `slide` | 将已有 actor 从/到场景位置滑动，并可选设置 visibility/appearance。 | Pixi actor snapshot reducer 和 ActorSystem tweens。 | 官方 catalog 为 `implemented`；Pixi 支持已有 character/background 目标、from/to、visibility、easing/time/wait。不影响 DOM text printers 或 choice handlers。 |
| `snow` | 雪粒子效果。power 为 0 时移除。 | Pixi weather snapshot 和 WeatherSystem。 | 官方 catalog 为 `implemented`；Pixi 渲染 snow layers，支持 fade 和 wait tasks。粒子语义简化。 |
| `sun` | 阳光/godray 粒子或光照效果。power 为 0 时移除。 | Pixi weather/filter snapshot 和 WeatherSystem。 | 官方 catalog 为 `implemented`；Pixi 渲染类似 godray 的 layer/filter 和 wait tasks。语义简化。 |
| `trialkeyword` | V-Ronpa trial/debate keyword overlay 的视觉锚点。 | Pixi transient trial overlay hint；Trial 规则仍属于 `TrialDefinition`。 | V-Ronpa catalog 为 `implemented`；Pixi 渲染 keyword pill hint。它不是规则源，不应修改 trial director state。 |

## 纯非 Pixi 命令

这些命令应在 StoryEngine、story-play、DOM/UI shell、media adapters 或 gameplay/app adapters 中实现，不需要 Pixi reducer 工作。

| 命令 | 语义 | 设计模块 | 当前进展 |
|---|---|---|---|
| `addChoice` | 动态添加 choice，不一定立即停止播放。 | StoryEngine choice state 加 DOM choice surface；后续可扩展 parser block 支持 nested choice bodies。 | 官方 catalog 为 `stubbed`；compiler 可透传 generic params，但 StoryEngine no-op。需要比当前 `choice` 更完整的 choice queue model。 |
| `append` | 将文本立即追加到 printer message。 | StoryEngine backlog/current-line model 和 DOM dialog/printer surface。 | 官方 catalog 为 `stubbed`；不会发出运行时行为。当前普通文本会编译为 `print`，不是 append。 |
| `async` | 在命名 parallel track 上异步运行 nested commands，可选 loop。 | Parser child blocks 加 StoryEngine multi-track scheduler。 | 官方 catalog 为 `declared-only`；parser 不解析 child blocks。不能只由 Pixi 分支实现。 |
| `await` | 等待 track 或 nested block 结束，可选 complete。 | StoryEngine multi-track scheduler 和 presentation waits。 | 官方 catalog 为 `declared-only`；没有 runtime track model。 |
| `bgm` | 播放或修改 BGM，包含 volume/loop/fade/group/timing。 | 未来 media adapter，不属于 StoryEngine 或 Pixi。 | 官方 catalog 为 `stubbed`；route table 的 category 会把已发出的 media commands 送到 `media`，但 StoryEngine 目前不会发出未实现命令。 |
| `choice` | 添加 required choice，并等待用户选择。 | StoryEngine pending choices；DOM choice UI。 | 官方 catalog 为 `implemented`；当前 runtime 只支持 text 和 `goto`。官方 lock/button/handler/gosub/set/show/time/nested 行为未实现。 |
| `clearBacklog` | 清空 printer backlog。 | StoryEngine backlog state 和 DOM backlog overlay。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `clearChoice` | 从 choice handler 移除 choices，可选隐藏。 | StoryEngine pending choice state 和 DOM choice UI。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `else` | 条件块 fallback 分支。 | Parser child blocks 加 StoryEngine conditional block execution。 | 官方 catalog 为 `stubbed` 且 `supportsChildren`；parser 不解析 blocks。当前 per-command `if/unless` 不能覆盖它。 |
| `endIf` | 显式关闭条件块。 | Parser block syntax 和 compiler control-flow normalization。 | 官方 catalog 为 `stubbed`；无 block parser 支持。 |
| `format` | 为 printer 定义文本 formatting templates。 | DOM text formatting/printer layer。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `gosub` | 跳转到 subroutine，之后可 return。 | StoryEngine call stack 和 script dependency resolution。 | 官方 catalog 为 `stubbed`；parser dependency tracking 目前没有把 `gosub` 当 dependency；无 runtime call stack。 |
| `goto` | 跳转到 label 或 script path，带 reset/hold/release 资源语义。 | StoryEngine instruction pointer 和未来 script loader。 | 官方 catalog 为 `implemented`；当前 runtime 只通过归一化 `label` 支持本地 labels。外部 paths 和 reset/hold/release 未实现。 |
| `group` | 将 nested commands 分组以配合 block control。 | Parser child blocks 和 StoryEngine block runner。 | 官方 catalog 为 `stubbed`；无 child-block parsing。 |
| `if` | expression 为 true 时执行 nested block。 | Parser child blocks 和 StoryEngine expression evaluator。 | 官方 catalog 为 `stubbed`；当前命令级 `if:` 参数可作用于任意命令，但 top-level `@if` block 语义未实现。 |
| `input` | 弹出输入 UI 并写入变量。 | DOM modal/input surface 加 StoryEngine variable patch。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `lock` | 将 unlockable item 标记为 locked。 | 如果采用，应进入 app/global progression state。 | 官方 catalog 为 `stubbed`；只有实现后 route table category fallback 才会进入 `app`。使用前需要 V-Ronpa-specific state mapping。 |
| `movie` | 播放 video resource，可选 blocking。 | Media/DOM video overlay adapter。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `openURL` | 在 browsing context 打开 URL。 | App/UI command adapter，并需要安全策略。 | 官方 catalog 为 `stubbed`；无 runtime 行为。应要求 allow-list 或 user gesture 策略。 |
| `or` | `else if` 的条件分支快捷写法。 | Catalog 加 parser child blocks 和 StoryEngine conditional execution。 | 官方 API 有该命令；本地 catalog 缺失。不要作为浅层 catalog-only 变更添加。 |
| `print` | 使用 author/printer/display 参数 reveal/print text。 | StoryEngine backlog/current line；DOM dialog surface 和 story-play timing。 | 官方 catalog 为 `implemented`；文本行编译为 V-Ronpa-source `print`。当前 runtime 只保存 backlog text/speaker；许多官方 printer/reveal 参数会被忽略或诊断为 unsupported。 |
| `processInput` | 启用/禁用输入处理。 | App input lock/capability adapter。 | 官方 catalog 为 `stubbed`；无 runtime 行为。必须尊重 `InputLockState` 和 directors。 |
| `purgeRollback` | 清空 rollback history。 | 如果添加 rollback，应属于 Story/save history model。 | 官方 catalog 为 `stubbed`；当前没有 rollback model。 |
| `random` | 按 weight 从 nested branches 中选一个执行。 | Parser child blocks 加 StoryEngine deterministic RNG policy。 | 官方 catalog 为 `stubbed`；无 child-block parsing/RNG state。 |
| `resetState` | 按 exclude/only 重置 engine state。 | App/story/gameplay reset orchestration。 | 官方 catalog 为 `stubbed`；范围大且风险高。如实现，应做 V-Ronpa-scoped 版本。 |
| `resetText` | 清空 printer 中的文本。 | DOM dialog/printer state。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `return` | 从 `gosub` 返回。 | StoryEngine call stack。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `save` | 保存到 slot。 | App save adapter 和 UI policy。 | 官方 catalog 为 `stubbed`；无 runtime 行为。通常不应让 scenario scripts 在没有 UX policy 的情况下静默写存档。 |
| `set` | 求值 assignment expression 并设置变量。 | StoryEngine variables/expression evaluator。 | 官方 catalog 为 `implemented`；当前 compiler 支持 dynamic assignment param，StoryEngine 设置一个 key/value。完整 Naninovel assignment syntax、increments 和 multi-statements 尚不完整。 |
| `sfx` | 用 audio params 播放 sound effect。 | 未来 media adapter。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `sfxFast` | 不等待加载地播放 SFX，带 restart/additive/group。 | 未来 media adapter。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `showPrinter` | 显示 text printer。 | DOM dialog/printer surface。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `showUI` | 显示命名 UI 或整个 UI。 | GameInteractionShell/UI adapter。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `skip` | 启用/禁用 skip mode。 | `story-play` automation state 加 UI shell。 | 官方 catalog 为 `stubbed`；当前 runtime skip 是用户 UI action，不是脚本命令。 |
| `stop` | 停止 async track 或 playback task。 | StoryEngine multi-track scheduler。 | 官方 catalog 为 `declared-only`；没有 track model。 |
| `stopBgm` | 停止/fade BGM。 | 未来 media adapter。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `stopSfx` | 停止/fade SFX。 | 未来 media adapter。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `stopVoice` | 停止 voice playback。 | 未来 media adapter。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `sync` | 同步 script tracks。 | StoryEngine multi-track scheduler。 | 官方 catalog 为 `declared-only`；没有 track model。 |
| `title` | 返回 title screen。 | App shell flow 和 confirmation policy。 | 官方 catalog 为 `stubbed`；无 runtime 行为。应尊重 `GameInteractionShell` 的所有权。 |
| `toast` | 显示 toast notification。 | UI shell/toast adapter。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `unless` | expression 为 false 时执行 nested block。 | Parser child blocks 加 StoryEngine conditional execution。 | 官方 catalog 为 `stubbed`；命令级 `unless:` 参数可作用于单条命令，但 top-level block 语义未实现。 |
| `unlock` | 将 unlockable item 标记为 unlocked。 | 如果采用，应进入 app/global progression state。 | 官方 catalog 为 `stubbed`；无 runtime 行为。需要 V-Ronpa-specific state mapping。 |
| `voice` | 播放 voice clip，可选关联 author。 | 未来 media adapter 加 dialog author integration。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `wait` | 等待 timer/input/skippable condition。 | StoryEngine/story-play timing 和 input gating。 | 官方 catalog 为 `stubbed`；当前显式 Pixi `wait!` 是另一套 presentation-task driven 机制。Top-level `@wait` 未实现。 |
| `while` | 当 expression 为 true 时循环执行 nested block。 | Parser child blocks 加 StoryEngine loop execution 和 max-step protection。 | 官方 catalog 为 `stubbed`；无 child-block parsing。 |

## 需要 Pixi 和非 Pixi 协同的命令

这些命令不应盲目分配给单一分支。它们要么跨 Pixi/DOM/R3F/app state，要么官方语义是泛 actor/scene 概念，会跨越 V-Ronpa 的 renderer 边界。

| 命令 | 语义 | 设计模块 | 当前进展 |
|---|---|---|---|
| `camera` | 修改 camera offset、roll/rotation、zoom、ortho、post-process toggles、easing/time/wait。 | 按 presentation profile 路由：`vn2d` 下是 Pixi 2D camera/filter，`vn3d`/trial 下是 R3F camera rig，并需要 app route table 协调。 | 官方 catalog 为 `stubbed`；无 compiler normalization 或下游 handler。需要 profile-aware 设计；在本架构中不是纯 Pixi 命令。 |
| `choiceHandler` | 修改 choice handler actor 的 appearance/default/transform。 | DOM choice UI state 加可能的 Pixi/animation 表现；StoryEngine 拥有 choice 语义。 | 官方 catalog 为 `stubbed`；无 runtime 行为。完整 actor-transform parity 与当前 DOM-owned choice UI 不直接匹配，需要先设计。 |
| `hide` | 隐藏指定 generic actor(s)：character、background、printer、choice handler 等。 | 需要在 Pixi actors 和 DOM UI actors 之间拆分 target resolution。 | 官方 catalog 为 `stubbed`；无 runtime 行为。`hideChars` 是当前 Pixi-only 的窄命令。 |
| `hideAll` | 隐藏所有 generic actors。 | 跨 Pixi stage、DOM printers/choices，未来也可能跨 R3F staged actors。 | 官方 catalog 为 `stubbed`；无 runtime 行为。对 Pixi-only 分支过宽。 |
| `hidePrinter` | 隐藏 text printer。 | DOM dialog/printer state；可能需要 story-play/input 协调。 | 官方 catalog 为 `stubbed`；无 runtime 行为。不是 Pixi，但会影响 text display state。 |
| `hideUI` | 隐藏 UI 元素或整个 UI，可选 toggle 和 wait。 | App shell/UI overlay state、capabilities、input locks，可能还需要 Pixi wait 协调 fade。 | 官方 catalog 为 `stubbed`；无 runtime 行为。需要 app policy，避免隐藏必要的 accessibility/shell controls。 |
| `look` | 配置角色/camera look 行为。 | Pixi character look hints 和/或 R3F avatar/camera 行为。 | 官方 catalog 为 `stubbed`；无 runtime 行为。当前 `char look:` 只是在 character snapshot 上存一个浅层值。 |
| `printer` | 修改 text printer actor、default printer、anchoring、position、appearance 和 transform。 | DOM dialog/printer surface；若在 world 中可视化，可能还要按 renderer profile 映射。 | 官方 catalog 为 `stubbed`；无 runtime 行为。官方 actor-transform 语义不能干净映射到当前 DOM-owned dialog。 |
| `remove` | 从 scene/state 移除 actor(s)。 | Pixi actor snapshot 删除，加 DOM printer/choice handler cleanup，如果目标是 generic actor。 | 官方 catalog 为 `stubbed`；无 runtime 行为。需要 target-resolution policy。 |
| `show` | 显示指定 generic actor(s)。 | 跨 Pixi actors 和 DOM UI actors 拆分。 | 官方 catalog 为 `stubbed`；无 runtime 行为。可与 `hide` 共享逻辑，但不是纯 Pixi。 |
| `spawn` | 用 params 和 transform 实例化任意 prefab/object。 | 在 Unity 中是 prefab lifecycle；在 V-Ronpa 中需要 manifest/R3F/Pixi object factory 和 lifecycle ownership。 | 官方 catalog 为 `stubbed`；无 runtime 行为。如采用，应设计成受限的 V-Ronpa-specific 能力，而非泛 prefab parity。 |
| `trans` | 执行 scene transition effect。 | Pixi full-screen transition 加 StoryEngine/app timing，可能还要协调 background commit 顺序。 | 官方 catalog 为 `stubbed`；无 runtime 行为。明确 transition boundary 后可成为 Pixi-only render hint。 |

## 与当前架构不太契合的命令

这些是官方 Naninovel/Unity 概念，不应只为 parity 盲目实现。如果后续出现真实游戏用例，优先设计明确的 V-Ronpa 命令或 adapter-specific feature。

| 命令 | 语义 | 设计模块 | 当前进展 |
|---|---|---|---|
| `despawn` | 销毁由 `spawn` 创建的 prefab，并可传递 params 和 awaitable 行为。 | 当前不匹配；需要 contracts 中不存在的 generic object lifecycle。 | 官方 catalog 为 `stubbed`；无 runtime 行为。应等 constrained object-spawn contract 存在后再考虑。 |
| `despawnAll` | 销毁所有由 `spawn` 创建的对象。 | 当前不匹配；与 `despawn` 同样的问题。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |
| `enterDialogue` | 当 Naninovel 作为 drop-in dialogue engine 时启用 Naninovel activities。 | V-Ronpa root modes 属于 Navi/Trial directors 和 GameInteractionShell，不应由脚本直接拥有。 | 官方 catalog 为 `stubbed`；无 runtime 行为。不应直接驱动 app mode。 |
| `exitDialogue` | 重置/停用 Naninovel dialogue mode，可选 destroy engine。 | 同 `enterDialogue`；与 director-owned flow 冲突。 | 官方 catalog 为 `stubbed`；无 runtime 行为。优先使用 director/app actions。 |
| `lipSync` | 为特定角色开关 lip sync。 | 依赖角色 renderer 实现，例如 Live2D/Spine/audio。 | 官方 catalog 为 `stubbed`；无 runtime 行为。应等待 character tech stack 确定后再做。 |
| `loadScene` | 加载 Unity scene，可选 additive。 | V-Ronpa 的 maps/scenes 由 manifest/director 驱动，不是 Unity scene loads。 | 官方 catalog 为 `stubbed`；无 runtime 行为。优先使用 Navi/trial director transitions。 |
| `timeline` | 控制 Unity Timeline asset playback。 | 当前 web 架构没有 Unity Timeline 等价物。 | 官方 catalog 为 `stubbed`；无 runtime 行为。除非先设计 web timeline abstraction，否则避免实现。 |
| `unloadScene` | 卸载 additive Unity scene。 | 与 `loadScene` 同样不匹配。 | 官方 catalog 为 `stubbed`；无 runtime 行为。 |

## V-Ronpa 项目命令

| 命令 | 语义 | 设计模块 | 当前进展 |
|---|---|---|---|
| `end` | 结束当前 runtime script。 | StoryEngine control command。 | V-Ronpa catalog 为 `implemented`；StoryEngine 设置 `ended`。 |
| `gameplay` / `gameplay-event` | 发出 typed gameplay event，例如 grant/remove item/evidence 或 character state change。 | Compiler normalization 加 app transaction 转为 `GameplayEvent`，由 `packages/gameplay` 消费。 | V-Ronpa catalog 为 `implemented`；transaction 映射支持的 event types。 |
| `charenter` / `char-enter` | 旧脚本迁移命令。 | 仅用于 debug/migration。 | V-Ronpa catalog 为 `stubbed`；route table 只发到 debug。新脚本应使用官方 `char`。 |
| `flash` | 屏幕 flash。 | Pixi transient effect。 | 已实现；见纯 Pixi 表。 |
| `focus` | 视觉 focus cue。 | Pixi transient/focus effect。 | Catalog/compiler/routing 已实现，Pixi reducer 缺失。 |
| `trialkeyword` / `trial-keyword` | Debate keyword visual cue。 | Pixi overlay hint；trial logic 仍属于 TrialDefinition。 | 已实现为 Pixi hint，不是 gameplay rule source。 |

## 建议的首批任务

1. Pixi 分支：在 `reducePixiRuntimeCommand` 和 `TransientEffectSystem` 中实现 `focus`；增加 reducer tests 和 visual smoke/screenshot case。
2. Pixi 分支：打磨 `shake`、`glitch`、weather fade/removal、`char/back` transitions；保持 RuntimeCommand shape 不变。
3. 非 Pixi 分支：把 top-level `wait` 实现为 StoryEngine/story-play timing，支持 input/skippable modes；为 timer、input、skip 行为增加 unit tests。
4. 非 Pixi 分支：只有在定义 nested choice block 行为之后再扩展 `choice`/`addChoice`；否则先从 flat `addChoice` 加 `clearChoice` 开始。
5. Integration/CCR：官方 `or` 只能和 parser/compiler block 语义一起加入 catalog，不要做独立 metadata patch。
