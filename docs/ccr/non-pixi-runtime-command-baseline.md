# Contract Change Request

## Title

Non-Pixi runtime command baseline contracts

## Status

- State: `Active`
- Task: `docs/tasks/non-pixi-runtime-command-baseline.md`

## Why Existing Contract Is Insufficient

The baseline needs non-Pixi commands to move through the same public command
catalog and runtime snapshot boundary as Pixi commands. Existing contracts only
distinguished story-control, Pixi presentation, gameplay, and declared-only
commands, so media/UI commands could drift through category fallback. Story
snapshots also lacked a public place for current dialog text, runtime waits,
and choice metadata needed by input/movie/wait and choice command behavior.

## Requested Contract Changes

- Add `media-output` and `ui-output` to `NaniCommandExecutionSchema`.
- Promote the fixed non-Pixi command set in the command catalog while keeping
  `stopVoice` declared-only for the future `voice` task.
- Add additive optional `StoryRuntimeSnapshot.runtimeWait`.
- Add additive optional `StoryRuntimeSnapshot.text`.
- Add `StoryTextState`.
- Add choice `id`, `enabled`, and `setExpression` metadata.
- Add V-Ronpa `group` params to BGM/SFX stop/play commands where needed.
- Add V-Ronpa `showUI target/visible` params and `hideUI target` params for
  canonical UI runtime visibility control. The v1 target set is limited to
  concrete runtime UI surfaces (`dialog`, `commandBar`, `toastLayer`); it does
  not introduce a generic UI manager, debug/harness UI control, or a standalone
  `hud` surface.

## Compatibility

Existing save/story snapshots remain valid because new snapshot fields are
optional and defaults are additive. `SaveData` stays version 2. Runtime media
state, runtime UI state, and active waits are not persisted by normal saves.

## Regression Evidence

- Contract tests cover old story snapshots without new fields.
- Contract tests cover `runtimeWait`, `StoryTextState`, choice metadata, and
  command execution mapping.
- Route/transaction tests prove media/UI commands route by execution authority
  and story-control commands do not leak through category fallback.
