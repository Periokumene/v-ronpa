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
- The parser returns an exact source-map sidecar beside the IR. The runtime
  compiler consumes both, owns catalog and runtime-boundary diagnostics, and
  emits required source spans without adding provenance to RuntimeCommand.
- Implemented RuntimeCommand params use canonical runtime field names only.
  Raw aliases stay in `sourceCommand`.
- `{...}` parameter expressions are preserved by the compiler and evaluated by
  StoryEngine against story variables. The compiler must not replace expression
  params with defaults.
- `children` means the catalog marks the command as child-block capable. This
  baseline does not parse nested command blocks yet.
- First-pass rich text is carried as `RuntimeCommand.richText` beside ordinary
  string `params.text`. Downstream systems must consume the compiled document
  and must not re-parse markup in StoryEngine, ui-kit, or app save adapters.
- `showUI` / `hideUI` are implemented as a V-Ronpa runtime UI subset. Supported
  targets are `dialog`, `commandBar`, and `toastLayer`; no-target commands apply
  to those three targets only. `time` is normalized to `durationMs`; missing or
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

| Command | Runtime id | Category | Execution | Params | Children | Status |
|---|---|---|---|---|---|---|
| `addChoice` | `addchoice` | choice | declared-only | choiceSummary:string, id:string, enabled:boolean (V-Ronpa), lock:string, button:string, pos:decimal list, handler:string, goto:string, gosub:string, set:string, show:boolean, time:decimal | no | stubbed |
| `append` | `append` | text | story-control | text:string, printer:string, author:string | no | implemented |
| `arrange` | `arrange` | actor | pixi-presentation | characterPositions:named decimal list, look:boolean, time:decimal, wait:boolean | no | implemented |
| `async` | `async` | flow | declared-only | trackId:string, loop:boolean | yes | stubbed |
| `await` | `await` | flow | declared-only | trackId:string, complete:boolean | no | stubbed |
| `back` | `back` | scene | pixi-presentation | appearanceAndTransition:named string, pos:decimal list, id:string, appearance:string, pose:string, via:string, params:decimal list, dissolve:string, visible:boolean, position:decimal list, rotation:decimal list, scale:decimal list, tint:string, easing:string, time:decimal, lazy:boolean, wait:boolean, effect:string (V-Ronpa) | no | implemented |
| `bgm` | `bgm` | media | media-output | bgmPath:string, intro:string, volume:decimal, loop:boolean, fade:decimal, group:string, time:decimal, wait:boolean | no | implemented |
| `blur` | `blur` | effect | pixi-presentation | actorId:string, power:decimal, time:decimal, wait:boolean | no | implemented |
| `bokeh` | `bokeh` | effect | pixi-presentation | focus:string, dist:decimal, power:decimal, time:decimal, wait:boolean | no | implemented |
| `camera` | `camera` | scene | declared-only | offset:decimal list, roll:decimal, rotation:decimal list, zoom:decimal, ortho:boolean, toggle:string list, set:named boolean list, easing:string, time:decimal, lazy:boolean, wait:boolean | no | stubbed |
| `char` | `char` | actor | pixi-presentation | idAndAppearance:named string, look:string, avatar:string, pos:decimal list, id:string, appearance:string, pose:string, via:string, params:decimal list, dissolve:string, visible:boolean, position:decimal list, rotation:decimal list, scale:decimal list, tint:string, easing:string, time:decimal, lazy:boolean, wait:boolean | no | implemented |
| `choice` | `choice` | choice | story-control | choiceSummary:string, id:string, enabled:boolean (V-Ronpa), lock:string, button:string, pos:decimal list, handler:string, goto:string, gosub:string, set:string, show:boolean, time:decimal | no | implemented |
| `choiceHandler` | `choicehandler` | choice | declared-only | handlerId:string, default:boolean, id:string, appearance:string, pose:string, via:string, params:decimal list, dissolve:string, visible:boolean, position:decimal list, rotation:decimal list, scale:decimal list, tint:string, easing:string, time:decimal, lazy:boolean, wait:boolean | no | stubbed |
| `clearBacklog` | `clearbacklog` | text | story-control | none | no | implemented |
| `clearChoice` | `clearchoice` | choice | story-control | handlerId:string, id:string, hide:boolean | no | implemented |
| `despawn` | `despawn` | actor | declared-only | path:string, params:string list, wait:boolean | no | stubbed |
| `despawnAll` | `despawnall` | actor | declared-only | wait:boolean | no | stubbed |
| `else` | `else` | flow | declared-only | none | yes | stubbed |
| `endIf` | `endif` | flow | declared-only | none | no | stubbed |
| `enterDialogue` | `enterdialogue` | text | declared-only | none | no | stubbed |
| `exitDialogue` | `exitdialogue` | text | declared-only | destroy:boolean | no | stubbed |
| `format` | `format` | text | declared-only | templates:named string list, printer:string | no | stubbed |
| `glitch` | `glitch` | effect | pixi-presentation | time:decimal, power:decimal, blockJump:decimal, burstJump:decimal, pixelScatter:decimal, colorNoise:decimal, speed:decimal, seed:decimal, wait:boolean | no | implemented |
| `glitchFilter` | `glitchfilter` | effect | pixi-presentation | time:decimal, easing:string, power:decimal, blockJump:decimal, burstJump:decimal, pixelScatter:decimal, colorNoise:decimal, speed:decimal, seed:decimal, wait:boolean | no | implemented |
| `gosub` | `gosub` | flow | declared-only | path:string | no | stubbed |
| `goto` | `goto` | flow | story-control | path:string, reset:string list, hold:boolean, release:boolean | no | implemented |
| `group` | `group` | flow | declared-only | none | yes | stubbed |
| `hide` | `hide` | actor | declared-only | actorIds:string list, time:decimal, lazy:boolean, wait:boolean | no | stubbed |
| `hideAll` | `hideall` | actor | declared-only | time:decimal, lazy:boolean, wait:boolean | no | stubbed |
| `hideChars` | `hidechars` | actor | pixi-presentation | time:decimal, lazy:boolean, wait:boolean | no | implemented |
| `hidePrinter` | `hideprinter` | text | declared-only | printerId:string, time:decimal, wait:boolean | no | stubbed |
| `hideUI` | `hideui` | ui | ui-output | uINames:string list, allowToggle:boolean, time:decimal, wait:boolean, target:string (V-Ronpa) | no | implemented |
| `if` | `if` | flow | declared-only | expression:string | yes | stubbed |
| `input` | `input` | ui | story-control | variableName:string, type:string, summary:string, value:string, nostop:boolean | no | implemented |
| `lipSync` | `lipsync` | actor | declared-only | charIdAndAllow:named boolean | no | stubbed |
| `loadScene` | `loadscene` | scene | declared-only | sceneName:string, additive:boolean | no | stubbed |
| `lock` | `lock` | state | declared-only | id:string | no | stubbed |
| `look` | `look` | actor | declared-only | enable:boolean, zone:decimal list, speed:decimal list, gravity:boolean | no | stubbed |
| `movie` | `movie` | media | media-output | moviePath:string, time:decimal, block:boolean | no | implemented |
| `openURL` | `openurl` | ui | declared-only | uRL:string, target:string | no | stubbed |
| `print` | `print` | text | story-control | text:string, printer:string, author:string, as:string, speed:decimal, reset:boolean, default:boolean, waitInput:boolean, append:boolean, fadeTime:decimal, wait:boolean | no | implemented |
| `printer` | `printer` | text | declared-only | idAndAppearance:named string, default:boolean, hideOther:boolean, anchor:boolean, pos:decimal list, id:string, appearance:string, pose:string, via:string, params:decimal list, dissolve:string, visible:boolean, position:decimal list, rotation:decimal list, scale:decimal list, tint:string, easing:string, time:decimal, lazy:boolean, wait:boolean | no | stubbed |
| `processInput` | `processinput` | ui | declared-only | inputEnabled:boolean, set:named boolean list | no | stubbed |
| `purgeRollback` | `purgerollback` | state | declared-only | none | no | stubbed |
| `rain` | `rain` | effect | pixi-presentation | power:decimal, wind:decimal, hue:decimal, tint:decimal, time:decimal, easing:string, wait:boolean | no | implemented |
| `random` | `random` | flow | declared-only | weight:decimal list | yes | stubbed |
| `remove` | `remove` | actor | declared-only | actorIds:string list | no | stubbed |
| `resetState` | `resetstate` | state | declared-only | exclude:string list, only:string list | no | stubbed |
| `resetText` | `resettext` | text | story-control | printerId:string | no | implemented |
| `return` | `return` | flow | declared-only | reset:string list | no | stubbed |
| `save` | `save` | ui | declared-only | at:string | no | stubbed |
| `set` | `set` | state | story-control | expression:string | no | implemented |
| `sfx` | `sfx` | media | media-output | sfxPath:string, volume:decimal, loop:boolean, fade:decimal, group:string, time:decimal, wait:boolean | no | implemented |
| `sfxFast` | `sfxfast` | media | media-output | sfxPath:string, volume:decimal, restart:boolean, additive:boolean, group:string, wait:boolean | no | implemented |
| `shake` | `shake` | effect | pixi-presentation | actorId:string, count:integer, loop:boolean, time:decimal, deltaTime:decimal, power:decimal, deltaPower:decimal, hor:boolean, ver:boolean, wait:boolean, target:string (V-Ronpa), intensity:decimal (V-Ronpa), duration:decimal (V-Ronpa) | no | implemented |
| `show` | `show` | actor | declared-only | actorIds:string list, time:decimal, lazy:boolean, wait:boolean | no | stubbed |
| `showPrinter` | `showprinter` | text | story-control | printerId:string, time:decimal, wait:boolean | no | implemented |
| `showUI` | `showui` | ui | ui-output | uINames:string list, time:decimal, wait:boolean, target:string (V-Ronpa), visible:boolean (V-Ronpa) | no | implemented |
| `skip` | `skip` | ui | declared-only | enable:boolean | no | stubbed |
| `slide` | `slide` | actor | pixi-presentation | idAndAppearance:named string, from:decimal list, to:decimal list, visible:boolean, easing:string, time:decimal, lazy:boolean, wait:boolean | no | implemented |
| `snow` | `snow` | effect | pixi-presentation | power:decimal, time:decimal, xSpeed:decimal, ySpeed:decimal, density:decimal, flakeScale:decimal, sway:decimal, fog:decimal, noise:decimal, seed:decimal, pos:decimal list, position:decimal list, rotation:decimal list, scale:decimal list, wait:boolean | no | implemented |
| `spawn` | `spawn` | actor | declared-only | path:string, params:string list, pos:decimal list, position:decimal list, rotation:decimal list, scale:decimal list, wait:boolean | no | stubbed |
| `stop` | `stop` | flow | declared-only | trackId:string | no | stubbed |
| `stopBgm` | `stopbgm` | media | media-output | bgmPath:string, fade:decimal, wait:boolean, group:string (V-Ronpa) | no | implemented |
| `stopSfx` | `stopsfx` | media | media-output | sfxPath:string, fade:decimal, wait:boolean, group:string (V-Ronpa) | no | implemented |
| `stopVoice` | `stopvoice` | media | declared-only | none | no | stubbed |
| `sun` | `sun` | effect | pixi-presentation | power:decimal, time:decimal, pos:decimal list, position:decimal list, rotation:decimal list, scale:decimal list, wait:boolean | no | implemented |
| `sync` | `sync` | flow | declared-only | trackId:string | no | stubbed |
| `timeline` | `timeline` | media | declared-only | name:string, stop:boolean, pause:boolean, resume:boolean, wait:boolean | no | stubbed |
| `title` | `title` | ui | declared-only | none | no | stubbed |
| `toast` | `toast` | ui | ui-output | text:string, appearance:string, time:decimal | no | implemented |
| `trans` | `trans` | scene | declared-only | transition:string, params:decimal list, dissolve:string, easing:string, time:decimal | no | stubbed |
| `unless` | `unless` | flow | declared-only | expression:string | yes | stubbed |
| `unloadScene` | `unloadscene` | scene | declared-only | sceneName:string | no | stubbed |
| `unlock` | `unlock` | state | declared-only | id:string | no | stubbed |
| `voice` | `voice` | media | declared-only | voicePath:string, volume:decimal, group:string, authorId:string | no | stubbed |
| `wait` | `wait` | flow | story-control | waitMode:string | no | stubbed |
| `while` | `while` | flow | declared-only | expression:string | yes | stubbed |

### V-Ronpa project declarations

| Command | Runtime id | Category | Execution | Params | Children | Status |
|---|---|---|---|---|---|---|
| `charenter` | `charenter` | actor | declared-only | character:string, appearanceExpression:string, effect:string | no | stubbed |
| `end` | `end` | flow | story-control | none | no | implemented |
| `flash` | `flash` | effect | pixi-presentation | color:string, duration:decimal, wait:boolean | no | implemented |
| `focus` | `focus` | effect | pixi-presentation | target:string, duration:decimal | no | implemented |
| `gameplay` | `gameplay` | state | gameplay | type:string, id:string, quantity:integer, item:string, itemId:string, evidence:string, evidenceId:string, character:string, characterId:string, status:string, skill:string, skillId:string, delta:integer, affinityDelta:integer | no | implemented |
| `inback` | `inback` | scene | pixi-presentation | appearanceAndTransition:named string, appearance:string, via:string, effect:string, visible:boolean, easing:string, time:decimal, wait:boolean | no | implemented |
| `trialkeyword` | `trialkeyword` | ui | pixi-presentation | id:string, text:string, speaker:string, evidence:string | no | implemented |
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
  This default does not apply to `@slide`, `@arrange`, or `@hideChars`. Use
  those commands for transform-only changes. `@slide Character.Expression` updates appearance,
  while `@slide Character` is transform-only and does not create a
  `character-pack` resource reference.
- Inner backgrounds use project command `@inback bg:id`. V1 writes the reserved
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

`[< ...]` and `[>]` are inline text tokens discovered in the parser fixtures and
implementation, not top-level `@` commands:

- `[< speed:0.8]` is parsed as an inline command with id `<`. The parser copies
  its params into `TextIR.printParams`, so text presentation can adjust print
  behavior mid-line.
- `[>]` is parsed as an inline command with id `>`. The runtime compiler maps
  its presence to `RuntimeCommand.params.autoNext` on the compiled `print`
  command.

They are intentionally not part of `commandCatalog` in this baseline. If they
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
- The runtime compiler forwards the id on the emitted `print` command so app
  adapters can plan dialogue audio: resolved `voice:<locale>:<textId>` assets
  win over configured dialogue bleep fallback.
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

`font face` values must be registered font ids such as
`<font face='font:serif'>... </font>`. `ContentManifest.fonts` maps those ids to
font runtime assets. Renderer code uses the id to select a controlled CSS
variable; scripts cannot inject raw CSS font families, URLs, or `style`
attributes.

Attributes are intentionally strict in the first pass. Non-`font` tags do not
accept attributes, and `font` accepts only `color`, `size`, and `face`. Unknown,
duplicate, malformed, unsupported, or unclosed rich text markup is kept visible
as source text and reported as a parser diagnostic.
