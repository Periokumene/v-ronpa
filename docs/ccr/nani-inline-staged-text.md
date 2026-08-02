# Contract Change Request

## Title

Inline staged story text for `.nani`

## Status

- State: `Active`
- Task: `docs/tasks/nani-inline-staged-text.md`

## Why Existing Contract Is Insufficient

The parser currently accepts only `[>]` and `[< speed:…]` inside ordinary text,
and the compiler lowers one text statement to one `RuntimeCommand`. As a result,
the runtime can reveal or advance only the complete logical line. Implementing
click-staged text in a renderer, React surface, or app-local script transform
would create a second instruction pointer and drift from story, save, backlog,
audio, automation, and debug checkpoint semantics.

## Requested Contract Changes

- Add `TextStageIR` with fragment `text`, optional balanced `richText`, and
  source `loc`; add optional `textStages` to `TextIR` and `CommandIR`. The field
  exists only when a logical line contains at least two stages.
- Add exported `RuntimeTextStageSchema` / `RuntimeTextStage` and optional
  `RuntimeCommand.textStage = { index, count }`, with `count >= 2` and
  `0 <= index < count`.
- Treat `[-]` and `[wait i]` as equivalent inline input stops in ordinary story
  text and static `@print` / `@cue` text. Markers are source syntax and never
  enter visible text.
- Keep SaveData unchanged. The stage identity is runtime command semantics and
  therefore contributes to the script semantic digest, while stable saves keep
  using script revision, instruction pointer, and accumulated story text.

## Runtime Semantics

One logical staged line lowers atomically to multiple `print` or `cue` runtime
commands. The first command keeps the authored reset/append behavior; each
later command uses `append:true`. Every command is a normal story-text stop and
stable checkpoint. Only the final command carries authored auto-next behavior.

Reveal starts each continuation with the already accumulated prefix visible and
animates only the new fragment. Manual, AUTO, and SKIP advance stage by stage.
Whole-line voice starts once at the first stage; intermediate stages do not
stop or replay it, while bleep ticks cover only each new fragment. Backlog
commits one accumulated entry on the final stage. Explicit `@print append:true`
also commits an accumulated snapshot; `@append` keeps its existing non-stop,
non-backlog semantics.

## Syntax Boundaries

- Ordinary text retains `[>]` and `[< speed:…]`; auto-next attaches only to the
  final stage and speed applies to every stage.
- Explicit `@print` / `@cue` strings accept only `[-]` and `[wait i]` internally;
  speed and auto-next remain outer command parameters.
- Timed waits, empty stages, boundaries inside active rich-text tags or tag
  syntax, dynamic expression text, and conditional staged commands are errors.
- Long `[wait i]` in explicit commands requires a quoted string; compact `[-]`
  remains valid in existing unquoted CJK text.

## Compatibility And Rollback

Scripts that do not use staged syntax retain their current IR and runtime
output. Scripts that adopt the syntax gain additional command indices and a new
script revision; existing revision validation rejects old saves without a
migration. Rollback must remove parser/contracts/runtime support and authored
markers together.

## Fixtures And Tests

- Contract schema acceptance and bounds rejection.
- Parser IR/source maps, aliases, rich text, escaping, and exact invalid-marker
  diagnostics.
- Compiler one-to-many lowering, label pointers, digest sensitivity, and
  unchanged non-staged output.
- Story/reveal/audio/automation/save/backlog and debug anchor/materializer tests.
- Game Harness and Game A smoke evidence for cumulative three-stage output.

## Rebase Impact

Worktrees touching runtime commands, `.nani` parser IR, compiler command
indices, StoryText playback, or VN debug anchors must rebase onto this change.
