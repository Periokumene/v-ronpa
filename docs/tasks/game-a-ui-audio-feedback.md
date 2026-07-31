# Game A UI Audio Feedback

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/game-a-ui-audio-feedback`

## Worktree Environment

Run `pnpm setup:worktree-env`; do not commit generated environment or Playwright output.

## Thread Startup Prompt

Implement this card without changing public contracts or dependency files. Preserve unrelated working-tree edits.

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-07-11`
- Updated: `2026-07-11`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/game-a-ui-audio-feedback.md`

## Goal

Give every enabled native Game A button default mouse-hover and activation audio, controlled by the existing persisted `uiVolume`, with semantic per-button overrides and no coupling to the VN runtime-owned audio port.

## Context

- Game A owns its product UI composition and one AssetRegistry.
- `AudioPort` and the Howler adapter already live in `packages/media-save`.
- The VN runtime exclusively owns its own AudioPort; UI feedback needs a separate app-owned instance.
- Original external authoring inputs (identified by name and digest; they are
  not repository-relative build inputs):
  - `hover.ogg`
  - `click.ogg`
- Input SHA-256:
  - `hover.ogg`: `4b32026acfb3b0d777232225209bf256e1515f524278dc14555dbb87eb16e10f`
  - `click.ogg`: `6060f9e0415035e7ab75330157eaa8453ac4549f38f4a67cb63a5352bb49e1b2`
- One-off processing: trim samples below `-50 dBFS` with 5 ms head and 20 ms tail guards, apply 3 ms fade-in and 15 ms fade-out, then peak-normalize to `-3 dBFS`; retain stereo 44.1 kHz Ogg Vorbis.
- Output SHA-256:
  - `ui-hover-default.ogg`: `43574b822fef70adb2fe74672c1e547d9a87a4734eefaeb5d8c5217986238049`
  - `ui-click-default.ogg`: `ef562649ae6f036fb64586f7ed0e2a51e67e3406cfb785056efe6d845faf4a06`

## Constraints

- Keep the controller and cue configuration app-local.
- Reuse the existing ContentManifest, AssetRegistry, AudioPort, and settings persistence chain.
- Do not add dependencies or a permanent audio-processing pipeline.
- Preserve existing pause-navigation and `opening.nani` working-tree changes.
- Hover is mouse-only; click applies to mouse, keyboard, and touch activation.

## Allowed Paths

- `apps/game-a/public/game-a/media/sfx/**`
- `apps/game-a/src/**`
- `tests/smoke/game-a-vn.spec.ts`
- `docs/tasks/game-a-ui-audio-feedback.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/app-vn-runtime/**`
- `packages/ui-kit/**`
- `package.json`
- `pnpm-lock.yaml`
- `apps/game-harness/**`

## Contracts

- Honor `ContentManifest` v3 and declare UI sounds through existing global `assets` references.
- Honor the existing `AudioPort` without extending it.
- Honor `SettingsSnapshot.sound.uiVolume` as the UI-volume authority.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Default button hover and click feedback | Controller/component tests plus Game A browser smoke |
| Mouse-only hover semantics | Pointer-type and related-target unit cases |
| Semantic override and opt-out | Cue override, `none`, and unknown-cue tests |
| UI volume chain | Settings surface test and AudioPort volume assertions |
| Canonical asset resolution | Content manifest and UI asset resolver tests |
| Visible settings control | Playwright screenshot of the SOUND settings tab |

## Regression Requirements

Required regression cases:

- Normal path: resolved hover/click cues play with `masterVolume * uiVolume * gain`.
- Boundary path: disabled, aria-disabled, touch hover, inner-node movement, throttled hover, and missing assets do not play. Mouse hover always attempts immediate playback without activation gating, queuing, or replay.
- Override path: semantic cue attributes override defaults; `none` and unknown cues are safe no-ops.
- Lifecycle path: click stops hover, channel reuse replaces prior playback, and unmount calls `stopAll()`.
- Persistence/UI path: the SOUND tab patches the existing `uiVolume` setting.

Test placement:

- App unit/component tests: `apps/game-a/src/**/*.test.tsx` and `apps/game-a/src/**/*.test.ts`
- Manifest tests: `apps/game-a/src/contentManifest.test.ts`
- Browser smoke: `tests/smoke/game-a-vn.spec.ts`

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml`.

## CCR Triggers

- A public manifest, settings, runtime-port, or UI-kit API change becomes necessary.
- The allowed paths cannot provide complete regression evidence.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm vitest run apps/game-a/src/contentManifest.test.ts apps/game-a/src/ui/GameASurfaces.test.tsx apps/game-a/src/ui/useGameAUiAudio.test.ts
pnpm validate:assets
pnpm typecheck
pnpm validate:boundaries
pnpm --filter @v-ronpa/game-a build
pnpm playwright test tests/smoke/game-a-vn.spec.ts
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/game-a-ui-audio-feedback.md
pnpm validate:baseline
```

## Programmatic Acceptance

- All required regression cases pass.
- Generated assets are fresh and both cue IDs resolve through the app registry.
- Typecheck, boundary validation, Game A build, smoke, subsystem, and baseline gates pass.
- The SOUND settings screenshot is present under ignored `test-results/` output.

## Manual Acceptance

- Listen to title, VN, pause, settings, and save/load buttons.
- Confirm fast mouse movement does not create a hover-sound pileup.
- Confirm keyboard/touch activation has click feedback but no hover feedback.
- Confirm mute, master volume, and UI volume affect subsequent UI playback.

## Review Packet

- Changed files: two processed OGG assets; generated asset declarations; Game A manifest/config/resolver/controller/App/settings/tests; Game A smoke; this task card.
- Audio evidence: input/output SHA-256 and deterministic one-off processing parameters are recorded under Context. Decoded outputs are stereo 44.1 kHz Vorbis; hover is 0.278163 s at approximately -2.962 dBFS peak, click is 0.190499 s at approximately -3.419 dBFS peak.
- Regression evidence: 27 focused Game A tests pass; the repository totals 308 contract/subsystem tests and 473 full unit tests.
- Gates: task boundaries, subsystem validation, and `pnpm validate:baseline` pass. Typecheck, assets, boundaries, CCR, cleanup guards, both production builds, and all 7 Playwright tests are green.
- Browser evidence: `test-results/game-a-settings-sound.png` and `output/game-a-ui-audio-web-client/shot-0.png` were visually inspected; the smoke observes both UI OGG requests, persisted `uiVolume=0.6`, and no console errors.
- Environment note: a first non-CI subsystem attempt reused a pre-existing Game A dev server without test entries and failed at the old product/smoke-entry mismatch. The isolated `CI=1` subsystem and baseline reruns started fresh servers on dedicated ports and passed.
- Residual risk: subjective loudness/timbre balance still requires a human listening pass on target speakers/headphones. A pre-activation hover attempts playback immediately, but the browser may reject it under its autoplay policy; the app does not queue or replay that cue. OGG-only delivery follows the current browser baseline.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert the app-local controller/config, generated asset entries, two OGG files, setting row, and tests. No save migration or contract rollback is required.

## Done When

- Tests and required gates pass.
- Browser screenshot and listening evidence are reviewed.
- Diff stays within the allowed paths and preserves unrelated edits.
