# VN Runtime Goal QA

## Objective

对 VN Runtime 基建重构做二次校验和任务完成度推进。目标不是确认“相关文件已修改”，而是确认业务实现、架构边界、资源引用、测试门禁和文档状态都与 PLAN (5).md 一致。

## Primary Source

- docs/PLAN.md   VN Runtime 基建重构计划。
- 当前 working tree。
- package scripts、boundary validation、smoke、unit tests、architecture docs。

## Definition of Done

任务只有在以下条件全部满足时才算完成：

1. `packages/app-vn-runtime` 是 VN story runtime loop 的唯一共享实现。
2. `game-harness` 和 `game-a` 都通过共享 runtime 接入 VN loop。
3. app 层 wrapper 只做 app-specific wiring，不重新实现 VN loop。
4. 旧 helper、旧 re-export、兼容别名、私有 runtime loop、半接线/no-op 路径全部清理。
5. 所有真实资源引用都接入统一的新方案，不存在 harness/game-a 资源交叉污染。
6. `app-vn-dispatch`、`app-vn-session`、`app-vn-shell` 的职责边界保持清晰。
7. 单测、smoke、boundary guard、baseline gate 均正常通过。
8. 需要更新的活跃架构文档已更新；历史 archive/CCR 不做无关改写。
9. 不引入计划外大范围重构；确需合同或 IR 变更时补齐 CCR、合同测试和 smoke。

## Required Verification Matrix

Codex 必须建立并维护以下矩阵，不能只凭文件名或 import 结论判断完成：

| Plan Item | Code Evidence | Runtime Path Evidence | Test/Gate Evidence | Status | Fix Needed |
|---|---|---|---|---|---|
| Shared app-vn-runtime runtime loop | package exports, hook/core layering | harness/game-a both call shared runtime | unit/smoke/baseline | pass/fail | yes/no |
| Harness thin wrapper | useHarnessShowcaseRuntimeAdapter | Navi/Trial/R3F/showcase/debug only | harness glue tests | pass/fail | yes/no |
| Game A thin wrapper | useGameAVnRuntime | entry/source/settings/asset resolver only | game-a smoke | pass/fail | yes/no |
| Resource unification | manifests/public/assets/resolvers | AudioPort/VideoPort/AudioHandle/media-save path | media tests/smoke | pass/fail | yes/no |
| Dispatch/session/shell boundaries | package imports and APIs | no browser timers/ports/React state in dispatch | boundary guard | pass/fail | yes/no |
| Cleanup guard | validate-boundaries or temp guard | old names and direct low-level imports blocked | guard command | pass/fail | yes/no |
| Save/restore cleanup | runtimeWait/reveal/voice/bleep/movie/Pixi cleanup | real restore/reset path | unit/smoke | pass/fail | yes/no |
| Docs | docs/architecture, subsystem fanout, harness gates, worktree flow | active docs only | review result | pass/fail | yes/no |

## Hard Negative Signals

Any of the following means the task is not complete:

- A local VN loop still exists in `game-harness` or `game-a`.
- `game-a` directly imports low-level VN packages where runtime API should be used.
- `app-vn-dispatch` owns browser timers, media ports, React state, or runtime side effects.
- `app-vn-shell` absorbs runtime behavior.
- A resource path is hardcoded instead of resolved through the new asset/runtime path.
- `game-a` reuses harness public resources.
- movie, Pixi wait, dialog reveal, voice gate, toast, bleep, or restore cleanup is no-op or half-wired.
- Tests were removed instead of migrated.
- Smoke passes only because coverage was weakened.
- `pnpm validate:baseline` fails or was not run without explicit reason.
- Cleanup guard is absent, not wired, or not run.
- Documentation still describes the old architecture as active.

## Required Business Runtime Checks

Verify actual behavior for both `game-harness` and `game-a` where applicable:

1. boot / advance / choice / input / runtime wait / presentation wait.
2. dialog reveal pacing.
3. manual reveal completion.
4. hidden dialog instant reveal.
5. AUTO schedule.
6. SKIP schedule.
7. voice auto gate: ended / failed / stopped.
8. 500ms post voice delay.
9. skip/manual clear behavior.
10. BGM / SFX / voice / bleep / movie execution.
11. missing asset diagnostics.
12. movie overlay lifecycle.
13. Pixi `wait!` task observation.
14. media command path.
15. save/load restore cleanup.
16. reset cleanup.
17. settings interaction.
18. app-specific glue: Navi overlay, Trial entry/exit, R3F/showcase/debug.

## Required Commands

Run the strongest available equivalents in this repository:

```sh
pnpm validate:baseline