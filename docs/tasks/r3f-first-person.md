# R3F First-Person Exploration

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/r3f-first-person`

## Worktree Path

- `.worktrees/r3f-first-person`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/r3f-first-person.md`

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
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/r3f-first-person.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是在 packages/r3f-adapter 和 P0 预留的 /?scenario=r3f-first-person 中完成第一人称探索端到端验证。
严格遵守 Allowed Paths / Forbidden Paths；不要改 public contracts、package.json、pnpm-lock.yaml，也不要新增 Rapier/物理依赖。
只能使用 apps/game/src/harness/scenarios/r3f-first-person/** 和 tests/smoke/r3f-first-person.spec.ts；不要修改 apps/game 其他文件。
若发现必须改 apps/game 其他文件、shared fixture、contracts、依赖、或任务卡外路径，停止并在 review packet 中说明需要 public-core/integration follow-up，不要扩大范围。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/r3f-first-person.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

Implement first-person exploration presentation in `r3f-adapter` using the P0
`r3f-first-person` harness entry.

## Context

The harness entry is `/?scenario=r3f-first-person`.

This task turns the reserved P0 shell into an end-to-end R3F first-person
presentation slice. It is intentionally not a production Navi flow task: the
adapter proves first-person camera, movement, focus, interaction callbacks,
fallback rendering, and observable harness evidence while directors and
gameplay remain outside this branch.

## Design Intent

- Match the engine-style split used by Unity/Godot/Unreal-like architectures:
  the adapter owns the first-person rig mechanics, while the harness owns only
  demo state, readouts, and smoke evidence.
- Keep `apps/game/src/harness/**` as demonstration and verification code, not
  formal gameplay runtime. The reusable first-person capability must live in
  `packages/r3f-adapter`.
- Prove the first-person player verbs that matter for the vertical slice:
  boot, look, move, clamp, focus, interact, reset to spawn, local map change,
  and missing model fallback.
- Keep the implementation P0-sized. Do not introduce physics, navmesh,
  production collision, general map routing, or input binding integration.

## Architecture Route

- Implement an adapter-owned `FirstPersonRig` path for `ExplorationStage3D`
  when `cameraMode="first-person"` and `inputLock="none"`.
- Use `@react-three/drei` `PointerLockControls` for first-person look. Pointer
  Lock is a formal feature, but automated smoke may fall back and must record
  browser permission limitations if the environment cannot grant lock reliably.
- Keep high-frequency pose/camera mutation inside R3F scene components and
  report low-frequency observable state through callbacks/readouts.
- Export pure helper functions from `@v-ronpa/r3f-adapter` for AABB clamp and
  hotspot focus calculation so boundary behavior is unit-testable without a
  browser.
- Do not put gameplay rules in R3F. Interact callbacks may report the focused
  interactable and its action shape; they must not grant inventory/evidence or
  submit gameplay outcomes.

## Functional Requirements

- First-person view boots from `WorldMapDef.spawn` or
  `WorldMapDef.cameraRig.position`; use a stable eye height and field of view
  from the map when available.
- WASD movement updates the first-person pose on the X/Z plane and clamps the
  camera position to `WorldMapDef.walkBounds`.
- A reset-spawn command returns the pose to the current map spawn/camera rig.
- Pointer Lock look changes facing direction and drives hotspot focus.
- Hotspot focus is based on both facing direction and interactable distance.
  The focused interactable must be observable by the harness.
- Interact triggers the focused interactable callback and updates harness HUD
  state with the interactable id and action type.
- A `change-map` interactable may perform a scenario-local map switch between
  existing vertical-slice maps. Do not implement a general map router in the
  adapter.
- glTF/gltf map assets should load through existing R3F/drei dependencies. If
  a model is unavailable or fails to load, render a clear primitive fallback
  scene instead of leaving a blank canvas.
- The `r3f-first-person` scenario must expose smoke-readable HUD/readout state
  for pose, focus, last action, current map, fallback status, and pointer lock.

## Constraints

- R3F owns presentation only, not gameplay rules.
- Use simple AABB clamp, not Rapier or new dependencies.
- Model assets may be missing; provide primitive fallback.
- Use only already-installed dependencies. Do not add `@react-three/rapier`,
  postprocessing, accessibility scene helpers, or loader packages.
- Do not modify shared vertical-slice fixtures. If a missing-model case is
  needed, create a scenario-local map variant under the allowed scenario path.
- Do not modify app-wide harness registration, shared `ScenarioFrame`, global
  styles, public assets, or app entrypoints.
- If implementation requires public contracts, shared fixtures, app-wide
  harness files, or dependencies, stop and record a public-core/integration
  follow-up in the review packet instead of widening scope.

## Allowed Paths

- `packages/r3f-adapter/**`
- `apps/game/src/harness/scenarios/r3f-first-person/**`
- `tests/smoke/r3f-first-person.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Honor `WorldMapDef`, `walkBounds`, `CameraControlMode`, and `InputLockState`.

The adapter may add package-local TypeScript props and exported helpers for
this task, but must not change `packages/contracts` or
`packages/presentation-contracts`.

Expected adapter API shape:

- Preserve existing `ExplorationStage3D` usage.
- Add only minimal observation/control props needed by the scenario, such as
  pose/focus/interact/fallback/pointer-lock callbacks, reset signal, and
  interact signal.
- Export pure helper functions for clamp and focus tests. These helpers are
  public package exports, so keep their names and behavior narrow and stable.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| First-person view boots | `test-results/r3f-first-person.png` and visible canvas |
| Pointer Lock path exists | Smoke state/readout; fallback risk recorded if denied |
| WASD movement updates pose | Scenario HUD/readout |
| Movement clamps to AABB | Adapter unit test and smoke readout |
| Spawn reset | Scenario command and pose readout |
| Hotspot focus callback | Scenario HUD/readout |
| Interact callback | Scenario HUD/readout with id/action type |
| Scenario-local map switch | Scenario HUD/readout shows map change |
| Missing model fallback | `test-results/r3f-first-person-fallback.png` |

## Harness Scenario Requirements

- Use only `apps/game/src/harness/scenarios/r3f-first-person/**`.
- Keep the DOM HUD compact enough that the playfield remains readable.
- Add commands or controls only inside the scenario folder.
- Expose stable `data-testid` readouts for:
  - current pose
  - focused interactable
  - last action
  - current map
  - fallback status
  - pointer-lock status
- Use the existing `verticalSliceMaps` as source maps. Any missing-model map
  variant must be local to the scenario file/folder.
- Local map switching is allowed only as harness demonstration. It is not a
  substitute for future Navi director map flow.

## Regression Requirements

Required regression cases:

- Normal path: move/look/focus/interact.
- Boundary path: movement clamps at room bounds.
- Fallback path: missing glTF still renders primitives.
- Map path: door interaction switches the scenario-local current map.
- Pointer Lock path: activation is attempted and observable; if browser
  automation denies lock, the test must still record that limitation.

Test placement:

- `packages/r3f-adapter/**`
- `tests/smoke/r3f-first-person.spec.ts`

Adapter unit tests must cover:

- clamp keeps an in-bounds vector unchanged.
- clamp clips below min and above max AABB boundaries.
- focus selects an interactable when facing it within radius.
- focus rejects targets outside radius or outside the facing threshold.

Smoke test must cover:

- route boots at `/?scenario=r3f-first-person`.
- Pointer Lock activation path is attempted and reflected in readout.
- movement changes pose readout.
- movement cannot exceed `walkBounds`.
- focus readout changes when facing/near a hotspot.
- interact updates HUD/readout.
- door interaction switches the scenario-local map.
- missing-model variant renders fallback and produces a screenshot.
- screenshots are saved to:
  - `test-results/r3f-first-person.png`
  - `test-results/r3f-first-person-fallback.png`

## Dependency Changes

None.

## CCR Triggers

Any new public contract, package dependency, or app-wide harness change.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm --filter @v-ronpa/game build
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/r3f-first-person.md
```

## Programmatic Acceptance

Build, smoke, and subsystem validation pass.

## Manual Acceptance

Reviewer checks screenshot readability, confirms the playfield is not blocked by
HUD chrome, and verifies that fallback rendering is visibly non-blank.

## Explicit Non-Goals

- No Rapier, navmesh, full collision proxy resolver, or production physics.
- No general map router or Navi director integration.
- No `InputBindingMap` implementation.
- No changes to public contracts, presentation contracts, shared fixtures,
  global harness files, app entrypoints, package manifests, or lockfile.
- No production asset pipeline work or new asset files outside allowed paths.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/r3f-first-person/**` and
`tests/smoke/r3f-first-person.spec.ts` after integration.

## Review Packet

- Changed files summary.
- Test output, including Required Gates.
- Screenshot paths:
  - `test-results/r3f-first-person.png`
  - `test-results/r3f-first-person-fallback.png`
- Residual risks:
  - no production physics/collision system in this P0 slice.
  - Pointer Lock automation may depend on browser permission behavior.
  - director/input integration remains a follow-up.
- Follow-up notes if the implementation discovers a need for public-core or
  integration changes.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No save migration required.

## Done When

- Required tests pass.
- Diff stays inside allowed paths.
