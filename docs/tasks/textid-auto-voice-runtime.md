# TextId Auto Voice Runtime

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/textid-auto-voice-runtime`

## Worktree Path

- Codex managed worktree:
  `/Users/periokumene/.codex/worktrees/a74a/v-ronpa`

## Status

- State: `Review`
- Owner: `TBD`
- Created: `2026-06-28`
- Updated: `2026-06-28`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/textid-auto-voice-runtime.md`

## Goal

Implement Naninovel-style text identity markers for dialogue lines and use
those markers to auto-bind voice playback through `AssetRegistry` at app story
step commit time.

End-to-end flow:

```text
.nani dialogue |#textId|
-> TextIR.textId with marker removed from visible text
-> RuntimeCommand print params.textId
-> StoryEngine emits print while current text/backlog/save stay visible-text only
-> app adapter derives play-voice on story step commit
-> voice:<locale>:<textId> resolves through AssetRegistry
-> AudioPort.playVoice plays a single active voice handle
```

## Context

- Naninovel reference: `|#id|` text identifiers and auto voicing.
- `packages/nani-parser` and `.nani` IR are public API.
- `packages/contracts` owns `SettingsSnapshot` and runtime asset kinds.
- `packages/asset-registry` is the only runtime asset lookup boundary.
- `StoryEngine` must stay independent of React, DOM, Howler, and asset loading.

## Constraints

- Scope is textId-driven auto voice for dialogue lines only.
- Do not implement full localization, managed text, voice replay, author-based
  lookup, speaker-based lookup, `@voice`, or `@stopVoice`.
- `|#textId|` is metadata and must not enter DOM dialog text, backlog, search
  text, or save snapshots.
- One `TextIR` supports at most one `textId` in this task.
- `textId` must be filename-safe and match the flat voice asset stem: letters,
  numbers, `_`, and `-`.
- Missing voice asset produces a runtime asset warning and does not block
  parsing or story execution.
- SKIP pacing must not play voice. Manual, AUTO, and auto-next pacing may play.
- React rerender, backlog open, and load restore must not replay voice.
- Voice volume is `muted ? 0 : masterVolume * voiceVolume`.
- Locale mapping starts with `zh-CN` / `zh-TW` -> `zh`; `ja` and `en` remain
  direct future-ready locales, and other UI languages fall back to `zh` until
  explicitly added.

## Allowed Paths

- `docs/tasks/**`
- `docs/archive/completed-tasks/**`
- `docs/ccr/**`
- `docs/nani/**`
- `docs/architecture/**`
- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/media-save/**`
- `packages/ui-kit/**`
- `apps/game/src/**`
- `apps/game/public/harness/README.md`
- `apps/game/public/harness/media/voice/**`
- `scripts/generate-assets.mjs`
- `scripts/validate-assets.mjs`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- `packages/pixi-presenter/**`
- `packages/r3f-adapter/**`
- `packages/gameplay/**`
- `packages/navi-director/**`
- `packages/trial-director/**`

## Contracts

- `TextIR` gains optional `textId?: string`.
- `RuntimeCommand` `print.params` may carry app-consumed `textId` when compiled
  from a dialogue line.
- `SettingsSnapshot.sound.voiceInterruption` is removed as unused legacy state.
- `AudioPort` gains `playVoice(id, uri, options)`.
- `RuntimeAsset.kind: "voice"` is used with generated ids
  `voice:<locale>:<textId>`.
- CCR: `docs/ccr/textid-auto-voice-runtime.md`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Dialogue marker parsing | Parser tests cover valid, invalid, empty, multiple, and duplicate textIds. |
| Visible text cleanup | Parser/compiler/story tests show marker-free text and backlog. |
| Runtime command bridge | Compiler and StoryEngine tests show `print.params.textId` emission. |
| App voice playback | Adapter tests cover non-skip playback, skip no-op, missing asset warning, and active handle interruption. |
| Settings cleanup | Contract/app tests cover removed `voiceInterruption` and legacy localStorage migration. |
| Asset pipeline | Generated harness manifest resolves `voice:zh:voice_validation_0001`; `validate:assets` enforces flat voice layout and passes. |
| Harness branch | Vertical-slice `.nani` has a dedicated voice validation choice branch. |

## Regression Requirements

Required regression cases:

- Normal path: dialogue `|#voice_validation_0001|` becomes `TextIR.textId`,
  compiles to `print.params.textId`, resolves `voice:zh:voice_validation_0001`,
  and calls `AudioPort.playVoice`.
- Boundary/rejection path: empty, invalid/path-like, multiple, and duplicate
  textIds diagnose without leaking markers into visible text.
- No-op path: no textId dialogue does not derive voice; SKIP pacing does not
  play; missing voice asset warns without calling `AudioPort`.
- Serialization path: Story current text, backlog, and save snapshots do not
  store `textId`; legacy `sound.voiceInterruption` migrates out of settings
  without resetting other fields.

Test placement:

- Parser: `packages/nani-parser/src/index.test.ts`
- Compiler: `packages/nani-runtime-compiler/src/index.test.ts`
- StoryEngine: `packages/story-engine/src/index.test.ts`
- Media: `packages/media-save/src/index.test.ts`
- App adapter/settings: `apps/game/src/interaction/*.test.ts`
- App routing/transaction: `apps/game/src/vnOutputRoutes.test.ts`,
  `apps/game/src/vnRuntimeTransaction.test.ts`
- Asset manifest: `apps/game/src/harness/contentManifest.test.ts`

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml`.

## CCR Triggers

This task intentionally includes one CCR:

- `docs/ccr/textid-auto-voice-runtime.md`

Create a follow-up CCR instead of widening this task if implementation needs:

- project-level textId duplicate tooling,
- full localization or managed text,
- explicit `@voice` / `@stopVoice`,
- save-data voice replay state,
- role/speaker/author based voice lookup,
- new dependencies.

## Required Gates

Local iteration:

```bash
pnpm validate:contracts
pnpm vitest run packages/nani-parser/src/index.test.ts packages/nani-runtime-compiler/src/index.test.ts packages/story-engine/src/index.test.ts packages/media-save/src/index.test.ts apps/game/src/interaction/useVerticalSliceRuntimeAdapter.test.ts apps/game/src/interaction/useGameSettingsAdapter.test.ts apps/game/src/harness/contentManifest.test.ts
pnpm typecheck
pnpm validate:assets
pnpm validate:boundaries
```

Merge gate:

```bash
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/textid-auto-voice-runtime.md
```

## Programmatic Acceptance

The implementation is acceptable when:

- Task-specific tests pass.
- `pnpm validate:contracts`, `pnpm typecheck`, `pnpm validate:assets`, and
  `pnpm validate:boundaries` pass.
- Subsystem validation passes against `integration/v-ronpa-baseline`.

## Manual Acceptance

Reviewers should confirm:

- `|#textId|` is stripped only from dialogue `TextIR` visible text.
- Voice lookup is exactly `voice:<locale>:<textId>` and does not consult
  speaker, appearance, author, or raw paths.
- StoryEngine and save snapshots remain voice-playback agnostic.
- Settings UI no longer exposes voice interruption.
- Docs no longer describe textId auto voice as a future-only item.

## Review Packet

- Changed files summary.
- Test and gate output.
- Regression coverage summary.
- CCR link.
- Residual risks and future follow-ups.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this task removes the validation voice asset and generated manifest
entry. Users with old localStorage containing `sound.voiceInterruption` can
still be migrated by the current adapter while this task is present; rollback
would reintroduce the old settings field if the contracts revert.

## Done When

- Required tests and gates pass or any blocker is explicitly reported.
- Public contract changes have the CCR above.
- Diff stays inside Allowed Paths.
- Review packet includes changed files, verification, and residual risks.
