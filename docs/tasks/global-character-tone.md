# Global Character Tone

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`
- Created: `2026-07-29`
- Updated: `2026-07-29`
- CCR: [`global-character-tone.md`](../ccr/global-character-tone.md)

## Goal

Implement the script-scoped global `@charTone` command end to end, including
save-safe stable state, independent Pixi OKLab rendering, Game A product use,
Harness visual acceptance, authoring docs, and regression evidence.

## Constraints

- Keep gameplay/state logic renderer-independent and preserve the canonical
  command → compiler → stage model → runtime projection → presenter flow.
- Do not import or execute `temp/tone-lab`; the accepted backup is a visual and
  algorithm specification only.
- Do not add packages, dependencies, lockfile changes, per-character controls,
  hex recipes, automatic weather coupling, shadow lift, or compatibility APIs.

## Allowed Paths

- `packages/contracts/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/pixi-stage-model/**`
- `packages/pixi-presenter/**`
- `packages/media-save/**`
- `apps/game-a/**`
- `apps/game-harness/**`
- `tools/vscode-nani/**`
- `tests/smoke/**`
- `scripts/fixtures/nani-semantic-golden.json`
- `scripts/nani-semantic-golden.test.ts`
- `scripts/generate-command-catalog-doc.mjs`
- `docs/architecture/**`
- `docs/nani/**`
- `docs/ccr/global-character-tone.md`
- `docs/tasks/global-character-tone.md`
- `progress.md`

## Forbidden Paths

- `temp/**`
- `package.json`
- `pnpm-lock.yaml`
- character-pack JSON/PNG payloads

## Public Contracts

- `@charTone [preset|none] amount:<decimal> time:<seconds> wait!`
- `CharacterTonePresetId`
- optional `PixiStageSnapshot.characterTone`
- `character-tone-transition`

The stage stays v5 and SaveData stays v8. Old data without tone remains valid.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Command and validation | Contract/compiler tests and generated command docs |
| Stable/script-scoped state | Stage model, projection, navigation, and debug materializer tests |
| Save/load | Contract, checkpoint, media-save, and Harness adapter tests |
| Correct character-only topology | Presenter structure/shader tests |
| Product consumption | Game A formal Nani plus generated asset tests |
| Visual behavior | Harness branch, Game A character smoke, Playwright screenshots |

## Regression Requirements

- Normal paths: six presets, default/explicit amount, amount-only update, timed
  wait, current/future characters, preset transition, save/load.
- Boundary paths: unknown/hex/negative/non-finite/conflicting input, amount-only
  without state, amount zero/none, no-op, no characters, transition interrupt,
  local label, direct/chained cross-script navigation, restore, and named
  `char → hideChars → char` visibility restoration.
- Pixel/topology paths: premultiplied alpha, tone-before-outline, unchanged
  outline/background/DOM, expression crossfade, overdrive finite output.

## Required Gates

```bash
pnpm generate:assets
pnpm generate:command-docs
pnpm typecheck
pnpm validate:contracts
pnpm validate:command-docs
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:ccr
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/global-character-tone.md
pnpm validate:baseline
```

## Done When

- Required package and visual regressions pass.
- Generated files are fresh and visual evidence is inspected.
- Diff remains within this task and contains no dependency, lockfile, temp, or
  character-pack changes.

## Verification

- `pnpm validate:subsystem` passes with task-boundary, CCR, contract, build,
  unit, and all 13 Playwright scenarios.
- `pnpm validate:baseline` passes, including 517 contract/subsystem tests, 744
  repository tests, 12 VS Code extension-host tests, both production builds,
  diagnostics stress/quality gates, and all 13 Playwright scenarios.
- The follow-up named-`@char` visibility correction passes the full subsystem
  gate with 517 contract tests, 745 repository tests, both production builds,
  and all 13 Playwright scenarios.
- Focused Tone smoke covers all six presets, amount-only updates, overdrive,
  removal, expression replacement, and quick-save/quick-load restoration.
- Game A Alice screenshots and the required web-game client show character-only
  rain Tone after complete layered composition, with white outline, background,
  and DOM dialogue preserved.
- `package.json`, `pnpm-lock.yaml`, `temp/**`, and character-pack payloads are
  unchanged.
