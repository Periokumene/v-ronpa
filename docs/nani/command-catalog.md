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
| `signalMask` | `signalmask` | effect | pixi-presentation | target:string, region:string, power:decimal, bands:decimal, noise:decimal, chroma:decimal, speed:decimal, threshold:decimal, seed:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `staticFilter` | `staticfilter` | effect | pixi-presentation | power:decimal, density:decimal, scanline:decimal, jitter:decimal, warp:decimal, grainSize:decimal, speed:decimal, vignette:decimal, palette:string, seed:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `trialkeyword` | `trialkeyword` | ui | pixi-presentation | id:string, text:string, speaker:string, evidence:string | none | no | implemented |
| `vignette` | `vignette` | effect | pixi-presentation | power:decimal, radius:decimal, softness:decimal, color:string, breathe:decimal, grain:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
| `waterVeil` | `waterveil` | effect | pixi-presentation | power:decimal, level:decimal, ripple:decimal, drift:decimal, blur:decimal, tint:string, droplets:decimal, seed:decimal, time:decimal, easing:string, wait:boolean | none | no | implemented |
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
