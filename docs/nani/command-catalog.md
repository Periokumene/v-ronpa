# VN Command Catalog

`packages/contracts/src/index.ts` owns the command catalog. It is the single
declaration source for `.nani` commands. StoryEngine handler registration,
diagnostics, editor completion/hover metadata, and app routing must derive from this
catalog instead of redefining command metadata elsewhere.

Runtime command ids are lowercase. `canonicalName` preserves the official or
project-facing spelling for diagnostics and tools.

Dialogue text identity is not a top-level command. A dialogue line may include
one Naninovel-style marker such as `|#voice_validation_0001|`; the parser
stores it on `TextIR.textId`, the compiler forwards it as synthetic
`print.params.textId`, and the app may auto-bind voice from the emitted
`print`. Explicit `@voice` and `@stopVoice` remain stubbed commands.

## Command Status Semantics

`NaniCommandStatus` is the command maturity signal. Do not add a parallel
implementation matrix or separate command-readiness entity unless the contract
needs a future CCR.

Status values mean:

- `declared`: the command is present in the catalog, but runtime parameter
  validation and behavior are not yet promised.
- `validated`: the catalog metadata is usable for validation, but execution is
  not yet promised.
- `stubbed`: the command is declared and validation is catalog-driven; when the
  StoryEngine sees it without a handler, it no-ops with a diagnostic.
- `implemented`: V-Ronpa runtime behavior exists and is covered by tests. This
  does not mean full Naninovel compatibility for every official parameter.

For official Naninovel commands, `implemented` means the V-Ronpa-supported
behavior is safe to use in current scripts. Compatible official parameters that
the handler does not consume yet may still produce an
`unsupported-command-param` warning. That warning is expected and does not
demote the command unless the supported V-Ronpa behavior is no longer covered.

Command definitions also expose an `execution` boundary:

- `story-control`: consumed by StoryEngine and normally not emitted downstream.
- `pixi-presentation`: emitted as presentation work and eligible for Pixi
  `wait!` task synchronization.
- `ui-output`: emitted as runtime UI work and eligible for UI surface
  `wait!` transition synchronization when the command supports it.
- `gameplay`: emitted as typed gameplay event input.
- `declared-only`: catalog-declared for compatibility, but outside the current
  execution boundary. The compiler diagnoses these commands instead of silently
  pretending to support them.

Presentation `wait:true` / `wait!` follows the current V-Ronpa/Naninovel
baseline: Wait By Default is false, only explicit wait flags block, and Complete
On Continue is true. StoryEngine creates a `presentationWait` with a channel.
Pixi waits use `channel:"pixi"` and are enriched with `expectedTasks`; Pixi task
completion resumes the story. Runtime UI waits use `channel:"ui"` with concrete
targets and `targetVisible`; UI surface transition completion resumes the story.
Pixi duration is retained as a fallback diagnostic timeout, not as the primary
release mechanism.

The standalone `wait` command remains `stubbed`. Its authored parameters are
validated and StoryEngine emits the normal stub diagnostic/no-op, but this does
not promise timer scheduling, pause accounting, Skip pacing, click feedback, or
combined wait correctness. The generated matrix below is authoritative; use
`pnpm generate:command-docs` after catalog changes and
`pnpm validate:command-docs` in freshness gates.

The generated Pixi effect reference following the matrix uses the same catalog
metadata as editor completion and hover. It documents existing and newly added
effects at one level; development labs and historical design notes are not
authoring authorities.

## Categories

- `text`: dialogue printer, backlog, and text formatting commands.
- `choice`: choice option and choice handler commands.
- `flow`: script control flow, jumps, waits, conditionals, loops, and tracks.
- `state`: variable, rollback, lock, and unlock commands.
- `actor`: character, actor, spawn, despawn, visibility, and staging commands.
- `scene`: background, camera, scene load/unload, and transitions.
- `effect`: filters, weather, screen shake, and visual effects.
- `media`: BGM, SFX, voice, movie, and timeline commands.
- `ui`: UI visibility, input, title, toast, save, URL, and skip commands.

## Runtime Rules

- Naninovel official commands are explicit catalog entries. Unknown top-level
  `@` commands are compiler errors.
- Existing V-Ronpa compatibility params may be attached to an official command
  entry, but each such param must be marked with `source: "v-ronpa"` in the
  catalog. This keeps the official parameter list auditable.
- `nani-runtime-compiler` binds catalog metadata to compiled RuntimeCommand
  output. It rejects or diagnoses commands and params against the catalog.
- Parser IR remains generic. Ordered `CommandIR.args` are the compiler's sole
  binding authority. Parser-derived `primary`/`params`/`flags` remain read
  projections for IR consumers and are never compiler fallback input.
- Optional `primaryParam` authoring metadata maps a command's first positional
  value to one declared parameter. Completion and Hover reuse that parameter's
  catalog docs and allowed values; editor adapters must not duplicate the
  mapping or its enum values.
- The parser returns an exact source-map sidecar beside the IR. The runtime
  compiler consumes both, owns catalog and runtime-boundary diagnostics, and
  emits required source spans without adding provenance to RuntimeCommand.
- Implemented RuntimeCommand params use canonical runtime field names only.

### Static navigation endpoints

`@goto` and `@choice ... goto:` use one parser/linker:

```nani
@goto #LocalLabel
@goto game-a/chapter-02.nani
@goto game-a/chapter-02.nani#Start
@choice "Continue" goto:game-a/chapter-02.nani#Start
```

`#Label` is local to the current script. Cross-script endpoints require a full,
registered logical path ending in `.nani`; an omitted label starts at pointer
zero. Relative or absolute paths, wildcards, dynamic expressions, unknown
scripts, unknown labels, and malformed endpoints are catalog-link errors. File
order never implies navigation, and `@end` completes the whole entry.
  Raw aliases stay in `sourceCommand`.
- `{...}` parameter expressions are preserved by the compiler and evaluated by
  StoryEngine against story variables. The compiler must not replace expression
  params with defaults.
- `children` means the catalog marks the command as child-block capable. This
  baseline does not parse nested command blocks yet.
- First-pass rich text is carried as `RuntimeCommand.richText` beside ordinary
  string `params.text`. Downstream systems must consume the compiled document
  and must not re-parse markup in StoryEngine, ui-kit, or app save adapters.
- `@cue "text"` is a normal StoryText stop with named `author`, `speed`,
  `textId`, and `autoNext` controls. It shares current text, backlog, reveal,
  Auto/Skip, voice, and bleep behavior with `@print`, but keeps its `cue`
  command identity and routes the current record to the centered, borderless
  Cue DOM surface. `@hideCue time:... wait!` fades only that surface and does
  not clear the current StoryText record.
- Explicit static `@print` and `@cue` text accepts staged input stops `[-]` and
  `[wait i]`, but does not parse normal-line controls such as `[< ...]`,
  `|#...|`, or `[>]`; those sequences remain literal command text. The long
  `[wait i]` form requires a quoted explicit body. Dynamic text, conditional
  staged commands, and `@print append:true` do not compile as staged text.
  Named `textId` values use `[A-Za-z0-9_-]+` and participate in the same
  whole-script duplicate check as normal-line text IDs.
- `showUI` / `hideUI` are implemented as a V-Ronpa runtime UI subset. Supported
  targets are `dialog`, `commandBar`, and `toastLayer`; no-target commands apply
  to those three targets only and never affect Cue. `time` is normalized to `durationMs`; missing or
  zero duration settles immediately. `wait!` creates a UI `presentationWait` only
  when all targets are valid. `hud`, debug/harness UI, shell overlays, and
  lifecycle-owned `inputPrompt` / `movieOverlay` are outside the current
  implementation.
- Invalid `showUI` / `hideUI` targets and ignored promoted-primary values are
  compiler diagnostics. Editor adapters must not reimplement those rules.

## Command Matrix (generated)

<!-- BEGIN GENERATED COMMAND CATALOG -->
<!-- Generated by scripts/generate-command-catalog-doc.mjs. Do not edit this block by hand. -->
### Official Naninovel declarations

| Command | Runtime id | Category | Execution | Params | Primary | Children | Status |
|---|---|---|---|---|---|---|---|
| `addChoice` | `addchoice` | choice | declared-only | choiceSummary:string, id:string, enabled:boolean (V-Ronpa), lock:string, button:string, pos:decimal list, handler:string, goto:string, gosub:string, set:string, show:boolean, time:decimal | none | no | stubbed |
| `append` | `append` | text | story-control | text:string, printer:string, author:string | none | no | implemented |
| `arrange` | `arrange` | actor | pixi-presentation | characterPositions:named decimal list, look:boolean, time:decimal, wait:boolean | none | no | implemented |
| `async` | `async` | flow | declared-only | trackId:string, loop:boolean | none | yes | stubbed |
| `await` | `await` | flow | declared-only | trackId:string, complete:boolean | none | no | stubbed |
| `back` | `back` | scene | pixi-presentation | appearanceAndTransition:named string, pos:decimal list, id:string, appearance:string, pose:string, via:string, params:decimal list, dissolve:string, visible:boolean, position:decimal list, rotation:decimal list, scale:decimal list, tint:string, easing:string, time:decimal, lazy:boolean, wait:boolean, effect:string (V-Ronpa) | none | no | implemented |
| `bgm` | `bgm` | media | media-output | bgmPath:string, intro:string, volume:decimal, loop:boolean, fade:decimal, group:string, time:decimal, wait:boolean | none | no | implemented |
| `blur` | `blur` | effect | pixi-presentation | actorId:string, power:decimal, time:decimal, wait:boolean | none | no | implemented |
| `bokeh` | `bokeh` | effect | pixi-presentation | focus:string, dist:decimal, power:decimal, time:decimal, wait:boolean | none | no | implemented |
| `camera` | `camera` | scene | declared-only | offset:decimal list, roll:decimal, rotation:decimal list, zoom:decimal, ortho:boolean, toggle:string list, set:named boolean list, easing:string, time:decimal, lazy:boolean, wait:boolean | none | no | stubbed |
| `char` | `char` | actor | pixi-presentation | idAndAppearance:named string, look:string, avatar:string, pos:decimal list, id:string, appearance:string, pose:string, via:string, params:decimal list, dissolve:string, visible:boolean, position:decimal list, rotation:decimal list, scale:decimal list, tint:string, easing:string, time:decimal, lazy:boolean, wait:boolean | none | no | implemented |
| `choice` | `choice` | choice | story-control | choiceSummary:string, id:string, enabled:boolean (V-Ronpa), lock:string, button:string, pos:decimal list, handler:string, goto:string, gosub:string, set:string, show:boolean, time:decimal | none | no | implemented |
| `choiceHandler` | `choicehandler` | choice | declared-only | handlerId:string, default:boolean, id:string, appearance:string, pose:string, via:string, params:decimal list, dissolve:string, visible:boolean, position:decimal list, rotation:decimal list, scale:decimal list, tint:string, easing:string, time:decimal, lazy:boolean, wait:boolean | none | no | stubbed |
| `clearBacklog` | `clearbacklog` | text | story-control | none | none | no | implemented |
| `clearChoice` | `clearchoice` | choice | story-control | handlerId:string, id:string, hide:boolean | none | no | implemented |
| `despawn` | `despawn` | actor | declared-only | path:string, params:string list, wait:boolean | none | no | stubbed |
| `despawnAll` | `despawnall` | actor | declared-only | wait:boolean | none | no | stubbed |
| `else` | `else` | flow | declared-only | none | none | yes | stubbed |
| `endIf` | `endif` | flow | declared-only | none | none | no | stubbed |
| `enterDialogue` | `enterdialogue` | text | declared-only | none | none | no | stubbed |
| `exitDialogue` | `exitdialogue` | text | declared-only | destroy:boolean | none | no | stubbed |
| `format` | `format` | text | declared-only | templates:named string list, printer:string | none | no | stubbed |
| `glitch` | `glitch` | effect | pixi-presentation | time:decimal, power:decimal, blockJump:decimal, burstJump:decimal, pixelScatter:decimal, colorNoise:decimal, speed:decimal, seed:decimal, wait:boolean | none | no | implemented |
| `glitchFilter` | `glitchfilter` | effect | pixi-presentation | time:decimal, easing:string, power:decimal, blockJump:decimal, burstJump:decimal, pixelScatter:decimal, colorNoise:decimal, speed:decimal, seed:decimal, wait:boolean | none | no | implemented |
| `gosub` | `gosub` | flow | declared-only | path:string | none | no | stubbed |
| `goto` | `goto` | flow | story-control | path:string, reset:string list, hold:boolean, release:boolean | none | no | implemented |
| `group` | `group` | flow | declared-only | none | none | yes | stubbed |
| `hide` | `hide` | actor | declared-only | actorIds:string list, time:decimal, lazy:boolean, wait:boolean | none | no | stubbed |
| `hideAll` | `hideall` | actor | declared-only | time:decimal, lazy:boolean, wait:boolean | none | no | stubbed |
| `hideChars` | `hidechars` | actor | pixi-presentation | time:decimal, lazy:boolean, wait:boolean | none | no | implemented |
| `hidePrinter` | `hideprinter` | text | declared-only | printerId:string, time:decimal, wait:boolean | none | no | stubbed |
| `hideUI` | `hideui` | ui | ui-output | uINames:string list, allowToggle:boolean, time:decimal, wait:boolean, target:string (V-Ronpa) | none | no | implemented |
| `if` | `if` | flow | declared-only | expression:string | none | yes | stubbed |
| `input` | `input` | ui | story-control | variableName:string, type:string, summary:string, value:string, nostop:boolean | none | no | implemented |
| `lipSync` | `lipsync` | actor | declared-only | charIdAndAllow:named boolean | none | no | stubbed |
| `loadScene` | `loadscene` | scene | declared-only | sceneName:string, additive:boolean | none | no | stubbed |
| `lock` | `lock` | state | declared-only | id:string | none | no | stubbed |
| `look` | `look` | actor | declared-only | enable:boolean, zone:decimal list, speed:decimal list, gravity:boolean | none | no | stubbed |
| `movie` | `movie` | media | media-output | moviePath:string, time:decimal, block:boolean | none | no | implemented |
| `openURL` | `openurl` | ui | declared-only | uRL:string, target:string | none | no | stubbed |
| `print` | `print` | text | story-control | text:string, printer:string, author:string, as:string, speed:decimal, textId:string (V-Ronpa), autoNext:boolean (V-Ronpa), reset:boolean, default:boolean, waitInput:boolean, append:boolean, fadeTime:decimal, wait:boolean | none | no | implemented |
| `printer` | `printer` | text | declared-only | idAndAppearance:named string, default:boolean, hideOther:boolean, anchor:boolean, pos:decimal list, id:string, appearance:string, pose:string, via:string, params:decimal list, dissolve:string, visible:boolean, position:decimal list, rotation:decimal list, scale:decimal list, tint:string, easing:string, time:decimal, lazy:boolean, wait:boolean | none | no | stubbed |
| `processInput` | `processinput` | ui | declared-only | inputEnabled:boolean, set:named boolean list | none | no | stubbed |
| `purgeRollback` | `purgerollback` | state | declared-only | none | none | no | stubbed |
| `rain` | `rain` | effect | pixi-presentation | power:decimal, wind:decimal, hue:decimal, tint:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `random` | `random` | flow | declared-only | weight:decimal list | none | yes | stubbed |
| `remove` | `remove` | actor | declared-only | actorIds:string list | none | no | stubbed |
| `resetState` | `resetstate` | state | declared-only | exclude:string list, only:string list | none | no | stubbed |
| `resetText` | `resettext` | text | story-control | printerId:string | none | no | implemented |
| `return` | `return` | flow | declared-only | reset:string list | none | no | stubbed |
| `save` | `save` | ui | declared-only | at:string | none | no | stubbed |
| `set` | `set` | state | story-control | expression:string | none | no | implemented |
| `sfx` | `sfx` | media | media-output | sfxPath:string, volume:decimal, loop:boolean, fade:decimal, group:string, time:decimal, wait:boolean | none | no | implemented |
| `sfxFast` | `sfxfast` | media | media-output | sfxPath:string, volume:decimal, restart:boolean, additive:boolean, group:string, wait:boolean | none | no | implemented |
| `shake` | `shake` | effect | pixi-presentation | actorId:string, count:integer, loop:boolean, time:decimal, deltaTime:decimal, power:decimal, deltaPower:decimal, hor:boolean, ver:boolean, wait:boolean, target:string (V-Ronpa), intensity:decimal (V-Ronpa), duration:decimal (V-Ronpa) | none | no | implemented |
| `show` | `show` | actor | declared-only | actorIds:string list, time:decimal, lazy:boolean, wait:boolean | none | no | stubbed |
| `showPrinter` | `showprinter` | text | story-control | printerId:string, time:decimal, wait:boolean | none | no | implemented |
| `showUI` | `showui` | ui | ui-output | uINames:string list, time:decimal, wait:boolean, target:string (V-Ronpa), visible:boolean (V-Ronpa) | none | no | implemented |
| `skip` | `skip` | ui | declared-only | enable:boolean | none | no | stubbed |
| `slide` | `slide` | actor | pixi-presentation | idAndAppearance:named string, from:decimal list, to:decimal list, visible:boolean, easing:string, time:decimal, lazy:boolean, wait:boolean | none | no | implemented |
| `snow` | `snow` | effect | pixi-presentation | power:decimal, time:decimal, xSpeed:decimal, ySpeed:decimal, density:decimal, flakeScale:decimal, sway:decimal, fog:decimal, noise:decimal, seed:decimal, pos:decimal list, position:decimal list, rotation:decimal list, scale:decimal list, wait:boolean | none | no | implemented |
| `spawn` | `spawn` | actor | declared-only | path:string, params:string list, pos:decimal list, position:decimal list, rotation:decimal list, scale:decimal list, wait:boolean | none | no | stubbed |
| `stop` | `stop` | flow | declared-only | trackId:string | none | no | stubbed |
| `stopBgm` | `stopbgm` | media | media-output | bgmPath:string, fade:decimal, wait:boolean, group:string (V-Ronpa) | none | no | implemented |
| `stopSfx` | `stopsfx` | media | media-output | sfxPath:string, fade:decimal, wait:boolean, group:string (V-Ronpa) | none | no | implemented |
| `stopVoice` | `stopvoice` | media | declared-only | none | none | no | stubbed |
| `sun` | `sun` | effect | pixi-presentation | power:decimal, time:decimal, pos:decimal list, position:decimal list, rotation:decimal list, scale:decimal list, wait:boolean | none | no | implemented |
| `sync` | `sync` | flow | declared-only | trackId:string | none | no | stubbed |
| `timeline` | `timeline` | media | declared-only | name:string, stop:boolean, pause:boolean, resume:boolean, wait:boolean | none | no | stubbed |
| `title` | `title` | ui | declared-only | none | none | no | stubbed |
| `toast` | `toast` | ui | ui-output | text:string, appearance:string, time:decimal | none | no | implemented |
| `trans` | `trans` | scene | declared-only | transition:string, params:decimal list, dissolve:string, easing:string, time:decimal | none | no | stubbed |
| `unless` | `unless` | flow | declared-only | expression:string | none | yes | stubbed |
| `unloadScene` | `unloadscene` | scene | declared-only | sceneName:string | none | no | stubbed |
| `unlock` | `unlock` | state | declared-only | id:string | none | no | stubbed |
| `voice` | `voice` | media | declared-only | voicePath:string, volume:decimal, group:string, authorId:string | none | no | stubbed |
| `wait` | `wait` | flow | story-control | waitMode:string | none | no | stubbed |
| `while` | `while` | flow | declared-only | expression:string | none | yes | stubbed |

### V-Ronpa project declarations

| Command | Runtime id | Category | Execution | Params | Primary | Children | Status |
|---|---|---|---|---|---|---|---|
| `afterimage` | `afterimage` | effect | pixi-presentation | target:string, power:decimal, count:integer, offset:decimal list, decay:decimal, tint:string, edge:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `charenter` | `charenter` | actor | declared-only | character:string, appearanceExpression:string, effect:string | none | no | stubbed |
| `charTone` | `chartone` | effect | pixi-presentation | preset:string, amount:decimal, time:decimal, wait:boolean | preset | no | implemented |
| `cue` | `cue` | text | story-control | text:string (V-Ronpa), author:string (V-Ronpa), speed:decimal (V-Ronpa), textId:string (V-Ronpa), autoNext:boolean (V-Ronpa) | text | no | implemented |
| `end` | `end` | flow | story-control | none | none | no | implemented |
| `flash` | `flash` | effect | pixi-presentation | color:string, duration:decimal, wait:boolean | none | no | implemented |
| `flicker` | `flicker` | effect | pixi-presentation | power:decimal, bursts:integer, irregularity:decimal, invert:decimal, white:decimal, tear:decimal, chroma:decimal, seed:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `gameplay` | `gameplay` | state | gameplay | type:string, id:string, quantity:integer, item:string, itemId:string, evidence:string, evidenceId:string, character:string, characterId:string, status:string, skill:string, skillId:string, delta:integer, affinityDelta:integer | none | no | implemented |
| `hideCue` | `hidecue` | ui | ui-output | time:decimal (V-Ronpa), wait:boolean (V-Ronpa) | none | no | implemented |
| `impact` | `impact` | effect | pixi-presentation | power:decimal, origin:decimal list, direction:decimal, smear:decimal, chroma:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `inback` | `inback` | scene | pixi-presentation | appearanceAndTransition:named string, appearance:string, via:string, effect:string, visible:boolean, easing:string, time:decimal, wait:boolean | none | no | implemented |
| `pinp` | `pinp` | ui | ui-output | assetId:string (V-Ronpa), pos:decimal list (V-Ronpa), height:decimal (V-Ronpa), ratio:decimal list (V-Ronpa), alt:string (V-Ronpa), effect:string (V-Ronpa), time:decimal (V-Ronpa), visible:boolean (V-Ronpa) | assetId | no | implemented |
| `pulse` | `pulse` | effect | pixi-presentation | power:decimal, rate:decimal, origin:decimal list, echoes:integer, expansion:decimal, edge:decimal, distortion:decimal, chroma:decimal, decay:decimal, color:string, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `shutter` | `shutter` | effect | pixi-presentation | power:decimal, shape:string, color:string, hold:decimal, skew:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `signalMask` | `signalmask` | effect | pixi-presentation | target:string, power:decimal, bands:decimal, noise:decimal, chroma:decimal, speed:decimal, threshold:decimal, seed:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `staticFilter` | `staticfilter` | effect | pixi-presentation | power:decimal, density:decimal, scanline:decimal, jitter:decimal, warp:decimal, grainSize:decimal, speed:decimal, vignette:decimal, palette:string, seed:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `trialkeyword` | `trialkeyword` | ui | pixi-presentation | id:string, text:string, speaker:string, evidence:string | none | no | implemented |
| `vignette` | `vignette` | effect | pixi-presentation | power:decimal, radius:decimal, softness:decimal, color:string, breathe:decimal, grain:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `waterVeil` | `waterveil` | effect | pixi-presentation | power:decimal, level:decimal, ripple:decimal, drift:decimal, blur:decimal, tint:string, droplets:decimal, seed:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |

### Implemented Pixi effect command reference

This section is generated from the same `commandCatalog` metadata used by parser diagnostics, editor completion, and hover. Existing and newly added effects use one format and one authority.

#### `@afterimage`

对舞台、镜头或当前存在的演员播放一次边缘与高光残影；该瞬时效果结束后自动清理。

**示例**

```nani
@afterimage target:stage power:0.7 count:4 offset:-1.5,0 decay:0.7 tint:#9fc2c7 edge:0.55 time:0.65 easing:easeOut wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `target` | string | 否 | `stage` | — | — | 残影采样目标；可写 stage、camera，或当前存在的角色、背景 actor ID。 |
| `power` | decimal | 否 | `0.7` | 0..1 | — | 残影总体混合强度。 |
| `count` | integer | 否 | `4` | 1..6 integer | — | 同屏残影层数。 |
| `offset` | decimal list | 否 | `-1.5,0` | percent | — | 相邻残影的二维偏移，使用 Nani 场景百分比坐标。 |
| `decay` | decimal | 否 | `0.7` | 0..1 | — | 后续残影逐层衰减的速度。 |
| `tint` | string | 否 | `#9fc2c7` | hex color | — | 残影边缘与高光的十六进制着色。 |
| `edge` | decimal | 否 | `0.55` | 0..1 | — | 边缘与高光提取强度。 |
| `time` | decimal | 否 | `0.65` | >= 0 seconds；必须大于 0。 | — | 本次瞬时残影的总播放时间，必须大于 0。 |
| `easing` | string | 否 | `easeOut` | — | `linear`, `easeIn`, `easeOut`, `easeInOut` | 残影动画缓动。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@blur`

对舞台或演员应用模糊效果，通常用于焦点转移或回忆演出；time 会插值 actor/stage blur 强度，power:0 time:x 会淡出后移除 blur。

**示例**

```nani
@blur stage power:0.4 time:0.3 wait!
@blur actorId:MainBackground power:0 time:0.2 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `actorId` | string | 否 | — | — | — | 目标演员或舞台对象 ID。 |
| `power` | decimal | 否 | — | 0..1 | — | 效果强度。 |
| `time` | decimal | 否 | — | >= 0 seconds | — | 命令动画、媒体或 UI 过渡时间。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@bokeh`

应用景深虚化效果，可调焦点、距离和强度；time 会插值 bokeh 强度，power:0 time:x 会淡出 overlay/root blur 后清理。

**示例**

```nani
@bokeh focus:Felix power:0.6 time:0.4
@bokeh power:0 time:0.2 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `focus` | string | 否 | — | — | — | 聚焦目标或景深焦点。 |
| `dist` | decimal | 否 | — | >= 0 | — | 景深距离参数。 |
| `power` | decimal | 否 | — | 0..1 | — | 效果强度。 |
| `time` | decimal | 否 | — | >= 0 seconds | — | 命令动画、媒体或 UI 过渡时间。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@charTone`

为当前脚本中的全部角色应用代码级多色环境光预设；amount 是无量纲强度倍率，time 使用内部固定缓动插值，none 或 amount:0 会移除效果。

**示例**

```nani
@charTone rain
@charTone fog amount:1.25 time:0.4 wait!
@charTone none time:0.3 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `preset` | string | 否 | — | — | `rain`, `fog`, `sunset`, `night`, `alert`, `fluorescent`, `none` | 代码级预设名称。 |
| `amount` | decimal | 否 | `1` | 0..2 multiplier；不设硬上限；0 会移除效果，超过 2 属于 overdrive。 | — | 无量纲效果强度倍率。 |
| `time` | decimal | 否 | `0` | >= 0 seconds | — | 命令动画、媒体或 UI 过渡时间。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@flash`

播放一次屏幕闪光效果，可指定颜色、持续时间和是否等待。

**示例**

```nani
@flash color:#ffffff duration:160 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `color` | string | 否 | — | — | — | 颜色值，建议使用十六进制颜色。 |
| `duration` | decimal | 否 | `160` | >= 0 ms | — | 持续时间。不同命令可能使用毫秒或 runtime 专用单位。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@flicker`

播放一次不规则黑切、反相、闪白、色差和扫描撕裂组成的全屏瞬时闪烁；可能触发光敏不适。

**示例**

```nani
@flicker power:1 bursts:4 irregularity:0.65 invert:0.75 white:0.7 tear:0.65 chroma:0.35 seed:1 time:0.45 easing:linear wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `power` | decimal | 否 | `1` | 0..1 | — | 整组故障闪烁的总体强度。 |
| `bursts` | integer | 否 | `4` | 1..32 integer | — | 不规则闪烁脉冲次数。 |
| `irregularity` | decimal | 否 | `0.65` | 0..1 | — | 各次脉冲时序与强度的不规则程度。 |
| `invert` | decimal | 否 | `0.75` | 0..1 | — | 反相脉冲所占强度。 |
| `white` | decimal | 否 | `0.7` | 0..1 | — | 白色闪光脉冲所占强度。 |
| `tear` | decimal | 否 | `0.65` | 0..1 | — | 扫描撕裂与分段位移强度。 |
| `chroma` | decimal | 否 | `0.35` | 0..1 | — | 红蓝通道分离强度。 |
| `seed` | decimal | 否 | `1` | — | — | 有限小数随机种子；相同值复现相同闪烁节奏。 |
| `time` | decimal | 否 | `0.45` | >= 0 seconds；必须大于 0；高频设置需要光敏风险复核。 | — | 整组瞬时闪烁的总播放时间，必须大于 0。 |
| `easing` | string | 否 | `linear` | — | `linear`, `easeIn`, `easeOut`, `easeInOut` | 闪烁包络缓动。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@glitch`

播放一次故障干扰效果，适合快速冲击演出。

**示例**

```nani
@glitch power:0.8 time:0.25
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `time` | decimal | 否 | `1` | >= 0 seconds | — | 本次瞬时故障的总播放时间。 |
| `power` | decimal | 否 | `1` | 0..1 | — | 故障滤镜的总体强度。 |
| `blockJump` | decimal | 否 | `1` | 0..2；超过 1 属于 overdrive。 | — | 故障块跳动强度。 |
| `burstJump` | decimal | 否 | `1` | 0..2；超过 1 属于 overdrive。 | — | 故障爆发跳动强度。 |
| `pixelScatter` | decimal | 否 | `1` | 0..2；超过 1 属于 overdrive。 | — | 故障像素散布强度。 |
| `colorNoise` | decimal | 否 | `1` | 0..2；超过 1 属于 overdrive。 | — | 故障色彩噪声强度。 |
| `speed` | decimal | 否 | `1` | >= 0 multiplier | — | 故障噪声与块跳变随时间刷新的速度倍率。 |
| `seed` | decimal | 否 | `0` | — | — | 有限小数随机种子；相同值复现相同故障结构。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@glitchFilter`

设置持久故障滤镜参数，适合一段场景内持续干扰；time 会插值连续参数，seed 等离散参数在 transition start 切换，power:0 time:x 会淡出移除。

**示例**

```nani
@glitchFilter power:0.35 speed:1.2 time:0.25 wait!
@glitchFilter power:0 time:0.3 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `time` | decimal | 否 | `0` | >= 0 seconds | — | 启用、更新或移除持续故障滤镜时的过渡时间。 |
| `easing` | string | 否 | `easeOut` | — | `linear`, `easeIn`, `easeOut`, `easeInOut` | 持续参数过渡缓动。 |
| `power` | decimal | 否 | `0` | 0..1 | — | 持续故障滤镜的总体强度；0 会移除效果。 |
| `blockJump` | decimal | 否 | `1` | 0..2；超过 1 属于 overdrive。 | — | 故障块跳动强度。 |
| `burstJump` | decimal | 否 | `1` | 0..2；超过 1 属于 overdrive。 | — | 故障爆发跳动强度。 |
| `pixelScatter` | decimal | 否 | `1` | 0..2；超过 1 属于 overdrive。 | — | 故障像素散布强度。 |
| `colorNoise` | decimal | 否 | `1` | 0..2；超过 1 属于 overdrive。 | — | 故障色彩噪声强度。 |
| `speed` | decimal | 否 | `1` | >= 0 multiplier | — | 故障噪声与块跳变随时间刷新的速度倍率。 |
| `seed` | decimal | 否 | `0` | — | — | 有限小数随机种子；相同值复现相同故障结构。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@impact`

播放一次全屏方向性冲击、边缘扩张、色差和弹性回稳；该瞬时效果结束后自动清理。

**示例**

```nani
@impact power:1 origin:50,50 direction:0 smear:0.6 chroma:0.25 time:0.22 easing:easeOut wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `power` | decimal | 否 | `1` | 0..1 | — | 冲击形变与曝光的总体强度。 |
| `origin` | decimal list | 否 | `50,50` | 0..100 percent | — | 冲击中心，使用 0..100 的 Nani 场景百分比坐标。 |
| `direction` | decimal | 否 | `0` | degrees | — | 方向性拖影角度。 |
| `smear` | decimal | 否 | `0.6` | 0..1 | — | 冲击阶段的方向性拖影长度。 |
| `chroma` | decimal | 否 | `0.25` | 0..1 | — | 冲击阶段的红蓝通道分离强度。 |
| `time` | decimal | 否 | `0.22` | >= 0 seconds；必须大于 0。 | — | 冲击压缩、拖影与回稳的总播放时间，必须大于 0。 |
| `easing` | string | 否 | `easeOut` | — | `linear`, `easeIn`, `easeOut`, `easeInOut` | 冲击恢复阶段缓动。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@pulse`

设置全屏持续双搏脉冲；只扩张提取出的轮廓和高光残影，不周期缩放底图；power:0 可移除。

**示例**

```nani
@pulse power:0.6 rate:92 origin:50,52 echoes:3 expansion:0.035 edge:0.65 distortion:0.35 chroma:0.18 decay:0.72 color:#b8d6d8 time:0.6
@pulse power:0 time:0.4 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `power` | decimal | 否 | `0.6` | 0..1 | — | 脉冲轮廓、折射与色差的总体强度；0 会移除效果。 |
| `rate` | decimal | 否 | `92` | >= 0 beats/minute；必须大于 0。 | — | 双搏脉冲的节拍速度。 |
| `origin` | decimal list | 否 | `50,52` | 0..100 percent | — | 脉冲扩张中心，使用 0..100 的 Nani 场景百分比坐标。 |
| `echoes` | integer | 否 | `3` | 1..4 integer | — | 同屏保留的扩张轮廓层数。 |
| `expansion` | decimal | 否 | `0.035` | 0..0.2 normalized viewport | — | 每层轮廓相对画面的扩张步长。 |
| `edge` | decimal | 否 | `0.65` | 0..1 | — | 轮廓与高光提取强度。 |
| `distortion` | decimal | 否 | `0.35` | 0..1 | — | 脉冲轮廓造成的局部折射强度。 |
| `chroma` | decimal | 否 | `0.18` | 0..1 | — | 脉冲轮廓的红蓝通道分离强度。 |
| `decay` | decimal | 否 | `0.72` | 0..1 | — | 旧轮廓随回波层数衰减的速度。 |
| `color` | string | 否 | `#b8d6d8` | — | — | 脉冲轮廓的十六进制颜色。 |
| `time` | decimal | 否 | `0` | >= 0 seconds | — | 启用、更新或移除脉冲时的过渡时间。 |
| `easing` | string | 否 | `easeOut` | — | `linear`, `easeIn`, `easeOut`, `easeInOut` | 持续参数过渡缓动。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@rain`

设置雨天粒子效果参数；time 会把当前渲染中的 power、wind、hue、tint 插值到目标值，power:0 time:x 会淡出后清理雨层。

**示例**

```nani
@rain power:0.5 wind:-0.2 hue:215 tint:0.55 time:0.4
@rain power:0 time:0.2 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `power` | decimal | 否 | — | 0..1 | — | 效果强度。 |
| `wind` | decimal | 否 | — | -1..1 | — | 雨或粒子的横向风力。 |
| `hue` | decimal | 否 | — | 0..360 deg | — | 色相角度。 |
| `tint` | decimal | 否 | — | 0..2 | — | 着色强度或颜色值，语义取决于命令。 |
| `time` | decimal | 否 | — | >= 0 seconds | — | 命令动画、媒体或 UI 过渡时间。 |
| `easing` | string | 否 | — | — | — | 缓动函数名称。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@shake`

对舞台或目标播放震动效果，可设置次数、强度、方向和等待。

**示例**

```nani
@shake target:stage power:0.5 count:3 duration:150 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `actorId` | string | 否 | — | — | — | 目标演员或舞台对象 ID。 |
| `count` | integer | 否 | — | >= 1 | — | 重复次数或震动次数。 |
| `loop` | boolean | 否 | — | — | `true`, `false` | 是否循环播放。 |
| `time` | decimal | 否 | — | >= 0 seconds | — | 命令动画、媒体或 UI 过渡时间。 |
| `deltaTime` | decimal | 否 | — | >= 0 seconds | — | 震动子步骤间隔。 |
| `power` | decimal | 否 | — | 0..1 | — | 效果强度。 |
| `deltaPower` | decimal | 否 | — | — | — | 震动强度每次变化量。 |
| `hor` | boolean | 否 | — | — | `true`, `false` | 是否启用水平震动。 |
| `ver` | boolean | 否 | — | — | `true`, `false` | 是否启用垂直震动。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |
| `target` | string | 否 | — | — | — | 目标 UI、舞台或演员 ID。 |
| `intensity` | decimal | 否 | — | 0..1 | — | 效果强度。 |
| `duration` | decimal | 否 | — | >= 0 | — | 持续时间。不同命令可能使用毫秒或 runtime 专用单位。 |

#### `@shutter`

播放一次全屏眼睑、虹膜或切片形态的非对称闭合快门；该瞬时效果结束后自动清理。

**示例**

```nani
@shutter power:1 shape:eyelid color:#020304 hold:0.08 skew:0.18 time:0.48 easing:linear wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `power` | decimal | 否 | `1` | 0..1 | — | 快门闭合与边缘形变的总体强度。 |
| `shape` | string | 否 | `eyelid` | — | `eyelid`, `iris`, `slice` | 快门闭合几何：眼睑、虹膜或切片。 |
| `color` | string | 否 | `#020304` | — | — | 闭合遮罩的十六进制颜色。 |
| `hold` | decimal | 否 | `0.08` | 0..1 ratio | — | 完整闭合状态占总时长的比例。 |
| `skew` | decimal | 否 | `0.18` | 0..1 | — | 闭合边缘的非对称倾斜强度。 |
| `time` | decimal | 否 | `0.48` | >= 0 seconds；必须大于 0。 | — | 闭合、停留与重新开启的总播放时间，必须大于 0。 |
| `easing` | string | 否 | `linear` | — | `linear`, `easeIn`, `easeOut`, `easeInOut` | 快门开合包络缓动。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@signalMask`

对必填 target 指向的当前角色完整合成容器应用持续信号遮罩，覆盖立绘、表情层和交叉淡化结果；power:0 可移除。

**示例**

```nani
@signalMask target:alice power:0.7 bands:0.8 noise:0.45 chroma:0.25 speed:0.6 threshold:0.5 seed:1 time:0.35
@signalMask target:alice power:0 time:0.3 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `target` | string | 是 | — | — | — | 必填的当前角色 ID；效果应用于该角色合成后的完整外层容器。 |
| `power` | decimal | 否 | `0.7` | 0..1 | — | 信号遮罩破坏的总体强度；0 会移除该角色的效果。 |
| `bands` | decimal | 否 | `0.8` | 0..1 | — | 横向信号条带的密度与可见强度。 |
| `noise` | decimal | 否 | `0.45` | 0..1 | — | 遮罩阈值中使用的随机噪声强度。 |
| `chroma` | decimal | 否 | `0.25` | 0..1 | — | 角色红蓝通道分离强度。 |
| `speed` | decimal | 否 | `0.6` | >= 0 multiplier | — | 条带和噪声随时间移动的速度倍率。 |
| `threshold` | decimal | 否 | `0.5` | 0..1 | — | 决定哪些条带被信号遮罩截断的阈值。 |
| `seed` | decimal | 否 | `1` | — | — | 有限小数随机种子；相同值复现相同遮罩分布。 |
| `time` | decimal | 否 | `0` | >= 0 seconds | — | 启用、更新或移除角色信号遮罩时的过渡时间。 |
| `easing` | string | 否 | `easeOut` | — | `linear`, `easeIn`, `easeOut`, `easeInOut` | 持续参数过渡缓动。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@snow`

设置雪天粒子效果参数；time 会插值连续粒子参数，seed 在 transition start 切换，power:0 time:x 会淡出后清理雪层。

**示例**

```nani
@snow power:0.8 density:0.7 flakeScale:1.1 time:0.4
@snow power:0 time:0.2 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `power` | decimal | 否 | — | 0..1 | — | 效果强度。 |
| `time` | decimal | 否 | — | >= 0 seconds | — | 命令动画、媒体或 UI 过渡时间。 |
| `xSpeed` | decimal | 否 | — | — | — | 粒子横向速度。 |
| `ySpeed` | decimal | 否 | — | — | — | 粒子纵向速度。 |
| `density` | decimal | 否 | — | 0..1 | — | 雪花密度。 |
| `flakeScale` | decimal | 否 | — | >= 0 | — | 雪花粒子缩放。 |
| `sway` | decimal | 否 | — | 0..1 | — | 雪花横向摆动强度。 |
| `fog` | decimal | 否 | — | 0..1 | — | 雪景雾化强度。 |
| `noise` | decimal | 否 | — | 0..1 | — | 粒子或滤镜噪声强度。 |
| `seed` | decimal | 否 | — | — | — | 随机种子，用于稳定粒子或滤镜结果。 |
| `pos` | decimal list | 否 | — | — | — | 位置参数，通常是二维坐标或预设位置。 |
| `position` | decimal list | 否 | — | — | — | 位置向量。 |
| `rotation` | decimal list | 否 | — | — | — | 旋转向量或角度列表。 |
| `scale` | decimal list | 否 | — | >= 0 | — | 缩放向量或倍率。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@staticFilter`

设置全屏持续模拟雪花墙、非均匀扫描线、扫描驱动变形和复古色调；power:0 可移除。

**示例**

```nani
@staticFilter power:0.6 density:0.7 scanline:0.65 jitter:0.45 warp:0.35 grainSize:1 speed:1 vignette:0.35 palette:cold seed:1 time:0.5
@staticFilter power:0 time:0.3 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `power` | decimal | 否 | `0.6` | 0..1 | — | 静电干扰的总体强度；0 会移除效果。 |
| `density` | decimal | 否 | `0.7` | 0..1 | — | 模拟雪花噪点覆盖密度。 |
| `scanline` | decimal | 否 | `0.65` | 0..1 | — | 非均匀扫描线的可见强度。 |
| `jitter` | decimal | 否 | `0.45` | 0..1 | — | 逐扫描带水平抖动强度。 |
| `warp` | decimal | 否 | `0.35` | 0..1 | — | 扫描驱动的画面弯曲强度。 |
| `grainSize` | decimal | 否 | `1` | >= 0 pixels；必须大于 0。 | — | 噪声颗粒尺寸，必须大于 0。 |
| `speed` | decimal | 否 | `1` | >= 0 multiplier | — | 噪点、扫描线和抖动随时间刷新的速度倍率。 |
| `vignette` | decimal | 否 | `0.35` | 0..1 | — | 静电滤镜内部边缘压暗强度。 |
| `palette` | string | 否 | `cold` | — | `cold`, `sepia`, `green`, `mono` | 静电信号的复古调色预设。 |
| `seed` | decimal | 否 | `1` | — | — | 有限小数随机种子；相同值复现相同噪点结构。 |
| `time` | decimal | 否 | `0` | >= 0 seconds | — | 启用、更新或移除静电滤镜时的过渡时间。 |
| `easing` | string | 否 | `easeOut` | — | `linear`, `easeIn`, `easeOut`, `easeInOut` | 持续参数过渡缓动。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@sun`

设置阳光粒子或光效参数；time 会插值连续光效参数，power:0 time:x 会淡出后清理阳光层。

**示例**

```nani
@sun power:0.6 position:0.5,0 time:0.4
@sun power:0 time:0.2 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `power` | decimal | 否 | — | 0..1 | — | 效果强度。 |
| `time` | decimal | 否 | — | >= 0 seconds | — | 命令动画、媒体或 UI 过渡时间。 |
| `pos` | decimal list | 否 | — | — | — | 位置参数，通常是二维坐标或预设位置。 |
| `position` | decimal list | 否 | — | — | — | 位置向量。 |
| `rotation` | decimal list | 否 | — | — | — | 旋转向量或角度列表。 |
| `scale` | decimal list | 否 | — | >= 0 | — | 缩放向量或倍率。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@vignette`

设置全屏持续的有色非均匀暗角和缓慢边缘呼吸；power:0 可移除。

**示例**

```nani
@vignette power:0.5 radius:0.62 softness:0.3 color:#160a10 breathe:0.06 grain:0.03 time:0.4
@vignette power:0 time:0.3 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `power` | decimal | 否 | `0.5` | 0..1 | — | 暗角的总体强度；0 会移除效果。 |
| `radius` | decimal | 否 | `0.62` | 0..1 normalized viewport | — | 保持较亮中心区域的半径。 |
| `softness` | decimal | 否 | `0.3` | 0..1 | — | 暗角边界的羽化宽度。 |
| `color` | string | 否 | `#160a10` | — | — | 暗角覆盖的十六进制颜色。 |
| `breathe` | decimal | 否 | `0.06` | 0..1 | — | 暗角边缘缓慢呼吸起伏的强度。 |
| `grain` | decimal | 否 | `0.03` | 0..1 | — | 暗角区域附加的细颗粒强度。 |
| `time` | decimal | 否 | `0` | >= 0 seconds | — | 启用、更新或移除暗角时的过渡时间。 |
| `easing` | string | 否 | `easeOut` | — | `linear`, `easeIn`, `easeOut`, `easeInOut` | 持续参数过渡缓动。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

#### `@waterVeil`

设置全屏持续的多尺度水流折射、水痕、冷色曲线和潮湿高光；power:0 可移除。

**示例**

```nani
@waterVeil power:0.5 level:0.18 ripple:0.35 drift:-0.1 blur:0.12 tint:#6c8390 droplets:0.5 seed:1 time:0.8
@waterVeil power:0 time:0.4 wait!
```

| 参数 | 类型 | 必填 | 默认值 | 建议范围 | 可选值 | 中文说明 |
|---|---|---|---|---|---|---|
| `power` | decimal | 否 | `0.5` | 0..1 | — | 水幕折射和潮湿高光的总体强度；0 会移除效果。 |
| `level` | decimal | 否 | `0.18` | 0..1 normalized viewport | — | 画面下方积水与水幕覆盖高度。 |
| `ripple` | decimal | 否 | `0.35` | 0..1 | — | 多尺度波纹折射强度。 |
| `drift` | decimal | 否 | `-0.1` | — | — | 水痕纵向漂移的方向与速度；负值向下，正值向上。 |
| `blur` | decimal | 否 | `0.12` | 0..1 | — | 水幕折射采样的柔化强度。 |
| `tint` | string | 否 | `#6c8390` | hex color | — | 水幕冷色曲线与潮湿高光的十六进制颜色。 |
| `droplets` | decimal | 否 | `0.5` | 0..1 | — | 水滴和水痕细节的覆盖强度。 |
| `seed` | decimal | 否 | `1` | — | — | 有限小数随机种子；相同值复现相同水滴分布。 |
| `time` | decimal | 否 | `0` | >= 0 seconds | — | 启用、更新或移除水幕时的过渡时间。 |
| `easing` | string | 否 | `easeOut` | — | `linear`, `easeIn`, `easeOut`, `easeInOut` | 持续参数过渡缓动。 |
| `wait` | boolean | 否 | `false` | — | `true`, `false` | 是否等待表现层或播放流程完成。 |

<!-- END GENERATED COMMAND CATALOG -->

Shared shorthand:

- `pos`, `from`, `to`, and effect `pos` parameters use Naninovel scene
  percent syntax in scripts: `0,0` is bottom-left and `100,100` is top-right.
  `pixi-presenter` stores the reduced snapshot as normalized `0..1` values.
- `actor transform params`: `id:string`, `appearance:string`, `pose:string`,
  `via:string`, `params:decimal list`, `dissolve:string`, `visible:boolean`,
  `position:decimal list`, `rotation:decimal list`, `scale:decimal list`,
  `tint:string`, `easing:string`, `time:decimal`, `lazy:boolean`,
  `wait:boolean`.
- Layered characters use `@char Character.Expression` as the only appearance
  syntax. The runtime stores `appearanceExpression` in `PixiStageSnapshot`;
  `appearance:` remains a cataloged Naninovel actor parameter but is not consumed
  by layered `@char`. An omitted `time` on `@char` compiles to the single 120 ms
  character-transition default. Explicit `time` overrides it, `time:0` is
  instantaneous, and initial entrances should declare their intended duration.
  A named `@char Character` defaults `visible:true`, including when the same
  actor was previously hidden by `@hideChars`; use explicit `visible:false` to
  update an actor while keeping it hidden.
  This default does not apply to `@slide`, `@arrange`, or `@hideChars`. Use
  those commands for transform-only changes. `@slide Character.Expression` updates appearance,
  while `@slide Character` is transform-only and does not create a
  `char/<slug>` JSON asset requirement.
- Inner backgrounds use project command `@inback bg/inner/id`. V1 writes the reserved
  `InnerBackground` actor in `PixiStageSnapshot.innerBackgroundsById` and
  supports only appearance, `effect`/`via`, `time`, `easing`, `visible`, and
  `wait`. It is not a `@back` alias and does not expose `id`, transform, tint,
  pose, params, or dissolve controls.
- `rain params`: `power:decimal`, `wind:decimal`, `hue:decimal`,
  `tint:decimal`, `time:decimal`, `easing:string`, `wait:boolean`.
  Runtime and saves store only `rainCommandParams` plus transition timing;
  interpolated `rainSettings` and shader uniforms remain Pixi runtime state.
- `audio params`: `volume:decimal`, `loop:boolean`, `fade:decimal`,
  `group:string`, `time:decimal`, `wait:boolean`.
  BGM playback is always looping: `@bgm loop:` remains an official declared
  Naninovel parameter but is not consumed and produces an
  `unsupported-command-param` diagnostic. For `@sfx`, `loop` remains consumed;
  only looping SFX enters persistent VN media state. Omitted play volume is
  normalized to `0.7` for BGM and `1` for SFX.
- `particle params`: for `snow` and `sun`, `power:decimal`, `time:decimal`,
  `pos:decimal list`, `position:decimal list`, `rotation:decimal list`,
  `scale:decimal list`, `wait:boolean`.

## V-Ronpa Project Commands

Project commands and aliases are included in the generated matrix above; their
status and execution owner come directly from `commandCatalog`.

Compatibility params currently attached to official commands:

- `back.effect:string`
- `shake.target:string`
- `shake.intensity:decimal`
- `shake.duration:decimal`

These are declared as `source: "v-ronpa"` so existing scripts stay warning-free
without pretending those params are Naninovel official.

## Inline Text Tokens

`[< ...]`, `[>]`, `[-]`, and `[wait i]` are inline text tokens, not top-level
`@` commands:

- `[< speed:0.8]` is parsed as an inline command with id `<`. The parser copies
  its params into `TextIR.printParams`, so text presentation can adjust print
  behavior mid-line.
- `[>]` is parsed as an inline command with id `>`. The runtime compiler maps
  its presence to `RuntimeCommand.params.autoNext` on the compiled `print`
  command.
- `[-]` commits the currently accumulated StoryText stage, waits for input,
  and then continues revealing the same logical text entry.
- `[wait i]` is the readable long form of `[-]`. It has the same input-stop
  semantics; timed inline waits are intentionally unsupported.

Ordinary dialogue supports all four tokens. Static `@print` and `@cue` bodies
support only `[-]` and `[wait i]`; unquoted explicit text supports only compact
`[-]`. Escaped forms such as `\[-\]` remain visible text. `@append`, dynamic
expressions, and other explicit commands do not opt into staged parsing.

They are intentionally not part of `commandCatalog`. If they
grow beyond inline text control, add a separate inline-token contract instead of
mixing them with top-level Naninovel commands.

## Dialogue Text Identity

`|#textId|` is a dialogue-line marker, not an inline command and not visible
text. Current rules:

- Only text statements support the marker.
- One text statement may contain at most one marker.
- `textId` is filename-safe: letters, numbers, `_`, and `-`.
- Empty, invalid, multiple, or duplicate same-script textIds produce parser
  diagnostics.
- The marker is stripped before DOM dialog rendering, backlog storage, and
  search-visible text.
- The runtime compiler forwards the original id on the emitted `print` command.
  Generated `voiceIndex[locale][originalTextId]` performs the optional AssetId
  lookup; runtime code never constructs an ID from locale and textId. A resolved
  voice asset wins over configured dialogue bleep fallback.
- `@print`, `@append`, and `@toast` do not interpret `|#...|` as metadata.

## Rich Text Markup

First-pass rich text uses classic HTML-style tags in dialogue text and static
string arguments for `@print`, `@append`, `@choice`, and `@toast`. The compiler
emits plain `params.text` plus optional top-level `richText` with serializable
ranges. Backlog, current text, pending choices, and saves keep that snapshot;
toast remains transient UI state.

Supported tags are `b/strong`, `i/em`, `u`, `s/strike/del`, `mark`,
`small/big`, `sub/sup`, `br`, and `font` with safe `color`, bounded `size`, or
registered `face` values. Supported entities are `&nbsp;`, `&lt;`, `&gt;`,
`&amp;`, and `&quot;`.

`font face` values must be registered FontFace ids such as
`<font face='serif'>... </font>`. `ContentManifest.fonts` maps those ids to an
explicit system family or font AssetId. Renderer code uses the id to select a controlled CSS
variable; scripts cannot inject raw CSS font families, URLs, or `style`
attributes.

Attributes are intentionally strict in the first pass. Non-`font` tags do not
accept attributes, and `font` accepts only `color`, `size`, and `face`. Unknown,
duplicate, malformed, unsupported, or unclosed rich text markup is kept visible
as source text and reported as a parser diagnostic.
