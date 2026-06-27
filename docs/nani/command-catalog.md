# VN Command Catalog

`packages/contracts/src/index.ts` owns the command catalog. It is the single
declaration source for `.nani` commands. StoryEngine handler registration,
diagnostics, future editor support, and app routing must derive from this
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
- `gameplay`: emitted as typed gameplay event input.
- `declared-only`: catalog-declared for compatibility, but outside the current
  execution boundary. The compiler diagnoses these commands instead of silently
  pretending to support them.

Pixi `wait:true` / `wait!` follows the current V-Ronpa/Naninovel baseline:
Wait By Default is false, only explicit wait flags block, and Complete On
Continue is true. StoryEngine creates a `presentationWait`, app transaction
code enriches it with Pixi `expectedTasks`, and Pixi task completion resumes the
story. Duration is retained as a fallback diagnostic timeout, not as the primary
release mechanism.

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
- Parser IR remains generic. It preserves ordered command args with raw token
  text plus compatibility `primary`/`params`/`flags`; the runtime compiler owns
  catalog-derived primary-vs-param decisions, validation, and normalization.
- Implemented RuntimeCommand params use canonical runtime field names only.
  Raw aliases stay in `sourceCommand`.
- `{...}` parameter expressions are preserved by the compiler and evaluated by
  StoryEngine against story variables. The compiler must not replace expression
  params with defaults.
- `children` means the catalog marks the command as child-block capable. This
  baseline does not parse nested command blocks yet.
- `showUI` / `hideUI` are implemented as a V-Ronpa runtime UI subset. Supported
  targets are `dialog`, `commandBar`, and `toastLayer`; no-target commands apply
  to those three targets only. `hud`, debug/harness UI, shell overlays,
  lifecycle-owned `inputPrompt` / `movieOverlay`, and multi-target `uINames`
  parity are outside the current implementation.

## Official Naninovel Commands

| Command | Runtime id | Category | Params | Children | Status |
|---|---|---|---|---|---|
| `addChoice` | `addchoice` | choice | `choiceSummary:string`, `id:string`, `lock:string`, `button:string`, `pos:decimal list`, `handler:string`, `goto:string`, `gosub:string`, `set:string`, `show:boolean`, `time:decimal` | no | stubbed |
| `append` | `append` | text | `text:string`, `printer:string`, `author:string` | no | implemented |
| `arrange` | `arrange` | actor | `characterPositions:named decimal list`, `look:boolean`, `time:decimal`, `wait:boolean` | no | implemented |
| `async` | `async` | flow | `trackId:string`, `loop:boolean` | yes | stubbed |
| `await` | `await` | flow | `trackId:string`, `complete:boolean` | no | stubbed |
| `back` | `back` | scene | `appearanceAndTransition:named string`, `pos:decimal list`, actor transform params | no | implemented |
| `bgm` | `bgm` | media | `bgmPath:string`, `intro:string`, audio params | no | implemented |
| `blur` | `blur` | effect | `actorId:string`, `power:decimal`, `time:decimal`, `wait:boolean` | no | implemented |
| `bokeh` | `bokeh` | effect | `focus:string`, `dist:decimal`, `power:decimal`, `time:decimal`, `wait:boolean` | no | implemented |
| `camera` | `camera` | scene | `offset:decimal list`, `roll:decimal`, `rotation:decimal list`, `zoom:decimal`, `ortho:boolean`, `toggle:string list`, `set:named boolean list`, `easing:string`, `time:decimal`, `lazy:boolean`, `wait:boolean` | no | stubbed |
| `char` | `char` | actor | `idAndAppearance:named string`, `look:string`, `avatar:string`, `pos:decimal list`, actor transform params | no | implemented |
| `choice` | `choice` | choice | same as `addChoice` | no | implemented |
| `choiceHandler` | `choicehandler` | choice | `handlerId:string`, `default:boolean`, actor transform params | no | stubbed |
| `clearBacklog` | `clearbacklog` | text | none | no | implemented |
| `clearChoice` | `clearchoice` | choice | `handlerId:string`, `id:string`, `hide:boolean` | no | implemented |
| `despawn` | `despawn` | actor | `path:string`, `params:string list`, `wait:boolean` | no | stubbed |
| `despawnAll` | `despawnall` | actor | `wait:boolean` | no | stubbed |
| `else` | `else` | flow | none | yes | stubbed |
| `endIf` | `endif` | flow | none | no | stubbed |
| `enterDialogue` | `enterdialogue` | text | none | no | stubbed |
| `exitDialogue` | `exitdialogue` | text | `destroy:boolean` | no | stubbed |
| `format` | `format` | text | `templates:named string list`, `printer:string` | no | implemented |
| `glitch` | `glitch` | effect | `time:decimal`, `power:decimal`, `wait:boolean` | no | implemented |
| `gosub` | `gosub` | flow | `path:string` | no | stubbed |
| `goto` | `goto` | flow | `path:string`, `reset:string list`, `hold:boolean`, `release:boolean` | no | implemented |
| `group` | `group` | flow | none | yes | stubbed |
| `hide` | `hide` | actor | `actorIds:string list`, `time:decimal`, `lazy:boolean`, `wait:boolean` | no | stubbed |
| `hideAll` | `hideall` | actor | `time:decimal`, `lazy:boolean`, `wait:boolean` | no | stubbed |
| `hideChars` | `hidechars` | actor | `time:decimal`, `lazy:boolean`, `wait:boolean` | no | implemented |
| `hidePrinter` | `hideprinter` | text | `printerId:string`, `time:decimal`, `wait:boolean` | no | stubbed |
| `hideUI` | `hideui` | ui | `uINames:string list`, `allowToggle:boolean`, `time:decimal`, `wait:boolean`, `target:string` (V-Ronpa) | no | implemented |
| `if` | `if` | flow | `expression:string` | yes | stubbed |
| `input` | `input` | ui | `variableName:string`, `type:string`, `summary:string`, `value:string`, `nostop:boolean` | no | implemented |
| `lipSync` | `lipsync` | actor | `charIdAndAllow:named boolean` | no | stubbed |
| `loadScene` | `loadscene` | scene | `sceneName:string`, `additive:boolean` | no | stubbed |
| `lock` | `lock` | state | `id:string` | no | stubbed |
| `look` | `look` | actor | `enable:boolean`, `zone:decimal list`, `speed:decimal list`, `gravity:boolean` | no | stubbed |
| `movie` | `movie` | media | `moviePath:string`, `time:decimal`, `block:boolean` | no | implemented |
| `openURL` | `openurl` | ui | `uRL:string`, `target:string` | no | stubbed |
| `print` | `print` | text | `text:string`, `printer:string`, `author:string`, `as:string`, `speed:decimal`, `reset:boolean`, `default:boolean`, `waitInput:boolean`, `append:boolean`, `fadeTime:decimal`, `wait:boolean`; dialogue-line compiler output may also carry `textId:string` | no | implemented |
| `printer` | `printer` | text | `idAndAppearance:named string`, `default:boolean`, `hideOther:boolean`, `anchor:boolean`, `pos:decimal list`, actor transform params | no | stubbed |
| `processInput` | `processinput` | ui | `inputEnabled:boolean`, `set:named boolean list` | no | stubbed |
| `purgeRollback` | `purgerollback` | state | none | no | stubbed |
| `rain` | `rain` | effect | `power:decimal`, `time:decimal`, `xSpeed:decimal`, `ySpeed:decimal`, `pos:decimal list`, `position:decimal list`, `rotation:decimal list`, `scale:decimal list`, `wait:boolean` | no | implemented |
| `random` | `random` | flow | `weight:decimal list` | yes | stubbed |
| `remove` | `remove` | actor | `actorIds:string list` | no | stubbed |
| `resetState` | `resetstate` | state | `exclude:string list`, `only:string list` | no | stubbed |
| `resetText` | `resettext` | text | `printerId:string` | no | implemented |
| `return` | `return` | flow | `reset:string list` | no | stubbed |
| `save` | `save` | ui | `at:string` | no | stubbed |
| `set` | `set` | state | `expression:string` | no | implemented |
| `sfx` | `sfx` | media | `sfxPath:string`, audio params | no | implemented |
| `sfxFast` | `sfxfast` | media | `sfxPath:string`, `volume:decimal`, `restart:boolean`, `additive:boolean`, `group:string`, `wait:boolean` | no | implemented |
| `shake` | `shake` | effect | `actorId:string`, `count:integer`, `loop:boolean`, `time:decimal`, `deltaTime:decimal`, `power:decimal`, `deltaPower:decimal`, `hor:boolean`, `ver:boolean`, `wait:boolean` | no | implemented |
| `show` | `show` | actor | `actorIds:string list`, `time:decimal`, `lazy:boolean`, `wait:boolean` | no | stubbed |
| `showPrinter` | `showprinter` | text | `printerId:string`, `time:decimal`, `wait:boolean` | no | implemented |
| `showUI` | `showui` | ui | `uINames:string list`, `time:decimal`, `wait:boolean`, `target:string` (V-Ronpa), `visible:boolean` (V-Ronpa) | no | implemented |
| `skip` | `skip` | ui | `enable:boolean` | no | stubbed |
| `slide` | `slide` | actor | `idAndAppearance:named string`, `from:decimal list`, `to:decimal list`, `visible:boolean`, `easing:string`, `time:decimal`, `lazy:boolean`, `wait:boolean` | no | implemented |
| `snow` | `snow` | effect | particle params | no | implemented |
| `spawn` | `spawn` | actor | `path:string`, `params:string list`, `pos:decimal list`, `position:decimal list`, `rotation:decimal list`, `scale:decimal list`, `wait:boolean` | no | stubbed |
| `stop` | `stop` | flow | `trackId:string` | no | stubbed |
| `stopBgm` | `stopbgm` | media | `bgmPath:string`, `fade:decimal`, `wait:boolean`, `group:string` (V-Ronpa) | no | implemented |
| `stopSfx` | `stopsfx` | media | `sfxPath:string`, `fade:decimal`, `wait:boolean`, `group:string` (V-Ronpa) | no | implemented |
| `stopVoice` | `stopvoice` | media | none | no | stubbed |
| `sun` | `sun` | effect | particle params | no | implemented |
| `sync` | `sync` | flow | `trackId:string` | no | stubbed |
| `timeline` | `timeline` | media | `name:string`, `stop:boolean`, `pause:boolean`, `resume:boolean`, `wait:boolean` | no | stubbed |
| `title` | `title` | ui | none | no | stubbed |
| `toast` | `toast` | ui | `text:string`, `appearance:string`, `time:decimal` | no | implemented |
| `trans` | `trans` | scene | `transition:string`, `params:decimal list`, `dissolve:string`, `easing:string`, `time:decimal` | no | stubbed |
| `unless` | `unless` | flow | `expression:string` | yes | stubbed |
| `unloadScene` | `unloadscene` | scene | `sceneName:string` | no | stubbed |
| `unlock` | `unlock` | state | `id:string` | no | stubbed |
| `voice` | `voice` | media | `voicePath:string`, `volume:decimal`, `group:string`, `authorId:string` | no | stubbed |
| `wait` | `wait` | flow | `waitMode:string` | no | implemented |
| `while` | `while` | flow | `expression:string` | yes | stubbed |

Shared shorthand:

- `pos`, `from`, `to`, and effect `pos` parameters use Naninovel scene
  percent syntax in scripts: `0,0` is bottom-left and `100,100` is top-right.
  `pixi-presenter` stores the reduced snapshot as normalized `0..1` values.
- `actor transform params`: `id:string`, `appearance:string`, `pose:string`,
  `via:string`, `params:decimal list`, `dissolve:string`, `visible:boolean`,
  `position:decimal list`, `rotation:decimal list`, `scale:decimal list`,
  `tint:string`, `easing:string`, `time:decimal`, `lazy:boolean`,
  `wait:boolean`.
- `audio params`: `volume:decimal`, `loop:boolean`, `fade:decimal`,
  `group:string`, `time:decimal`, `wait:boolean`.
- `particle params`: `power:decimal`, `time:decimal`, `pos:decimal list`,
  `position:decimal list`, `rotation:decimal list`, `scale:decimal list`,
  `wait:boolean`.

## V-Ronpa Project Commands

These commands remain project-specific declarations in the same catalog so
handler registration cannot drift:

- `end`
- `gameplay` alias `gameplay-event`; params `type`, `id`, `quantity`, `item`,
  `itemId`, `evidence`, `evidenceId`, `character`, `characterId`, `status`,
  `skill`, `skillId`, `delta`, and `affinityDelta`
- `charenter` with `.nani` source alias `char-enter`; migration stub only,
  prefer official `char`
- `flash`
- `focus`
- `trialkeyword` alias `trial-keyword`

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
  adapters can derive `voice:<locale>:<textId>`.
- `@print`, `@append`, and `@toast` do not interpret `|#...|` as metadata.
