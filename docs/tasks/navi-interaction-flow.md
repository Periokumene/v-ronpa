# Navi Interaction Flow

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/navi-interaction-flow`

## Worktree Path

- `.worktrees/navi-interaction-flow`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/navi-interaction-flow.md`

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
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/navi-interaction-flow.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是在 packages/gameplay、packages/navi-director 和 P0 预留的 /?scenario=navi-interaction 中完成交互流端到端验证。
严格遵守 Allowed Paths / Forbidden Paths；不要改 public contracts、package.json、pnpm-lock.yaml。
只能使用 apps/game/src/harness/scenarios/navi-interaction/** 和 tests/smoke/navi-interaction.spec.ts；不要修改 apps/game 其他文件。
若发现必须改 apps/game 其他文件、shared fixture、contracts、依赖、或任务卡外路径，停止并在 review packet 中说明需要 public-core/integration follow-up，不要扩大范围。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/navi-interaction-flow.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

Complete the Navi interaction flow across `packages/gameplay`,
`packages/navi-director`, and the reserved P0 harness entry
`/?scenario=navi-interaction`.

This task proves the two-step player interaction loop used by Navi exploration:
move to a `PlayerPose`, focus the nearest valid interactable, then confirm the
focused action. It must cover item grants, evidence grants, map changes, VN
overlay start/close, and no-op boundaries without touching public contracts,
shared fixtures, app-wide harness files, or dependencies.

## Context

The harness entry is `/?scenario=navi-interaction`.

The P0 harness already reserves the scenario route and folder. This worktree
owns the interaction behavior behind that fixed entry, not the global app
registry, shared fixture definitions, or production visual adapters.

## Functional Intent

- Focus the nearest interactable from `NaviRuntimeState.playerPose.position`
  using `WorldMapDef.interactables[].position` and `radius`.
- Confirm the currently focused interactable and route its
  `InteractableDef.action` to the correct owner:
  - `grant-item` mutates gameplay inventory state.
  - `grant-evidence` mutates gameplay evidence state.
  - `start-script` enters Navi `vn2d-overlay`, sets `overlayScript`, and uses
    `inputLock: dialog`.
  - `change-map` updates Navi map state and player pose.
- Closing an overlay returns to Navi `walk`; closing while already in `walk`
  is a no-op.
- Empty-space focus, missing pose, missing active interactable, and invalid
  interactable ids must be safe no-ops.

## Design And Architecture Intent

- Keep spatial and outcome logic pure in `packages/gameplay`; it must remain
  independent from React, DOM, Pixi, R3F, Dexie, Howler, and harness UI.
- Keep Navi substate and interaction orchestration in `packages/navi-director`.
- Use a layered flow: gameplay decides nearest target and action outcome;
  navi-director applies those decisions to Navi/GamePlay runtime state.
- Implement the harness as a local scenario only, using local state such as
  `useReducer` inside `apps/game/src/harness/scenarios/navi-interaction/**`.
- Do not connect real StoryEngine, Pixi, R3F, DOM dialog, collision,
  yaw/frustum, occlusion, or production navigation systems in this task.
- For `change-map`, prefer `action.pose` when present; when it is missing,
  derive `playerPose.position` from the target map `spawn` with `yaw: 0` and
  `pitch: 0`.

## Constraints

- Do not edit shared contracts.
- Do not edit shared fixtures.
- Do not edit app files outside the `navi-interaction` scenario folder.
- Do not add dependencies.
- Do not widen scope to StoryEngine, Pixi, R3F, DOM dialog, collision, camera
  yaw/frustum, occlusion, or production app routes.

## Allowed Paths

- `packages/gameplay/**`
- `packages/navi-director/**`
- `apps/game/src/harness/scenarios/navi-interaction/**`
- `tests/smoke/navi-interaction.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `apps/game/src/harness/fixtures/**`
- `apps/game/src/harness/ScenarioFrame.tsx`
- `apps/game/src/harness/registry.tsx`
- `apps/game/src/harness/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts And Dependency Changes

Honor `PlayerPose`, `WorldMapDef.walkBounds`, `NaviRuntimeState.playerPose`,
and `InteractableDef.action`.

No public contract changes and no dependency changes are allowed. If
implementation requires changes to contracts, shared fixtures, app-wide harness
files, or dependencies, stop and record the need for a public-core or
integration follow-up in the review packet.

## Implementation Requirements

- In `packages/gameplay`, ensure nearest-interactable selection returns the
  closest interactable inside radius, with stable tie behavior by map order.
- Preserve renderer-independent outcome resolution for `grant-item`,
  `grant-evidence`, `start-script`, `change-map`, and character state actions.
- In `packages/navi-director`, add focused interaction helpers for:
  - focusing the nearest interactable from current pose;
  - confirming the active interactable;
  - preserving no-op behavior for missing pose, missing active focus, and
    invalid interactable ids;
  - applying map changes with explicit pose or target-map spawn fallback.
- In the scenario harness:
  - use existing vertical-slice fixtures by import only;
  - expose move presets for notebook, keycard, witness, classroom door, and
    empty space;
  - expose commands for focus nearest, confirm interaction, and close overlay;
  - display active map, pose, active interactable, Navi substate, input lock,
    inventory, evidence, and last outcome/action with stable `data-testid`s.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Focus nearest interactable | Unit test, scenario state, smoke assertion, screenshot |
| Item grant | Unit test, scenario inventory state, smoke assertion |
| Evidence grant | Unit test, scenario evidence state, smoke assertion |
| Map change | Unit test, scenario active map/player pose, smoke assertion |
| Start script / close overlay | Unit test, scenario substate/input lock/overlay script, smoke assertion |
| Empty-space no-op | Unit test, scenario state, smoke assertion |

## Regression Requirements

Required regression cases:

- Normal path: focus nearest, item grant, evidence grant, script start, and
  map change.
- Boundary path: no nearby interactable returns no-op.
- No-op path: confirm with no active interactable does not mutate gameplay.
- No-op path: closing overlay from `walk` remains `walk`.
- Map boundary: change-map without explicit pose uses the target map `spawn`.

Test placement:

- `packages/gameplay/src/exploration.test.ts`
- `packages/navi-director/src/index.test.ts`
- `tests/smoke/navi-interaction.spec.ts`

## Dependency Changes

None.

## CCR Triggers

Any public contract change, shared fixture change, app-wide harness change, or
dependency change.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm vitest run packages/gameplay packages/navi-director
pnpm test:smoke -- tests/smoke/navi-interaction.spec.ts
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/navi-interaction-flow.md
```

Smoke screenshots must include:

- `test-results/navi-interaction-focus.png`
- `test-results/navi-interaction-grants.png`
- `test-results/navi-interaction-overlay.png`
- `test-results/navi-interaction-map.png`

## Programmatic Acceptance

- Package tests pass.
- Navi interaction smoke test passes and writes the expected screenshots.
- Final subsystem validation passes.
- No browser console errors are emitted during the smoke test.

## Manual Acceptance

Reviewer confirms the diff is limited to allowed paths and uses the fixed
scenario entry. Reviewer also confirms the scenario makes the interaction state
observable without relying on shared harness edits.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/navi-interaction/**` and
`tests/smoke/navi-interaction.spec.ts` after vertical-slice integration accepts
the behavior.

## Review Packet

- Changed files summary.
- Test command output and pass/fail status.
- Smoke screenshot paths:
  - `test-results/navi-interaction-focus.png`
  - `test-results/navi-interaction-grants.png`
  - `test-results/navi-interaction-overlay.png`
  - `test-results/navi-interaction-map.png`
- Residual risks, explicitly noting that this line does not implement real
  StoryEngine, Pixi, R3F, DOM dialog, collision, yaw/frustum, occlusion, shared
  fixture changes, public contract changes, or app-wide harness changes.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No save migration required. Reverting this task should only remove allowed-path
package changes, the local `navi-interaction` scenario implementation, and
`tests/smoke/navi-interaction.spec.ts`.

## Done When

- Required package tests pass.
- Navi interaction smoke test passes and writes the expected screenshots.
- Final subsystem validation passes.
- Diff stays inside allowed paths.
- Review packet reports changed files, test results, screenshot paths, and
  residual risks.
