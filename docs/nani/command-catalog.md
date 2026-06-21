# VN Command Catalog

`packages/contracts/src/index.ts` owns the command catalog. It is the single
declaration source for `.nani` commands. StoryEngine handler registration,
diagnostics, future editor support, and app routing must derive from this
catalog instead of redefining command metadata elsewhere.

Runtime command ids are lowercase. `canonicalName` preserves the official or
project-facing spelling for diagnostics and tools.

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

- Naninovel official commands are explicit catalog entries. They must not use
  the wildcard generic route.
- Existing V-Ronpa compatibility params may be attached to an official command
  entry, but each such param must be marked with `source: "v-ronpa"` in the
  catalog. This keeps the official parameter list auditable.
- `@wildcard-<type>` commands are branch-local escape hatches. They require
  `routeKey:string`; all other params are forwarded as generic params.
- `NaniCommandHandlerRegistry` binds runtime handlers only. It rejects handlers
  not declared in the catalog.
- Parser IR remains generic. It preserves known parameter names, but StoryEngine
  owns catalog-derived parameter validation.
- `children` means the catalog marks the command as child-block capable. This
  baseline does not parse nested command blocks yet.

## Official Naninovel Commands

| Command | Runtime id | Category | Params | Children | Status |
|---|---|---|---|---|---|
| `addChoice` | `addchoice` | choice | `choiceSummary:string`, `id:string`, `lock:string`, `button:string`, `pos:decimal list`, `handler:string`, `goto:string`, `gosub:string`, `set:string`, `show:boolean`, `time:decimal` | no | stubbed |
| `append` | `append` | text | `text:string`, `printer:string`, `author:string` | no | stubbed |
| `arrange` | `arrange` | actor | `characterPositions:named decimal list`, `look:boolean`, `time:decimal`, `wait:boolean` | no | stubbed |
| `async` | `async` | flow | `trackId:string`, `loop:boolean` | yes | stubbed |
| `await` | `await` | flow | `trackId:string`, `complete:boolean` | no | stubbed |
| `back` | `back` | scene | `appearanceAndTransition:named string`, `pos:decimal list`, actor transform params | no | implemented |
| `bgm` | `bgm` | media | `bgmPath:string`, `intro:string`, audio params | no | stubbed |
| `blur` | `blur` | effect | `actorId:string`, `power:decimal`, `time:decimal`, `wait:boolean` | no | stubbed |
| `bokeh` | `bokeh` | effect | `focus:string`, `dist:decimal`, `power:decimal`, `time:decimal`, `wait:boolean` | no | stubbed |
| `camera` | `camera` | scene | `offset:decimal list`, `roll:decimal`, `rotation:decimal list`, `zoom:decimal`, `ortho:boolean`, `toggle:string list`, `set:named boolean list`, `easing:string`, `time:decimal`, `lazy:boolean`, `wait:boolean` | no | stubbed |
| `char` | `char` | actor | `idAndAppearance:named string`, `look:string`, `avatar:string`, `pos:decimal list`, actor transform params | no | stubbed |
| `choice` | `choice` | choice | same as `addChoice` | no | implemented |
| `choiceHandler` | `choicehandler` | choice | `handlerId:string`, `default:boolean`, actor transform params | no | stubbed |
| `clearBacklog` | `clearbacklog` | text | none | no | stubbed |
| `clearChoice` | `clearchoice` | choice | `handlerId:string`, `id:string`, `hide:boolean` | no | stubbed |
| `despawn` | `despawn` | actor | `path:string`, `params:string list`, `wait:boolean` | no | stubbed |
| `despawnAll` | `despawnall` | actor | `wait:boolean` | no | stubbed |
| `else` | `else` | flow | none | yes | stubbed |
| `endIf` | `endif` | flow | none | no | stubbed |
| `enterDialogue` | `enterdialogue` | text | none | no | stubbed |
| `exitDialogue` | `exitdialogue` | text | `destroy:boolean` | no | stubbed |
| `format` | `format` | text | `templates:named string list`, `printer:string` | no | stubbed |
| `glitch` | `glitch` | effect | `time:decimal`, `power:decimal`, `wait:boolean` | no | stubbed |
| `gosub` | `gosub` | flow | `path:string` | no | stubbed |
| `goto` | `goto` | flow | `path:string`, `reset:string list`, `hold:boolean`, `release:boolean` | no | implemented |
| `group` | `group` | flow | none | yes | stubbed |
| `hide` | `hide` | actor | `actorIds:string list`, `time:decimal`, `lazy:boolean`, `wait:boolean` | no | stubbed |
| `hideAll` | `hideall` | actor | `time:decimal`, `lazy:boolean`, `wait:boolean` | no | stubbed |
| `hideChars` | `hidechars` | actor | `time:decimal`, `lazy:boolean`, `wait:boolean` | no | stubbed |
| `hidePrinter` | `hideprinter` | text | `printerId:string`, `time:decimal`, `wait:boolean` | no | stubbed |
| `hideUI` | `hideui` | ui | `uINames:string list`, `allowToggle:boolean`, `time:decimal`, `wait:boolean` | no | stubbed |
| `if` | `if` | flow | `expression:string` | yes | stubbed |
| `input` | `input` | ui | `variableName:string`, `type:string`, `summary:string`, `value:string`, `nostop:boolean` | no | stubbed |
| `lipSync` | `lipsync` | actor | `charIdAndAllow:named boolean` | no | stubbed |
| `loadScene` | `loadscene` | scene | `sceneName:string`, `additive:boolean` | no | stubbed |
| `lock` | `lock` | state | `id:string` | no | stubbed |
| `look` | `look` | actor | `enable:boolean`, `zone:decimal list`, `speed:decimal list`, `gravity:boolean` | no | stubbed |
| `movie` | `movie` | media | `moviePath:string`, `time:decimal`, `block:boolean` | no | stubbed |
| `openURL` | `openurl` | ui | `uRL:string`, `target:string` | no | stubbed |
| `print` | `print` | text | `text:string`, `printer:string`, `author:string`, `as:string`, `speed:decimal`, `reset:boolean`, `default:boolean`, `waitInput:boolean`, `append:boolean`, `fadeTime:decimal`, `wait:boolean` | no | stubbed |
| `printer` | `printer` | text | `idAndAppearance:named string`, `default:boolean`, `hideOther:boolean`, `anchor:boolean`, `pos:decimal list`, actor transform params | no | stubbed |
| `processInput` | `processinput` | ui | `inputEnabled:boolean`, `set:named boolean list` | no | stubbed |
| `purgeRollback` | `purgerollback` | state | none | no | stubbed |
| `rain` | `rain` | effect | `power:decimal`, `time:decimal`, `xSpeed:decimal`, `ySpeed:decimal`, `pos:decimal list`, `position:decimal list`, `rotation:decimal list`, `scale:decimal list`, `wait:boolean` | no | stubbed |
| `random` | `random` | flow | `weight:decimal list` | yes | stubbed |
| `remove` | `remove` | actor | `actorIds:string list` | no | stubbed |
| `resetState` | `resetstate` | state | `exclude:string list`, `only:string list` | no | stubbed |
| `resetText` | `resettext` | text | `printerId:string` | no | stubbed |
| `return` | `return` | flow | `reset:string list` | no | stubbed |
| `save` | `save` | ui | `at:string` | no | stubbed |
| `set` | `set` | state | `expression:string` | no | implemented |
| `sfx` | `sfx` | media | `sfxPath:string`, audio params | no | stubbed |
| `sfxFast` | `sfxfast` | media | `sfxPath:string`, `volume:decimal`, `restart:boolean`, `additive:boolean`, `group:string`, `wait:boolean` | no | stubbed |
| `shake` | `shake` | effect | `actorId:string`, `count:integer`, `loop:boolean`, `time:decimal`, `deltaTime:decimal`, `power:decimal`, `deltaPower:decimal`, `hor:boolean`, `ver:boolean`, `wait:boolean` | no | implemented |
| `show` | `show` | actor | `actorIds:string list`, `time:decimal`, `lazy:boolean`, `wait:boolean` | no | stubbed |
| `showPrinter` | `showprinter` | text | `printerId:string`, `time:decimal`, `wait:boolean` | no | stubbed |
| `showUI` | `showui` | ui | `uINames:string list`, `time:decimal`, `wait:boolean` | no | stubbed |
| `skip` | `skip` | ui | `enable:boolean` | no | stubbed |
| `slide` | `slide` | actor | `idAndAppearance:named string`, `from:decimal list`, `to:decimal list`, `visible:boolean`, `easing:string`, `time:decimal`, `lazy:boolean`, `wait:boolean` | no | stubbed |
| `snow` | `snow` | effect | particle params | no | stubbed |
| `spawn` | `spawn` | actor | `path:string`, `params:string list`, `pos:decimal list`, `position:decimal list`, `rotation:decimal list`, `scale:decimal list`, `wait:boolean` | no | stubbed |
| `stop` | `stop` | flow | `trackId:string` | no | stubbed |
| `stopBgm` | `stopbgm` | media | `bgmPath:string`, `fade:decimal`, `wait:boolean` | no | stubbed |
| `stopSfx` | `stopsfx` | media | `sfxPath:string`, `fade:decimal`, `wait:boolean` | no | stubbed |
| `stopVoice` | `stopvoice` | media | none | no | stubbed |
| `sun` | `sun` | effect | particle params | no | stubbed |
| `sync` | `sync` | flow | `trackId:string` | no | stubbed |
| `timeline` | `timeline` | media | `name:string`, `stop:boolean`, `pause:boolean`, `resume:boolean`, `wait:boolean` | no | stubbed |
| `title` | `title` | ui | none | no | stubbed |
| `toast` | `toast` | ui | `text:string`, `appearance:string`, `time:decimal` | no | stubbed |
| `trans` | `trans` | scene | `transition:string`, `params:decimal list`, `dissolve:string`, `easing:string`, `time:decimal` | no | stubbed |
| `unless` | `unless` | flow | `expression:string` | yes | stubbed |
| `unloadScene` | `unloadscene` | scene | `sceneName:string` | no | stubbed |
| `unlock` | `unlock` | state | `id:string` | no | stubbed |
| `voice` | `voice` | media | `voicePath:string`, `volume:decimal`, `group:string`, `authorId:string` | no | stubbed |
| `wait` | `wait` | flow | `waitMode:string` | no | stubbed |
| `while` | `while` | flow | `expression:string` | yes | stubbed |

Shared shorthand:

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

## Wildcard Commands

| Command | Category | Required params | Forwarded params | Status |
|---|---|---|---|---|
| `wildcard-text` | text | `routeKey:string` | all non-`routeKey` params | implemented |
| `wildcard-choice` | choice | `routeKey:string` | all non-`routeKey` params | implemented |
| `wildcard-flow` | flow | `routeKey:string` | all non-`routeKey` params | implemented |
| `wildcard-state` | state | `routeKey:string` | all non-`routeKey` params | implemented |
| `wildcard-actor` | actor | `routeKey:string` | all non-`routeKey` params | implemented |
| `wildcard-scene` | scene | `routeKey:string` | all non-`routeKey` params | implemented |
| `wildcard-effect` | effect | `routeKey:string` | all non-`routeKey` params | implemented |
| `wildcard-media` | media | `routeKey:string` | all non-`routeKey` params | implemented |
| `wildcard-ui` | ui | `routeKey:string` | all non-`routeKey` params | implemented |

## V-Ronpa Project Commands

These commands remain project-specific declarations in the same catalog so
handler registration cannot drift:

- `end`
- `gameplay` alias `gameplay-event`
- `charenter` alias `char-enter`
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
- `[>]` is parsed as an inline command with id `>`. StoryEngine maps its
  presence to `PresentationCommand.print.autoNext`.

They are intentionally not part of `commandCatalog` in this baseline. If they
grow beyond inline text control, add a separate inline-token contract instead of
mixing them with top-level Naninovel commands.
