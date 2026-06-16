# Pixi VN Presenter

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/pixi-vn-presenter`

## Worktree Path

- `.worktrees/pixi-vn-presenter`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/pixi-vn-presenter.md`

## Worktree Environment

Run once after the worktree is created:

```bash
pnpm setup:worktree-env
```

This creates an ignored `.env.worktree` with a worktree-specific
`PORT/VITE_DEV_PORT`. Vite and Playwright both read this file so parallel
worktrees do not share the same dev server.

## Thread Startup Prompt

```text
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/pixi-vn-presenter.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是在 packages/pixi-presenter 和 P0 预留的 /?scenario=pixi-vn 中完成立绘占位、简单效果和缺资源 fallback 验证。
严格遵守 Allowed Paths / Forbidden Paths；不要改 public contracts、presentation contracts、package.json、pnpm-lock.yaml。
只能使用 apps/game/src/harness/scenarios/pixi-vn/** 和 tests/smoke/pixi-vn.spec.ts；不要修改 apps/game 其他文件。
若发现必须改 apps/game 其他文件、shared fixture、contracts、依赖、或任务卡外路径，停止并在 review packet 中说明需要 public-core/integration follow-up，不要扩大范围。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-vn-presenter.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

Render VN placeholder portraits, harness portrait assets, missing-asset
fallbacks, and simple VN effects in `pixi-presenter` using the P0
`/?scenario=pixi-vn` harness entry.

The finished task should make the Pixi VN layer understandable from one smoke
screenshot: at least one portrait loaded from the existing harness assets, one
intentional missing portrait rendered through the fallback path, slot placement
for left/center/right planned through a deterministic layout formula, and
flash/shake/fadeIn effects visible enough for reviewer evidence.

## Context

The harness entry is `/?scenario=pixi-vn`. Image assets are expected under
`apps/game/public/harness/portraits/**`, but may be missing during development.
Existing assets may be referenced by URL, but this task must not edit
`apps/game/public/**` or introduce shared fixtures.

This is a presenter/harness thin slice, not a production animation or portrait
pipeline. It should prove that the current public `PresentationCommand` shapes
can drive a Pixi VN surface without contract changes.

## Constraints

- Pixi owns 2D presentation only.
- Use imagegen harness assets when present.
- Provide a programmatic fallback when assets are missing.
- Keep DOM ownership intact: text-heavy dialog, menus, inspector surfaces, and
  accessibility-sensitive interactions stay out of `pixi-presenter`.
- Keep R3F ownership intact: no 3D camera, stage, or GLB behavior belongs in
  this task.
- Keep all Pixi implementation details internal to `packages/pixi-presenter`;
  do not add public exports unless a follow-up CCR explicitly approves it.
- Do not introduce a resource manifest, shared asset fixture, dependency, or
  public configuration surface for this line.
- Do not turn the Pixi effect scheduler into a story scheduler, input blocker,
  public effect lifecycle, or second source of truth for `PresentationPerform`.

## Allowed Paths

- `packages/pixi-presenter/**`
- `apps/game/src/harness/scenarios/pixi-vn/**`
- `tests/smoke/pixi-vn.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Honor `PresentationCommand` and `PresenterPort`.

No contract changes are allowed. The presenter must consume existing command
types only:

- `set-background` draws the screenshot-friendly VN plate/background.
- `char-enter` resolves optional `portraitId`, chooses the slot, and renders a
  loaded image or fallback portrait.
- `flash` and `shake` run through the internal effect scheduler.
- Unknown or non-Pixi-relevant commands remain no-op safe in the visual layer
  while preserving the current memory-presenter snapshot behavior.
- `PresenterPort.apply`, `PresenterPort.snapshot`, and `clear` remain the only
  contract-observable surface. Any Pixi scheduler state is renderer-private and
  must not require new fields on `PresenterPort`, `PresentationSnapshot`, or
  `PresentationPerform`.

If the desired behavior cannot be expressed with the existing
`PresentationCommand` or `PresenterPort`, stop and write the need into the
review packet as a public-core/integration follow-up.

## Functional Requirements

- Portrait asset resolution:
  - Use a local naming convention only: `portrait:felix:neutral` resolves to
    `/harness/portraits/felix-neutral.png`.
  - Keep the resolver private to `packages/pixi-presenter`; it is not a shared
    asset manifest, content pipeline, or `RuntimeAsset` policy.
  - Load image assets with Pixi `Assets.load`.
  - If loading fails, draw a visible labeled fallback portrait and emit
    `console.warn`, not `console.error`.
- Portrait rendering:
  - Use single-layer portraits for this task.
  - Plan layout with deterministic left/center/right slot formulas based on the
    renderer size, even if the available asset set is small.
  - Avoid layered expression state, sprite sheets, Spine, Live2D, particles, or
    production character-art abstractions.
- Effects:
  - Implement an internal Pixi ticker-driven effect queue/scheduler for
    fadeIn, flash, and shake.
  - The scheduler may manage queueing, concurrent active effects, completion,
    and clear/destroy cleanup.
  - The scheduler must remain package-internal and must not introduce public
    animation APIs or contract fields.
  - The scheduler is a visual executor only. It must not decide StoryEngine
    advance timing, block user input, mutate presentation contracts, or replace
    the memory presenter as the snapshot source.
- Harness scenario:
  - The default `pixi-vn` scene should show three slots: at least one existing
    harness portrait asset, one intentional missing portrait fallback, and one
    additional visible portrait state.
  - Replay/Clear/effect controls should be real scenario-local interactions.
    Use local scenario state/keying rather than editing shared `PixiLayer` or
    app-wide harness files.
  - Keep coverage focused on VN presentation commands. Do not expand this task
    into Trial overlays, R3F staging, or global scenario routing.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Existing portrait asset loads | `/?scenario=pixi-vn` smoke screenshot shows an image-backed portrait |
| Missing portrait fallback | Smoke screenshot shows the labeled fallback portrait and no console error |
| `char-enter` slot rendering | Package test or smoke verifies left/center/right slot placement is represented |
| Fade/flash/shake effects | Package scheduler test plus smoke screenshot/effect trigger evidence |
| Unknown non-Pixi command | Package test verifies no throw and memory snapshot behavior remains intact |
| Replay/Clear controls | Smoke verifies scenario-local controls are functional |
| Private resolver/scheduler boundary | Review confirms no new manifest, public animation API, or contract fields |

## Regression Requirements

Required regression cases:

- Normal path: a `portraitId` with an existing harness asset resolves and
  renders through Pixi.
- Boundary path: a deliberately missing `portraitId` falls back cleanly,
  remains visible, and only emits `console.warn`.
- Layout path: left/center/right slots are computed deterministically from the
  renderer size.
- Effect path: queued fadeIn/flash/shake effects tick, complete, and clean up
  without leaking active effects after clear/destroy.
- No-op path: an unknown or non-Pixi-relevant command does not crash and does
  not require contract changes.
- Harness path: `/?scenario=pixi-vn` boots, controls work, the Pixi canvas is
  visible, and screenshot evidence is captured at `test-results/pixi-vn.png`.

Test placement:

- `packages/pixi-presenter/**`
- `tests/smoke/pixi-vn.spec.ts`

Package tests should prefer pure helper/scheduler coverage and avoid requiring
a browser WebGL context. Real canvas rendering evidence belongs in the
Playwright smoke test.

## Dependency Changes

None.

## CCR Triggers

Any public presentation contract, dependency, or app-wide harness change.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm test -- packages/pixi-presenter
pnpm test:smoke -- pixi-vn.spec.ts
pnpm --filter @v-ronpa/game build
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-vn-presenter.md
```

## Programmatic Acceptance

- Targeted `pixi-presenter` package tests pass.
- Targeted `pixi-vn` smoke test passes and writes
  `test-results/pixi-vn.png`.
- App production build passes.
- Final subsystem validation passes with
  `BASE_REF=integration/v-ronpa-baseline`.
- No `console.error` is emitted during smoke. Expected missing-asset
  `console.warn` is allowed.

## Manual Acceptance

Reviewer checks screenshot evidence for portrait placement and effect
readability:

- loaded portrait asset is visually distinct from fallback art;
- missing portrait fallback is clearly labeled;
- left/center/right placement intent is readable;
- flash/shake/fadeIn effects do not obscure the harness UI;
- Replay/Clear/effect controls are usable without app-wide harness changes.

## Stop Conditions And Follow-Ups

Stop instead of widening scope if the work requires any of the following:

- editing `apps/game` outside `apps/game/src/harness/scenarios/pixi-vn/**`;
- editing `apps/game/public/**`, shared fixtures, route registries, app-wide
  styles, `PixiLayer`, public contracts, or presentation contracts;
- adding dependencies or touching `package.json` / `pnpm-lock.yaml`;
- adding new public command fields, presenter APIs, or asset manifests.
- adding public effect lifecycle fields or treating Pixi scheduler state as the
  cross-module source of truth.

Record the blocked need in the review packet as a public-core or integration
follow-up.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/pixi-vn/**` and
`tests/smoke/pixi-vn.spec.ts` after integration.

## Review Packet

- Changed files summary.
- Test output for targeted package tests, targeted smoke, app build, and final
  subsystem validation.
- Screenshot path: `test-results/pixi-vn.png`.
- Note any expected `console.warn` from intentional missing portrait fallback.
- Residual risks, especially anything deferred to public-core/integration.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No save migration required.

## Done When

- Required tests pass.
- Diff stays inside allowed paths.
